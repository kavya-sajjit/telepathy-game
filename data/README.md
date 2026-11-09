# Word packs: where the words come from

`build_packs.py` builds `backend/app/data/packs.json`. Every **answer** is mined from open lexical
resources. The only hand-written parts are the **prompts** (which stems, verbs and idiom openers to
use) and a blocklist, so a pack can grow without anyone typing in answers.

| Pack | Prompt | How answers are found |
|---|---|---|
| Front Halves | `sun ____` | Closed compounds (`sunflower`) from the 82k-word SymSpell dictionary, split into two real words. A split is kept only with evidence it's a real compound: WordNet lists the open form (`break_dance`), the two words often appear together (Google Books bigrams), or the WordNet gloss mentions the other half. Open compounds (`ice cream`) come from WordNet multiword lemmas with real bigram frequency. |
| Back Halves | `____ ball` | Same as above, reversed. |
| Verb Phrases | `make ____` | WordNet multiword verbs (`make_up`, `make_do`), MAGPIE idioms that start with the verb, and a short list of everyday phrases the corpora miss (`curation/extra_phrases.txt`). |
| Idioms | `under the ____` | MAGPIE + WordNet expressions, grouped by shared opener. Openers were picked from the auto-discovered list (`--report`). |

**Popularity** (the bars on the reveal screen) uses Google Books unigram/bigram counts from the SymSpell
dictionaries, calibrated onto wordfreq's Zipf scale. Multiword phrases are scored by their weakest bigram.

**Difficulty** is set by how spread out the answers are. Each prompt gets an *effective number of
answers*, exp(entropy) of the popularity distribution. One dominant answer (`ice ____` → cream) is
easy to sync on; many equally likely answers (`time ____`) is hard. Prompts are split into thirds
within each pack.

## Sources & licences

- **Princeton WordNet 3.0** via NLTK, under the WordNet licence (permissive, attribution).
- **SymSpell frequency dictionaries** (`frequency_dictionary_en_82_765.txt`,
  `frequency_bigramdictionary_en_243_342.txt`) from the `symspellpy` package, MIT. These are derived from the
  Google Books Ngram data intersected with SCOWL.
- **MAGPIE corpus**: Haagsma, Bos & Nissim (2020), *MAGPIE: A Large Corpus of Potentially Idiomatic
  Expressions*, LREC. CC-BY 4.0. https://github.com/hslh/magpie-corpus
- **wordfreq** by Robyn Speer, used as a fallback frequency for words missing from SymSpell. Data CC-BY-SA 4.0.

## Rebuilding

```bash
pip install nltk wordfreq symspellpy
python -c "import nltk; nltk.download('wordnet')"
mkdir -p /tmp/src && cp "$(python -c 'import symspellpy,os;print(os.path.dirname(symspellpy.__file__))')"/frequency_*.txt /tmp/src/
curl -L -o /tmp/src/magpie.jsonl https://raw.githubusercontent.com/hslh/magpie-corpus/master/MAGPIE_unfiltered.jsonl

python data/build_packs.py --src /tmp/src --out backend/app/data/packs.json --report | less
```

To add a pack, add a stems file under `curation/` and a block in `main()`. If junk slips through,
add it to `curation/blocklist.txt`. Use `stem:part` to block an answer under one prompt only.
