#!/usr/bin/env python3
"""
Build the Telepathy word packs from open lexical resources.

    python data/build_packs.py --src /path/to/srcdata --out backend/app/data/packs.json

Sources (see data/README.md for links and licences):
  * Princeton WordNet 3.0 (via NLTK)           -> open compounds, phrasal verbs, idioms, glosses
  * SymSpell frequency dictionaries            -> word list (SCOWL ∩ Google Books) + unigram/bigram counts
      frequency_dictionary_en_82_765.txt
      frequency_bigramdictionary_en_243_342.txt
  * MAGPIE corpus (MAGPIE_unfiltered.jsonl)    -> 1.7k idiom types with corpus attestation counts
  * wordfreq                                   -> fallback frequency for words missing from SymSpell

Prompts (stems / verbs / idiom prefixes) are hand-curated in data/curation/.
Answers are always mined from the sources, then filtered by data/curation/blocklist.txt.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path

from nltk.corpus import wordnet as wn
from wordfreq import zipf_frequency

HERE = Path(__file__).resolve().parent
CUR = HERE / "curation"

# Words we strip when comparing phrase answers ("make A wish" == "make wish").
FILLER = {"a", "an", "the", "one's", "someone's", "something's", "your", "my", "his",
          "her", "their", "our", "oneself", "yourself", "someone", "something", "one"}
# Fragments that look like words but are really suffixes.
JUNK_RESTS = {"er", "ers", "ed", "es", "ing", "ings", "ly", "ness", "less", "ful", "ish", "y",
              "s", "able", "ism", "ist", "ment", "age", "al", "ion", "ions", "ie", "ies", "ry"}
SHORT_OK = {"up", "in", "on", "by", "out"}
# Grammar words: only allowed as a compound part when the closed form exists (inside, checkout).
FUNCTION = {"of", "to", "into", "with", "that", "it", "for", "upon", "at", "the", "and", "or", "as",
            "from", "than", "this", "these", "those", "there", "here", "again", "all", "is", "be",
            "in", "on", "up", "out", "off", "down", "over", "through", "away", "back", "by", "about",
            "under", "along", "around", "after", "like", "very", "every", "next", "last", "any", "some",
            "other", "same", "own", "many", "more", "most", "much", "such", "each", "per", "too"}
# Phrase answers that are just a bare preposition ("look at") aren't fun to guess.
BARE_PREP = {"to", "for", "at", "with", "into", "of", "upon", "from", "about", "like", "as", "onto"}


def read_list(name: str) -> list[str]:
    p = CUR / name
    if not p.exists():
        return []
    out = []
    for line in p.read_text().splitlines():
        line = line.split("#", 1)[0].strip().lower()
        if line:
            out.append(line)
    return out


# ---------------------------------------------------------------- frequency
class Freq:
    def __init__(self, src: Path):
        self.uni: dict[str, int] = {}
        for line in (src / "frequency_dictionary_en_82_765.txt").open():
            w, c = line.split()
            self.uni[w] = int(c)
        self.bi: dict[str, int] = {}
        for line in (src / "frequency_bigramdictionary_en_243_342.txt").open():
            a, b, c = line.split()
            self.bi[f"{a} {b}"] = int(c)
        # Calibrate Google-Books counts onto the zipf scale using common words.
        diffs = [math.log10(self.uni[w]) - zipf_frequency(w, "en")
                 for w in list(self.uni)[:4000] if zipf_frequency(w, "en") > 0]
        self.offset = statistics.median(diffs)

    def zipf(self, phrase: str) -> float:
        """Zipf-scale frequency for a word or phrase (0 if unknown)."""
        toks = phrase.split()
        if len(toks) == 1:
            if phrase in self.uni:
                return math.log10(self.uni[phrase]) - self.offset
            return zipf_frequency(phrase, "en")
        # Chain bigrams: a phrase is about as common as its weakest link.
        # Unknown links fall below the dictionary's floor (~6.4M), so treat them as 1.5M.
        counts = [self.bi.get(f"{a} {b}") for a, b in zip(toks, toks[1:])]
        if not any(counts):
            return 0.0
        return math.log10(min(c or 1_500_000 for c in counts)) - self.offset

    def bigram(self, a: str, b: str) -> int:
        return self.bi.get(f"{a} {b}", 0)


# ---------------------------------------------------------------- helpers
WN_LEMMAS = set(wn.all_lemma_names())
# Multiword lemmas that are only ever proper names ("capital_of_the_united_states").
PROPER = set()
for _s in wn.all_synsets():
    for _l in _s.lemmas():
        if "_" in _l.name() and _l.name() != _l.name().lower():
            PROPER.add(_l.name().lower())
for _s in wn.all_synsets():
    for _l in _s.lemmas():
        if _l.name() == _l.name().lower():
            PROPER.discard(_l.name())


def wn_has(*parts: str) -> bool:
    return "_".join(parts) in WN_LEMMAS or "-".join(parts) in WN_LEMMAS


def base_form(word: str) -> str:
    return wn.morphy(word) or word


def gloss_mentions(word: str, part: str) -> bool:
    """Does any WordNet sense of `word` mention `part` in its gloss or hypernyms?"""
    part_forms = {part, base_form(part), part + "s", part + "es"}
    for s in wn.synsets(word):
        text = s.definition().lower()
        text += " " + " ".join(l.replace("_", " ") for h in s.hypernyms() for l in h.lemma_names())
        toks = set(re.findall(r"[a-z]+", text))
        if toks & part_forms:
            return True
    return False


def key_of(text: str) -> str:
    toks = [t for t in re.findall(r"[a-z0-9']+", text.lower()) if t not in FILLER]
    return " ".join(toks)


def pretty_phrase(p: str) -> str:
    p = p.replace("_", " ")
    p = re.sub(r"\bone's\b|\bsomeone's\b", "your", p)
    p = re.sub(r"\boneself\b", "yourself", p)
    return p


def difficulty_metrics(answers: list[dict]) -> tuple[float, float]:
    weights = [10 ** a["z"] for a in answers]
    tot = sum(weights)
    ps = [w / tot for w in weights]
    entropy = -sum(p * math.log(p) for p in ps if p > 0)
    return math.exp(entropy), max(ps)


# ---------------------------------------------------------------- compounds
def mine_compounds(stem: str, side: str, F: Freq, common: set[str], block: set[str]) -> list[dict]:
    found: dict[str, dict] = {}

    def add(part: str, display: str, z: float, src: str):
        a, b = (stem, part) if side == "front" else (part, stem)
        if part in block or f"{a}:{b}" in block or display in block or f"{a} {b}" in block:
            return
        k = key_of(part)
        if not k:
            return
        cur = found.get(k)
        if cur is None or z > cur["z"]:
            found[k] = {"key": k, "display": display, "z": round(z, 2), "src": src}

    # Closed compounds: sunflower, football
    for w, cnt in F.uni.items():
        if w == stem or not w.isalpha():
            continue
        if side == "front":
            if not w.startswith(stem):
                continue
            part = w[len(stem):]
        else:
            if not w.endswith(stem):
                continue
            part = w[: -len(stem)]
        if part in JUNK_RESTS or part not in common:
            continue
        if len(part) < 3 and part not in SHORT_OK:
            continue
        a, b = (stem, part) if side == "front" else (part, stem)
        z = F.zipf(w)
        evidence = (
            wn_has(a, b)
            or F.bigram(a, b) > 2_000_000
            or (w in WN_LEMMAS and gloss_mentions(w, part))
            # gloss names the stem: only trust it when the other half is a solid word
            # and w isn't just an inflection (starred, handled, bedding)
            or (w in WN_LEMMAS and base_form(w) == w and F.zipf(part) >= 3.6
                and gloss_mentions(w, stem))
        )
        if not evidence or z < 2.2:
            continue
        add(part, w, z, "closed")

    # Open compounds from WordNet: ice cream, golf ball
    for lemma in WN_LEMMAS:
        toks = lemma.split("_")
        if len(toks) != 2:
            continue
        a, b = toks
        if side == "front" and a != stem:
            continue
        if side == "back" and b != stem:
            continue
        part = b if side == "front" else a
        if not part.isalpha() or part not in common or part in JUNK_RESTS:
            continue
        if part in FUNCTION and (a + b) not in F.uni:
            continue
        cnt = F.bigram(a, b)
        if cnt < 1_500_000:
            continue
        add(part, f"{a} {b}", F.zipf(f"{a} {b}"), "open")

    # Drop plurals when the singular is also present (sunglass/sunglasses keeps the common one)
    keys = set(found)
    for k in list(found):
        if k.endswith("s") and k[:-1] in keys:
            if found[k]["z"] > found[k[:-1]]["z"]:
                del found[k[:-1]]
            else:
                del found[k]
            keys = set(found)
    return sorted(found.values(), key=lambda a: -a["z"])


# ---------------------------------------------------------------- phrases & idioms
def load_magpie(src: Path) -> Counter:
    c = Counter()
    p = src / "magpie.jsonl"
    with p.open() as fh:
        for line in fh:
            d = json.loads(line)
            if d.get("label") == "i" and d.get("confidence", 0) >= 0.5:
                c[d["idiom"].lower().strip()] += 1
    return c


def phrase_pool(magpie: Counter, F: Freq) -> dict[str, float]:
    """All multiword expressions we know about -> popularity (zipf-ish)."""
    pool: dict[str, float] = {}
    for idiom, n in magpie.items():
        if "," in idiom or ";" in idiom:
            continue
        p = pretty_phrase(idiom)
        pool[p] = max(pool.get(p, 0), F.zipf(p) + 0.35 * math.log10(1 + n) + 0.3)
    for lemma in WN_LEMMAS:
        toks = lemma.split("_")
        if not (2 <= len(toks) <= 5) or not all(t.replace("'", "").isalpha() for t in toks):
            continue
        if lemma in PROPER:
            continue
        p = pretty_phrase(lemma)
        z = F.zipf(p)
        if z <= 0:
            continue
        pool[p] = max(pool.get(p, 0), z)
    for line in read_list("extra_phrases.txt"):
        pool[line] = max(pool.get(line, 0), F.zipf(line) + 0.5, 3.0)
    return pool


def mine_prefix(prefix: str, pool: dict[str, float], block: set[str], max_rest_words: int = 3) -> list[dict]:
    found: dict[str, dict] = {}
    pre = prefix + " "
    for phrase, z in pool.items():
        if not phrase.startswith(pre):
            continue
        rest = phrase[len(pre):]
        if not rest or len(rest.split()) > max_rest_words:
            continue
        if phrase in block or rest in block or f"{prefix}:{rest}" in block:
            continue
        k = key_of(rest)
        if not k or k in BARE_PREP:
            continue
        if k not in found or z > found[k]["z"]:
            found[k] = {"key": k, "display": phrase, "z": round(z, 2), "src": "phrase"}
    return sorted(found.values(), key=lambda a: -a["z"])


def discover_idiom_prefixes(pool: dict[str, float], min_answers: int = 4) -> list[tuple[str, int]]:
    groups = defaultdict(set)
    for phrase in pool:
        toks = phrase.split()
        for k in range(2, len(toks)):
            groups[" ".join(toks[:k])].add(" ".join(toks[k:]))
    return sorted(((p, len(v)) for p, v in groups.items() if len(v) >= min_answers),
                  key=lambda x: -x[1])


# ---------------------------------------------------------------- assembly
def tierize(prompts: list[dict]) -> None:
    eff = sorted(p["_eff"] for p in prompts)
    if not eff:
        return
    lo = eff[len(eff) // 3]
    hi = eff[(2 * len(eff)) // 3]
    for p in prompts:
        e = p.pop("_eff")
        p["difficulty"] = "easy" if e <= lo else ("hard" if e > hi else "medium")


def finish_prompt(pid: str, template: str, strip: dict, answers: list[dict], cap: int = 40) -> dict | None:
    answers = answers[:cap]
    if len(answers) < 3:
        return None
    eff, top = difficulty_metrics(answers)
    zmax = answers[0]["z"]
    for a in answers:
        # 0..100 popularity bar relative to the strongest answer for this prompt
        a["pop"] = max(1, round(100 * 10 ** (a["z"] - zmax)))
        a.pop("src", None)
        a.pop("z", None)
    return {"id": pid, "prompt": template, "strip": strip, "answers": answers,
            "_eff": eff, "topShare": round(top, 2)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--report", action="store_true", help="print every prompt for review")
    args = ap.parse_args()

    F = Freq(args.src)
    common = {w for w in F.uni if w.isalpha() and F.zipf(w) >= 3.0}
    block = set(read_list("blocklist.txt"))
    magpie = load_magpie(args.src)
    pool = phrase_pool(magpie, F)

    packs = []

    # Pack 1 & 2: compounds
    for pid, fname, side, title, tagline, example in [
        ("front", "front_stems.txt", "front", "Front Halves", "One word in. Finish the compound.",
         ["sun ____", "flower, shine, set, glasses"]),
        ("back", "back_stems.txt", "back", "Back Halves", "The ending's fixed. What comes first?",
         ["____ ball", "foot, snow, eye, meat"]),
    ]:
        prompts = []
        for stem in read_list(fname):
            ans = mine_compounds(stem, side, F, common, block)
            template = f"{stem} ____" if side == "front" else f"____ {stem}"
            strip = {"prefix": stem} if side == "front" else {"suffix": stem}
            p = finish_prompt(f"{pid}-{stem}", template, strip, ans)
            if p:
                prompts.append(p)
        tierize(prompts)
        packs.append({"id": pid, "group": "Compounds", "title": title, "tagline": tagline,
                      "example": example, "prompts": prompts})

    # Pack 3: verb phrases
    prompts = []
    for verb in read_list("verbs.txt"):
        ans = mine_prefix(verb, pool, block)
        p = finish_prompt(f"phrase-{verb}", f"{verb} ____", {"prefix": verb}, ans)
        if p and len(p["answers"]) >= 5:
            prompts.append(p)
    tierize(prompts)
    packs.append({"id": "phrases", "group": "Phrases", "title": "Verb Phrases",
                  "tagline": "A verb walks into a phrase…",
                  "example": ["make ____", "sense, up, it, a wish"], "prompts": prompts})

    # Pack 4: idioms
    prompts = []
    for prefix in read_list("idiom_prefixes.txt"):
        ans = mine_prefix(prefix, pool, block)
        slug = prefix.replace(" ", "-").replace("'", "")
        p = finish_prompt(f"idiom-{slug}", f"{prefix} ____", {"prefix": prefix}, ans)
        if p and len(p["answers"]) >= 4:
            prompts.append(p)
    tierize(prompts)
    packs.append({"id": "idioms", "group": "Idioms", "title": "Idioms",
                  "tagline": "Finish the saying. Same as your partner.",
                  "example": ["under the ____", "weather, radar, table, sun"], "prompts": prompts})

    if args.report:
        for pk in packs:
            print(f"\n===== {pk['id']} ({len(pk['prompts'])} prompts)")
            for p in pk["prompts"]:
                print(f"[{p['difficulty'][0]}] {p['prompt']:<22} " +
                      ", ".join(f"{a['key']}({a['pop']})" for a in p["answers"]))
        for pre, n in discover_idiom_prefixes(pool)[:80]:
            a = mine_prefix(pre, pool, block)
            print(f"  ? {pre:<16} {n:>3}: " + ", ".join(x["key"] for x in a[:18]))
        print("\nidiom prefix candidates:",
              ", ".join(f"{p}:{n}" for p, n in discover_idiom_prefixes(pool)[:120]))

    out = {
        "version": 1,
        "sources": ["Princeton WordNet 3.0", "SymSpell frequency dictionaries (Google Books Ngram ∩ SCOWL)",
                    "MAGPIE idiom corpus (Haagsma et al., 2020)", "wordfreq (Speer, 2022)"],
        "packs": packs,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    total = sum(len(p["prompts"]) for p in packs)
    answers = sum(len(q["answers"]) for p in packs for q in p["prompts"])
    print(f"wrote {args.out} — {len(packs)} packs, {total} prompts, {answers} answers")


if __name__ == "__main__":
    main()
