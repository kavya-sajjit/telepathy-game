"""Word packs: loading, prompt selection and turning a typed guess into a canonical answer."""
from __future__ import annotations

import difflib
import json
import random
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data" / "packs.json"

# Must match data/build_packs.py so "make A wish" and "make wish" land on the same key.
FILLER = {"a", "an", "the", "one's", "someone's", "something's", "your", "my", "his", "her",
          "their", "our", "oneself", "yourself", "someone", "something", "one"}
DIFFICULTIES = ("easy", "medium", "hard")


def clean(text: str) -> str:
    text = text.lower().replace("’", "'").replace("-", " ").replace("_", " ")
    text = re.sub(r"[^a-z0-9' ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def key_of(text: str) -> str:
    return " ".join(t for t in clean(text).split() if t not in FILLER)


@dataclass
class Prompt:
    id: str
    pack: str
    text: str                       # "sun ____"
    difficulty: str
    answers: list[dict]             # [{key, display, pop}]
    prefix: str | None = None
    suffix: str | None = None
    _by_key: dict[str, dict] = field(default_factory=dict, repr=False)
    _compact: dict[str, str] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        for a in self.answers:
            self._by_key[a["key"]] = a
            self._compact[a["key"].replace(" ", "")] = a["key"]

    @property
    def top_key(self) -> str:
        return self.answers[0]["key"]

    def fill(self, part: str) -> str:
        """Render the full compound/phrase for an off-list answer."""
        if self.prefix:
            return f"{self.prefix} {part}"
        return f"{part} {self.suffix}"

    def resolve(self, raw: str) -> dict:
        """
        Map what a player typed onto an answer key.

        Returns {"status": "ok"|"corrected"|"unknown"|"empty", "key", "display", "typed", "suggestions"}
        """
        text = clean(raw)
        if not text:
            return {"status": "empty"}
        # Players often type the whole thing: "sunflower", "make a wish", "foot ball".
        if self.prefix:
            p = self.prefix
            if text.startswith(p + " "):
                text = text[len(p) + 1:]
            elif text.startswith(p) and text != p and text[len(p):] .replace(" ", "") in self._compact:
                text = text[len(p):]
        if self.suffix:
            s = self.suffix
            if text.endswith(" " + s):
                text = text[: -len(s) - 1]
            elif text.endswith(s) and text != s and text[: -len(s)].replace(" ", "") in self._compact:
                text = text[: -len(s)]
        k = key_of(text)
        if not k:
            return {"status": "empty"}

        hit = self._lookup(k)
        if hit:
            a = self._by_key[hit]
            return {"status": "ok", "key": hit, "display": a["display"], "typed": text}

        # Typos: "dacne" -> "dance". Only for words long enough that a fix is safe.
        if len(k) >= 4:
            close = difflib.get_close_matches(k, list(self._by_key), n=1, cutoff=0.8)
            if close:
                a = self._by_key[close[0]]
                return {"status": "corrected", "key": a["key"], "display": a["display"], "typed": text}

        sugg = difflib.get_close_matches(k, list(self._by_key), n=3, cutoff=0.55)
        return {"status": "unknown", "key": k, "display": self.fill(text), "typed": text,
                "suggestions": [self._by_key[s]["display"] for s in sugg]}

    def _lookup(self, k: str) -> str | None:
        if k in self._by_key:
            return k
        compact = k.replace(" ", "")
        if compact in self._compact:
            return self._compact[compact]
        for variant in (k + "s", k[:-1] if k.endswith("s") else None, k + "es",
                        k[:-2] if k.endswith("es") else None):
            if variant and variant in self._by_key:
                return variant
        return None

    def options(self) -> list[dict]:
        return [{"key": a["key"], "display": a["display"], "pop": a["pop"]} for a in self.answers]


@dataclass
class Pack:
    id: str
    group: str
    title: str
    tagline: str
    example: list[str]
    prompts: list[Prompt]

    def meta(self) -> dict:
        counts = {d: 0 for d in DIFFICULTIES}
        for p in self.prompts:
            counts[p.difficulty] += 1
        return {"id": self.id, "group": self.group, "title": self.title, "tagline": self.tagline,
                "example": self.example, "count": len(self.prompts), "byDifficulty": counts}


class Library:
    def __init__(self, path: Path = DATA):
        raw = json.loads(path.read_text())
        self.sources: list[str] = raw.get("sources", [])
        self.packs: dict[str, Pack] = {}
        for pk in raw["packs"]:
            prompts = [
                Prompt(id=p["id"], pack=pk["id"], text=p["prompt"], difficulty=p["difficulty"],
                       answers=p["answers"], prefix=p["strip"].get("prefix"), suffix=p["strip"].get("suffix"))
                for p in pk["prompts"]
            ]
            self.packs[pk["id"]] = Pack(pk["id"], pk["group"], pk["title"], pk["tagline"], pk["example"], prompts)
        self.by_id = {p.id: p for pk in self.packs.values() for p in pk.prompts}

    def catalog(self) -> list[dict]:
        metas = [p.meta() for p in self.packs.values()]
        total = sum(m["count"] for m in metas)
        metas.append({"id": "mix", "group": "Shuffle", "title": "Mixtape",
                      "tagline": "A bit of everything. Chaos, lovingly curated.",
                      "example": ["??? ____", "compounds · phrases · idioms"], "count": total,
                      "byDifficulty": {d: sum(m["byDifficulty"][d] for m in metas) for d in DIFFICULTIES}})
        return metas

    def deal(self, pack: str, difficulty: str, n: int, rng: random.Random | None = None) -> list[Prompt]:
        rng = rng or random.Random()
        packs = list(self.packs.values()) if pack == "mix" else [self.packs[pack]]
        pool = [p for pk in packs for p in pk.prompts]
        wanted = [p for p in pool if difficulty in ("mixed", p.difficulty)]
        rng.shuffle(wanted)
        picked = wanted[:n]
        if len(picked) < n:  # top up from other tiers rather than run short
            rest = [p for p in pool if p not in picked]
            rng.shuffle(rest)
            picked += rest[: n - len(picked)]
        if difficulty == "mixed":
            order = {"easy": 0, "medium": 1, "hard": 2}
            picked.sort(key=lambda p: order[p.difficulty])  # warm up, then ramp
        return picked


@lru_cache(maxsize=1)
def library() -> Library:
    return Library()
