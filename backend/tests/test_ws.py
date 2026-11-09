"""End-to-end over real WebSockets using FastAPI's TestClient."""
from fastapi.testclient import TestClient

from app.main import app


def drain_until(ws, pred, limit=30):
    for _ in range(limit):
        m = ws.receive_json()
        if pred(m):
            return m
    raise AssertionError("message never arrived")


def state_where(ws, pred):
    return drain_until(ws, lambda m: m["type"] == "state" and pred(m["state"]))["state"]


def test_http_endpoints():
    with TestClient(app) as c:
        assert c.get("/api/health").json()["status"] == "ok"
        packs = c.get("/api/packs").json()["packs"]
        assert {p["id"] for p in packs} >= {"front", "back", "phrases", "idioms", "mix"}
        code = c.post("/api/rooms").json()["code"]
        assert len(code) == 4
        assert c.get(f"/api/rooms/{code.lower()}").json()["code"] == code
        assert c.get("/api/rooms/ZZZZ").status_code == 404


def test_two_player_round_trip_and_reconnect():
    with TestClient(app) as c:
        code = c.post("/api/rooms").json()["code"]
        with c.websocket_connect(f"/ws/{code}") as a, c.websocket_connect(f"/ws/{code}") as b:
            a.send_json({"type": "hello", "playerId": "aaa", "name": "Kavya"})
            drain_until(a, lambda m: m["type"] == "welcome")
            b.send_json({"type": "hello", "playerId": "bbb", "name": "Pooja"})
            st = state_where(a, lambda s: len(s["players"]) == 2)
            assert st["hostId"] == "aaa"

            # non-host can't start
            b.send_json({"type": "start"})
            err = drain_until(b, lambda m: m["type"] == "error")
            assert "host" in err["message"].lower()

            a.send_json({"type": "settings", "settings": {"pack": "phrases", "rounds": 5, "timer": 0}})
            state_where(a, lambda s: s["settings"]["pack"] == "phrases")
            a.send_json({"type": "start"})
            st = state_where(a, lambda s: s["phase"] == "guessing")
            assert st["round"]["n"] == 1 and st["round"]["prompt"].endswith("____")

            a.send_json({"type": "guess", "text": "qwertyuiop"})
            fb = drain_until(a, lambda m: m["type"] == "guess")
            assert fb["status"] == "unknown"
            a.send_json({"type": "guess", "text": "qwertyuiop", "force": True})
            fb = drain_until(a, lambda m: m["type"] == "guess")
            assert fb["status"] == "locked"

            st = state_where(b, lambda s: any(p["locked"] for p in s["players"]))
            assert st["reveal"] is None  # B can't see A's answer yet

            b.send_json({"type": "guess", "text": "qwertyuiop", "force": True})
            st = state_where(b, lambda s: s["phase"] == "reveal")
            assert st["reveal"]["result"] == "meld"
            assert st["score"] >= 3

            a.send_json({"type": "ready"})
            b.send_json({"type": "ready"})
            st = state_where(a, lambda s: s["phase"] == "guessing" and s["round"]["n"] == 2)

        # Both sockets closed. Reconnect as A: same identity, still host.
        with c.websocket_connect(f"/ws/{code}") as a2:
            a2.send_json({"type": "hello", "playerId": "aaa", "name": "Kavya"})
            st = state_where(a2, lambda s: True)
            me = next(p for p in st["players"] if p["id"] == "aaa")
            assert me["connected"] and st["hostId"] == "aaa"
            assert st["round"]["n"] == 2


def test_unknown_room_is_fatal():
    with TestClient(app) as c:
        with c.websocket_connect("/ws/NOPE") as ws:
            assert ws.receive_json()["type"] == "fatal"


def test_server_timer_reveals_round():
    import time
    with TestClient(app) as c:
        code = c.post("/api/rooms").json()["code"]
        from app.main import hub
        with c.websocket_connect(f"/ws/{code}") as a, c.websocket_connect(f"/ws/{code}") as b:
            a.send_json({"type": "hello", "playerId": "t1", "name": "A"})
            b.send_json({"type": "hello", "playerId": "t2", "name": "B"})
            state_where(a, lambda s: len(s["players"]) == 2)
            a.send_json({"type": "settings", "settings": {"timer": 20}})
            state_where(a, lambda s: s["settings"]["timer"] == 20)
            a.send_json({"type": "start"})
            state_where(a, lambda s: s["phase"] == "guessing")
            # Pull the deadline in so the test is quick; the server timer must fire on its own.
            room = hub.rooms[code]
            room.deadline = time.time() + 0.3

            async def rearm():
                hub.arm_timer(code)
            c.portal.call(rearm)
            st = state_where(a, lambda s: s["phase"] == "reveal")
            assert st["reveal"]["result"] == "static"
