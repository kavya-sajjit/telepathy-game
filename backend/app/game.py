"""Room state machine. Pure logic — no sockets — so it is easy to test."""
from __future__ import annotations

import random
import string
import time
from dataclasses import dataclass, field
from itertools import combinations

from .packs import DIFFICULTIES, Prompt, library

MAX_PLAYERS = 6
NAME_MAX = 16
COLORS = ["#ff7d9c", "#ffcf4a", "#7fd0f5", "#b99bff", "#ff9b54", "#93dc84"]
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"  # no I/O, they look like 1/0
REACTIONS = {"🔥", "😂", "🤯", "🫶", "😭", "👀", "🧠", "✨"}

ROUND_CHOICES = (5, 8, 10, 15)
TIMER_CHOICES = (0, 20, 30, 45, 60)
PACK_CHOICES = ("front", "back", "phrases", "idioms", "mix")


class GameError(Exception):
    """Something the player did that we refuse, with a message they can read."""


@dataclass
class Player:
    id: str
    name: str
    color: str
    connected: bool = True
    guess_key: str | None = None
    guess_display: str | None = None
    guess_offlist: bool = False
    locked: bool = False
    ready: bool = False
    in_round: bool = False          # joined before this round started
    melds: int = 0
    last_seen: float = field(default_factory=time.time)


@dataclass
class Settings:
    pack: str = "front"
    difficulty: str = "mixed"
    rounds: int = 8
    timer: int = 30
    assist: bool = False

    def to_dict(self) -> dict:
        return {"pack": self.pack, "difficulty": self.difficulty, "rounds": self.rounds,
                "timer": self.timer, "assist": self.assist}


def new_code(taken: set[str]) -> str:
    for _ in range(1000):
        code = "".join(random.choice(CODE_ALPHABET) for _ in range(4))
        if code not in taken:
            return code
    raise RuntimeError("ran out of room codes")


class Room:
    def __init__(self, code: str, rng: random.Random | None = None):
        self.code = code
        self.rng = rng or random.Random()
        self.players: dict[str, Player] = {}
        self.host_id: str | None = None
        self.settings = Settings()
        self.phase = "lobby"            # lobby | guessing | reveal | finished
        self.deck: list[Prompt] = []
        self.round_no = 0
        self.deadline: float | None = None
        self.reveal: dict | None = None
        self.history: list[dict] = []
        self.score = 0
        self.streak = 0
        self.best_streak = 0
        self.pair_hits: dict[tuple[str, str], int] = {}
        self.created = time.time()
        self.touched = time.time()

    # ------------------------------------------------------------ helpers
    @property
    def prompt(self) -> Prompt | None:
        if 1 <= self.round_no <= len(self.deck):
            return self.deck[self.round_no - 1]
        return None

    def connected(self) -> list[Player]:
        return [p for p in self.players.values() if p.connected]

    def active(self) -> list[Player]:
        """Players whose answers count this round."""
        return [p for p in self.players.values() if p.connected and p.in_round]

    def touch(self) -> None:
        self.touched = time.time()

    def _require_host(self, pid: str) -> None:
        if pid != self.host_id:
            raise GameError("Only the host can do that.")

    def _fix_host(self) -> None:
        if self.host_id in self.players and self.players[self.host_id].connected:
            return
        live = self.connected()
        if live:
            self.host_id = live[0].id

    # ------------------------------------------------------------ membership
    def join(self, pid: str, name: str) -> Player:
        self.touch()
        name = " ".join(name.split())[:NAME_MAX] or "Mystery"
        if pid in self.players:                       # reconnect / refresh
            p = self.players[pid]
            p.connected = True
            p.name = name
            p.last_seen = time.time()
            self._fix_host()
            return p
        if len(self.players) >= MAX_PLAYERS:
            # Make room by dropping someone who has been gone a while.
            gone = [p for p in self.players.values() if not p.connected]
            if not gone:
                raise GameError(f"Room is full ({MAX_PLAYERS} players max).")
            del self.players[min(gone, key=lambda p: p.last_seen).id]
        taken = {p.name.lower() for p in self.players.values()}
        base, n = name, 2
        while name.lower() in taken:
            name = f"{base[:NAME_MAX - 2]} {n}"
            n += 1
        used = {p.color for p in self.players.values()}
        color = next((c for c in COLORS if c not in used), COLORS[len(self.players) % len(COLORS)])
        p = Player(id=pid, name=name, color=color)
        # Late joiners sit out the current round and jump in on the next one.
        p.in_round = self.phase == "lobby"
        self.players[pid] = p
        if self.host_id is None or self.host_id not in self.players:
            self.host_id = pid
        self._fix_host()
        return p

    def disconnect(self, pid: str) -> None:
        if pid in self.players:
            self.players[pid].connected = False
            self.players[pid].last_seen = time.time()
            self._fix_host()
            self.touch()

    def leave(self, pid: str) -> None:
        self.players.pop(pid, None)
        self._fix_host()
        self.touch()

    # ------------------------------------------------------------ lobby
    def update_settings(self, pid: str, data: dict) -> None:
        self._require_host(pid)
        if self.phase not in ("lobby", "finished"):
            raise GameError("Settings are locked mid-game.")
        s = self.settings
        if data.get("pack") in PACK_CHOICES:
            s.pack = data["pack"]
        if data.get("difficulty") in (*DIFFICULTIES, "mixed"):
            s.difficulty = data["difficulty"]
        if data.get("rounds") in ROUND_CHOICES:
            s.rounds = data["rounds"]
        if data.get("timer") in TIMER_CHOICES:
            s.timer = data["timer"]
        if isinstance(data.get("assist"), bool):
            s.assist = data["assist"]
        self.touch()

    def start(self, pid: str, now: float | None = None) -> None:
        self._require_host(pid)
        if self.phase not in ("lobby", "finished"):
            raise GameError("Game already running.")
        if len(self.connected()) < 2:
            raise GameError("You need at least 2 minds in the room.")
        s = self.settings
        self.deck = library().deal(s.pack, s.difficulty, s.rounds, self.rng)
        self.round_no = 0
        self.score = self.streak = self.best_streak = 0
        self.history = []
        self.pair_hits = {}
        for p in self.players.values():
            p.melds = 0
        self._next_round(now)

    def _next_round(self, now: float | None = None) -> None:
        self.round_no += 1
        if self.round_no > len(self.deck):
            self.phase = "finished"
            self.deadline = None
            return
        self.phase = "guessing"
        self.reveal = None
        for p in self.players.values():
            p.guess_key = p.guess_display = None
            p.guess_offlist = p.locked = p.ready = False
            p.in_round = p.connected
        t = self.settings.timer
        self.deadline = ((now or time.time()) + t) if t else None
        self.touch()

    # ------------------------------------------------------------ guessing
    def guess(self, pid: str, text: str, force: bool = False) -> dict:
        """Lock in a guess. Returns feedback for the guesser only."""
        if self.phase != "guessing" or self.prompt is None:
            raise GameError("No round in progress.")
        p = self.players.get(pid)
        if p is None or not p.in_round:
            raise GameError("You're in from the next round.")
        res = self.prompt.resolve(text[:60])
        if res["status"] == "empty":
            raise GameError("Type something first.")
        if res["status"] == "unknown" and not force:
            return {"status": "unknown", "typed": res["typed"], "display": res["display"],
                    "suggestions": res["suggestions"]}
        p.guess_key = res["key"]
        p.guess_display = res["display"]
        p.guess_offlist = res["status"] == "unknown"
        p.locked = True
        self.touch()
        return {"status": "locked", "display": res["display"],
                "corrected": res["status"] == "corrected", "offlist": p.guess_offlist}

    def unlock(self, pid: str) -> None:
        if self.phase == "guessing" and pid in self.players:
            p = self.players[pid]
            p.locked = False
            p.guess_key = p.guess_display = None

    def everyone_locked(self) -> bool:
        act = self.active()
        return len(act) >= 1 and all(p.locked for p in act) and len(act) >= 2

    def time_up(self, now: float | None = None) -> bool:
        return self.deadline is not None and (now or time.time()) >= self.deadline

    # ------------------------------------------------------------ reveal
    def do_reveal(self) -> dict:
        prompt = self.prompt
        assert prompt is not None
        act = [p for p in self.players.values() if p.in_round]
        groups: dict[str, list[Player]] = {}
        for p in act:
            if p.guess_key:
                groups.setdefault(p.guess_key, []).append(p)
        everyone = len(act) >= 2 and len(groups) == 1 and all(p.guess_key for p in act)
        pairs = sum(len(g) * (len(g) - 1) // 2 for g in groups.values())

        bonus = []
        if everyone:
            result = "meld"
            key = next(iter(groups))
            points = 3
            if key != prompt.top_key and not act[0].guess_offlist:
                points += 1
                bonus.append("deep cut")       # synced on a less obvious answer
            if len(act) >= 3:
                points += 1
                bonus.append("hive mind")
            self.streak += 1
            if self.streak >= 3:
                points += 1
                bonus.append(f"{self.streak}× streak")
            for p in act:
                p.melds += 1
        elif pairs:
            result, points = "partial", pairs
            self.streak = 0
        else:
            result, points = "static", 0
            self.streak = 0
        self.best_streak = max(self.best_streak, self.streak)
        self.score += points

        for g in groups.values():
            for a, b in combinations(sorted(x.id for x in g), 2):
                self.pair_hits[(a, b)] = self.pair_hits.get((a, b), 0) + 1

        opts = prompt.options()
        chosen = {k: [p.id for p in g] for k, g in groups.items()}
        for o in opts:
            o["by"] = chosen.pop(o["key"], [])
        offlist = [{"key": k, "display": next(p.guess_display for p in groups[k]), "pop": 0, "by": ids}
                   for k, ids in chosen.items()]

        self.reveal = {
            "result": result,
            "points": points,
            "bonus": bonus,
            "guesses": {p.id: {"display": p.guess_display, "key": p.guess_key, "offlist": p.guess_offlist}
                        for p in act},
            "options": opts,
            "offlist": offlist,
        }
        self.history.append({"round": self.round_no, "prompt": prompt.text, "result": result,
                             "points": points,
                             "answers": {p.name: p.guess_display for p in act}})
        self.phase = "reveal"
        self.deadline = None
        for p in self.players.values():
            p.ready = False
        self.touch()
        return self.reveal

    def set_ready(self, pid: str) -> bool:
        """Mark ready after a reveal. Returns True when the room should move on."""
        if self.phase != "reveal" or pid not in self.players:
            return False
        self.players[pid].ready = True
        live = self.connected()
        return bool(live) and all(p.ready for p in live)

    def advance(self, now: float | None = None) -> None:
        if self.phase == "reveal":
            self._next_round(now)

    def skip(self, pid: str, now: float | None = None) -> None:
        """Host pushes things along: reveal now, or next round now."""
        self._require_host(pid)
        if self.phase == "guessing":
            self.do_reveal()
        elif self.phase == "reveal":
            self._next_round(now)

    def back_to_lobby(self, pid: str) -> None:
        self._require_host(pid)
        self.phase = "lobby"
        self.round_no = 0
        self.deck = []
        self.reveal = None
        self.deadline = None
        for p in self.players.values():
            p.in_round = True
            p.locked = p.ready = False

    # ------------------------------------------------------------ views
    def summary(self) -> dict:
        rounds = len(self.history)
        melds = sum(1 for h in self.history if h["result"] == "meld")
        partial = sum(1 for h in self.history if h["result"] == "partial")
        sync = round(100 * (melds + 0.5 * partial) / rounds) if rounds else 0
        best_pair = None
        if self.pair_hits:
            (a, b), n = max(self.pair_hits.items(), key=lambda kv: kv[1])
            if a in self.players and b in self.players:
                best_pair = {"ids": [a, b], "hits": n}
        if sync >= 80:
            title = "Literally one brain"
        elif sync >= 60:
            title = "Same wavelength"
        elif sync >= 40:
            title = "Strong signal"
        elif sync >= 20:
            title = "Some static"
        else:
            title = "Different planets"
        return {"rounds": rounds, "melds": melds, "partial": partial, "sync": sync, "title": title,
                "bestStreak": self.best_streak, "bestPair": best_pair, "history": self.history}

    def view(self, for_pid: str | None = None, now: float | None = None) -> dict:
        prompt = self.prompt
        players = [{
            "id": p.id, "name": p.name, "color": p.color, "connected": p.connected,
            "locked": p.locked, "ready": p.ready, "inRound": p.in_round, "melds": p.melds,
            "host": p.id == self.host_id,
        } for p in self.players.values()]
        state: dict = {
            "code": self.code,
            "phase": self.phase,
            "hostId": self.host_id,
            "players": players,
            "settings": self.settings.to_dict(),
            "score": self.score,
            "streak": self.streak,
            "round": None,
            "reveal": self.reveal if self.phase == "reveal" else None,
            "summary": self.summary() if self.phase == "finished" else None,
            "serverNow": int((now or time.time()) * 1000),
        }
        if prompt and self.phase in ("guessing", "reveal"):
            state["round"] = {
                "n": self.round_no,
                "total": len(self.deck),
                "prompt": prompt.text,
                "difficulty": prompt.difficulty,
                "pack": prompt.pack,
                "optionCount": len(prompt.answers),
                "deadline": int(self.deadline * 1000) if self.deadline else None,
                "options": prompt.options() if (self.settings.assist and self.phase == "guessing") else None,
            }
        me = self.players.get(for_pid or "")
        if me:
            state["you"] = {"id": me.id, "guess": me.guess_display, "locked": me.locked,
                            "offlist": me.guess_offlist}
        return state
