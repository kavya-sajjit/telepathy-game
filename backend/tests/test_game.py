import random

import pytest

from app.game import GameError, Room
from app.packs import library


def prompt(pid):
    return library().by_id[pid]


# ------------------------------------------------------------------ packs
def test_packs_load_and_have_content():
    lib = library()
    assert set(lib.packs) == {"front", "back", "phrases", "idioms"}
    for pk in lib.packs.values():
        assert len(pk.prompts) >= 30
        for p in pk.prompts:
            assert len(p.answers) >= 3
            assert p.difficulty in ("easy", "medium", "hard")
            assert len({a["key"] for a in p.answers}) == len(p.answers)


@pytest.mark.parametrize("typed,key", [
    ("flower", "flower"),
    ("Sunflower", "flower"),
    ("sun flower", "flower"),
    ("  SUNGLASSES ", "glasses"),
    ("glass", "glass"),
    ("flowr", "flower"),        # typo fix
])
def test_resolve_front(typed, key):
    r = prompt("front-sun").resolve(typed)
    assert r["status"] in ("ok", "corrected"), r
    assert r["key"] == key


def test_resolve_back_and_phrases():
    assert prompt("back-ball").resolve("football")["key"] == "foot"
    assert prompt("back-ball").resolve("foot-ball")["key"] == "foot"
    mk = prompt("phrase-make")
    assert mk.resolve("a wish")["key"] == mk.resolve("make a wish")["key"] == "wish"
    assert mk.resolve("sense")["status"] == "ok"


def test_resolve_unknown_gives_suggestions():
    r = prompt("front-sun").resolve("zzzz")
    assert r["status"] == "unknown"
    assert r["display"] == "sun zzzz"


def test_deal_respects_difficulty_and_count():
    lib = library()
    deck = lib.deal("front", "easy", 5, random.Random(1))
    assert len(deck) == 5 and all(p.difficulty == "easy" for p in deck)
    mix = lib.deal("mix", "mixed", 15, random.Random(2))
    assert len(mix) == 15 and len({p.id for p in mix}) == 15


# ------------------------------------------------------------------ rooms
def make_room(n=2, **settings):
    room = Room("TEST", random.Random(7))
    ids = [f"p{i}" for i in range(n)]
    for i in ids:
        room.join(i, i.upper())
    if settings:
        room.update_settings("p0", settings)
    return room, ids


def force_prompt(room, pid):
    room.deck[room.round_no - 1] = prompt(pid)


def test_host_and_start_rules():
    room, ids = make_room(1)
    with pytest.raises(GameError):
        room.start("p0")                 # need two players
    room.join("p1", "P1")
    with pytest.raises(GameError):
        room.start("p1")                 # not host
    room.start("p0")
    assert room.phase == "guessing" and room.round_no == 1


def test_meld_partial_static_scoring():
    room, ids = make_room(3, rounds=5, timer=0)
    room.start("p0")
    force_prompt(room, "front-sun")
    top = room.prompt.top_key
    for i in ids:
        assert room.guess(i, top)["status"] == "locked"
    assert room.everyone_locked()
    rv = room.do_reveal()
    assert rv["result"] == "meld"
    assert rv["points"] == 3 + 1          # +1 hive mind (3 players), top answer so no deep cut
    assert room.streak == 1

    room.advance()
    force_prompt(room, "front-sun")
    room.guess("p0", "flower"); room.guess("p1", "sunflower"); room.guess("p2", "set")
    rv = room.do_reveal()
    assert rv["result"] == "partial" and rv["points"] == 1 and room.streak == 0
    flower = next(o for o in rv["options"] if o["key"] == "flower")
    assert sorted(flower["by"]) == ["p0", "p1"]

    room.advance()
    force_prompt(room, "front-sun")
    room.guess("p0", "flower"); room.guess("p1", "set"); room.guess("p2", "glasses")
    assert room.do_reveal()["result"] == "static"


def test_deep_cut_and_streak_bonus():
    room, ids = make_room(2, rounds=5, timer=0)
    room.start("p0")
    for r in range(3):
        force_prompt(room, "front-sun")
        not_top = room.prompt.answers[2]["key"]
        room.guess("p0", not_top); room.guess("p1", not_top)
        rv = room.do_reveal()
        assert rv["result"] == "meld" and "deep cut" in rv["bonus"]
        room.advance()
    assert room.best_streak == 3
    assert room.history[-1]["points"] == 3 + 1 + 1   # meld + deep cut + streak


def test_unknown_word_needs_force_and_shows_offlist():
    room, _ = make_room(2, timer=0)
    room.start("p0")
    force_prompt(room, "front-sun")
    fb = room.guess("p0", "wobble")
    assert fb["status"] == "unknown" and not room.players["p0"].locked
    fb = room.guess("p0", "wobble", force=True)
    assert fb["status"] == "locked" and fb["offlist"]
    room.guess("p1", "wobble", force=True)
    rv = room.do_reveal()
    assert rv["result"] == "meld"
    assert rv["offlist"][0]["display"] == "sun wobble"
    assert "deep cut" not in rv["bonus"]   # no bonus for agreeing on a made-up word


def test_guesses_hidden_until_reveal():
    room, _ = make_room(2, timer=0)
    room.start("p0")
    room.guess("p0", room.prompt.top_key)
    v = room.view("p1")
    assert v["reveal"] is None
    assert v["you"]["guess"] is None
    assert room.view("p0")["you"]["guess"] is not None
    assert all("guess" not in p for p in v["players"])


def test_assist_mode_shows_options():
    room, _ = make_room(2, timer=0, assist=True)
    room.start("p0")
    assert room.view("p0")["round"]["options"]
    room2, _ = make_room(2, timer=0)
    room2.start("p0")
    assert room2.view("p0")["round"]["options"] is None


def test_late_joiner_sits_out_round_then_plays():
    room, _ = make_room(2, timer=0, rounds=5)
    room.start("p0")
    room.join("p2", "Late")
    with pytest.raises(GameError):
        room.guess("p2", "flower")
    room.guess("p0", "x", force=True); room.guess("p1", "x", force=True)
    assert room.everyone_locked()          # late joiner doesn't block the round
    room.do_reveal()
    for p in ("p0", "p1", "p2"):
        room.set_ready(p)
    room.advance()
    assert room.players["p2"].in_round


def test_disconnect_transfers_host_and_reconnect_keeps_identity():
    room, _ = make_room(2)
    room.disconnect("p0")
    assert room.host_id == "p1"
    room.join("p0", "P0 again")
    assert room.players["p0"].connected and len(room.players) == 2


def test_duplicate_names_get_suffix_and_room_caps_at_six():
    room = Room("CAPS")
    for i in range(6):
        room.join(f"x{i}", "Sam")
    names = [p.name for p in room.players.values()]
    assert len(set(names)) == 6
    with pytest.raises(GameError):
        room.join("x7", "Seven")


def test_timer_and_full_game_to_summary():
    room, ids = make_room(2, rounds=5, timer=20)
    room.start("p0", now=1000)
    assert room.deadline == 1020
    assert not room.time_up(now=1010) and room.time_up(now=1021)
    for _ in range(5):
        room.guess("p0", room.prompt.top_key)
        room.guess("p1", room.prompt.top_key)
        room.do_reveal()
        for i in ids:
            moved = room.set_ready(i)
        assert moved
        room.advance(now=1000)
    assert room.phase == "finished"
    s = room.view("p0")["summary"]
    assert s["rounds"] == 5 and s["melds"] == 5 and s["sync"] == 100
    assert s["bestPair"]["hits"] == 5
