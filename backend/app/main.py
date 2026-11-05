"""Telepathy — FastAPI + WebSockets server."""
from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .game import REACTIONS, GameError, Room, new_code
from .packs import library

log = logging.getLogger("telepathy")

ROOM_IDLE_TTL = 60 * 60 * 2       # forget rooms untouched for 2h
EMPTY_ROOM_TTL = 60 * 10          # ...or empty for 10 minutes
MAX_ROOMS = 2000


class Hub:
    """Owns rooms, their sockets and their round timers."""

    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}
        self.sockets: dict[str, dict[str, WebSocket]] = {}
        self.timers: dict[str, asyncio.Task] = {}
        self.locks: dict[str, asyncio.Lock] = {}

    def create(self) -> Room:
        if len(self.rooms) >= MAX_ROOMS:
            self.sweep(force=True)
        code = new_code(set(self.rooms))
        self.rooms[code] = Room(code)
        self.sockets[code] = {}
        self.locks[code] = asyncio.Lock()
        return self.rooms[code]

    def drop(self, code: str) -> None:
        self.rooms.pop(code, None)
        self.sockets.pop(code, None)
        self.locks.pop(code, None)
        t = self.timers.pop(code, None)
        if t:
            t.cancel()

    def sweep(self, force: bool = False) -> None:
        now = time.time()
        for code, room in list(self.rooms.items()):
            empty = not room.connected()
            idle = now - room.touched
            if idle > ROOM_IDLE_TTL or (empty and idle > EMPTY_ROOM_TTL) or (force and empty):
                self.drop(code)

    async def send(self, ws: WebSocket, msg: dict) -> None:
        with contextlib.suppress(Exception):
            await ws.send_json(msg)

    async def broadcast(self, code: str) -> None:
        room = self.rooms.get(code)
        if not room:
            return
        now = time.time()
        await asyncio.gather(*(self.send(ws, {"type": "state", "state": room.view(pid, now)})
                               for pid, ws in list(self.sockets.get(code, {}).items())))

    async def emit(self, code: str, msg: dict) -> None:
        await asyncio.gather(*(self.send(ws, msg) for ws in list(self.sockets.get(code, {}).values())))

    # -------------------------------------------------- round timer
    def arm_timer(self, code: str) -> None:
        old = self.timers.pop(code, None)
        if old:
            old.cancel()
        room = self.rooms.get(code)
        if room and room.phase == "guessing" and room.deadline:
            self.timers[code] = asyncio.create_task(self._timer(code, room.round_no, room.deadline))

    async def _timer(self, code: str, round_no: int, deadline: float) -> None:
        await asyncio.sleep(max(0.0, deadline - time.time()) + 0.15)
        room = self.rooms.get(code)
        if not room:
            return
        async with self.locks[code]:
            if room.phase == "guessing" and room.round_no == round_no:
                room.do_reveal()
        await self.broadcast(code)

    def after_change(self, code: str) -> None:
        """Re-arm or clear the timer whenever the phase may have changed."""
        room = self.rooms.get(code)
        if not room:
            return
        if room.phase == "guessing":
            t = self.timers.get(code)
            if t is None or t.done():
                self.arm_timer(code)
        else:
            t = self.timers.pop(code, None)
            if t:
                t.cancel()


hub = Hub()


async def janitor() -> None:
    while True:
        await asyncio.sleep(60)
        hub.sweep()


@asynccontextmanager
async def lifespan(_: FastAPI):
    library()  # load + validate packs at boot
    task = asyncio.create_task(janitor())
    yield
    task.cancel()


app = FastAPI(title="Telepathy", lifespan=lifespan)

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])


# ------------------------------------------------------------------ HTTP
@app.get("/")
@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "rooms": len(hub.rooms),
            "players": sum(len(r.connected()) for r in hub.rooms.values())}


@app.get("/api/packs")
async def packs() -> dict:
    lib = library()
    return {"packs": lib.catalog(), "sources": lib.sources}


@app.post("/api/rooms")
async def create_room() -> dict:
    room = hub.create()
    return {"code": room.code}


@app.get("/api/rooms/{code}")
async def room_info(code: str) -> dict:
    room = hub.rooms.get(code.upper())
    if not room:
        raise HTTPException(404, "No room with that code.")
    return {"code": room.code, "phase": room.phase, "players": len(room.connected()),
            "full": len(room.players) >= 6}


# ------------------------------------------------------------------ WebSocket
@app.websocket("/ws/{code}")
async def ws_room(ws: WebSocket, code: str) -> None:
    await ws.accept()
    code = code.upper()
    room = hub.rooms.get(code)
    if not room:
        await hub.send(ws, {"type": "fatal", "message": "That room doesn't exist (or it closed). Make a new one!"})
        await ws.close()
        return

    pid: str | None = None
    lock = hub.locks[code]
    try:
        while True:
            msg = await ws.receive_json()
            kind = msg.get("type")
            if kind == "ping":
                await hub.send(ws, {"type": "pong", "t": msg.get("t")})
                continue

            if kind == "hello":
                new_pid = str(msg.get("playerId") or "")[:64]
                if not new_pid:
                    await hub.send(ws, {"type": "error", "message": "Missing player id."})
                    continue
                async with lock:
                    try:
                        room.join(new_pid, str(msg.get("name") or ""))
                    except GameError as e:
                        await hub.send(ws, {"type": "fatal", "message": str(e)})
                        await ws.close()
                        return
                    old = hub.sockets[code].get(new_pid)
                    hub.sockets[code][new_pid] = ws
                    pid = new_pid
                if old is not None and old is not ws:
                    await hub.send(old, {"type": "fatal", "message": "You opened this room in another tab."})
                    with contextlib.suppress(Exception):
                        await old.close()
                await hub.send(ws, {"type": "welcome", "playerId": pid})
                await hub.broadcast(code)
                continue

            if pid is None:
                await hub.send(ws, {"type": "error", "message": "Say hello first."})
                continue

            if kind == "react":
                emoji = msg.get("emoji")
                if emoji in REACTIONS:
                    await hub.emit(code, {"type": "react", "from": pid, "emoji": emoji})
                continue

            reply = None
            async with lock:
                try:
                    if kind == "settings":
                        room.update_settings(pid, msg.get("settings") or {})
                    elif kind == "start":
                        room.start(pid)
                    elif kind == "guess":
                        reply = room.guess(pid, str(msg.get("text") or ""), bool(msg.get("force")))
                        if room.everyone_locked():
                            room.do_reveal()
                    elif kind == "unlock":
                        room.unlock(pid)
                    elif kind == "ready":
                        if room.set_ready(pid):
                            room.advance()
                    elif kind == "skip":
                        room.skip(pid)
                    elif kind == "lobby":
                        room.back_to_lobby(pid)
                    elif kind == "leave":
                        room.leave(pid)
                        hub.sockets[code].pop(pid, None)
                    else:
                        reply = {"status": "error", "message": f"Unknown message {kind!r}"}
                except GameError as e:
                    reply = {"status": "error", "message": str(e)}
                hub.after_change(code)
            if reply is not None:
                await hub.send(ws, {"type": "guess" if kind == "guess" and reply.get("status") != "error"
                                    else "error", **reply})
            await hub.broadcast(code)
            if kind == "leave":
                await ws.close()
                return
    except WebSocketDisconnect:
        pass
    except Exception:  # malformed JSON etc. — drop this socket, keep the room alive
        log.exception("socket error in room %s", code)
    finally:
        if pid and hub.sockets.get(code, {}).get(pid) is ws:
            hub.sockets[code].pop(pid, None)
            async with lock:
                room.disconnect(pid)
                # If the only missing answer was from the person who left, finish the round.
                if room.phase == "guessing" and room.everyone_locked():
                    room.do_reveal()
                elif room.phase == "reveal" and room.connected() and all(p.ready for p in room.connected()):
                    room.advance()
                hub.after_change(code)
            await hub.broadcast(code)
