#!/usr/bin/env python3
"""Gate for CI: is the shipped data a clean build of the current sources?

Needs no Lexique. It cannot re-check genders (that happens in build_data.py, which
refuses to write files while any CHECK flag is open); it proves that
public/data/words.json was produced from exactly the data/src files in the repo and
that the file is well formed.
"""
import glob, hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import LEVELS, TAGS, source_hash  # noqa: E402

errors = []
data = json.load(open(os.path.join(ROOT, "public", "data", "words.json"), encoding="utf-8"))
rdata = json.load(open(os.path.join(ROOT, "public", "data", "rules.json"), encoding="utf-8"))
rules, mixed = rdata["rules"], rdata.get("mixed", [])
words, ends, mixed_ends = data["words"], {r["end"] for r in rules}, {m["end"] for m in mixed}

src = source_hash(glob.glob(os.path.join(ROOT, "data", "src", "*.json")))
if data.get("src") != src:
    errors.append(f"words.json is stale: built from sources {data.get('src')}, repo has {src}. Run `npm run data`.")
body = json.dumps(words, ensure_ascii=False, separators=(",", ":"))
if hashlib.sha1(body.encode()).hexdigest()[:8] != data.get("version"):
    errors.append("words.json was edited by hand: its version does not match its content.")

seen = set()
for w in words:
    wid = w.get("id", "?")
    if wid in seen:
        errors.append(f"duplicate id {wid}")
    seen.add(wid)
    if not re.fullmatch(re.escape(w.get("l", "")) + r"#n\d*", wid):
        errors.append(f"{wid}: id does not match lemma")
    if w.get("g") not in ("m", "f") or w.get("lv") not in LEVELS or not isinstance(w.get("el"), bool):
        errors.append(f"{wid}: bad gender, level or elision flag")
    if any(not isinstance(w.get(k), str) or not w[k] for k in ("def", "en", "ex", "exEn")):
        errors.append(f"{wid}: missing text")
    if w.get("end") and w["end"] not in ends:
        errors.append(f"{wid}: ending -{w['end']} is not in rules.json")
    if w.get("grp") and (w.get("end") or w["grp"] not in mixed_ends or not w["l"].endswith(w["grp"])):
        errors.append(f"{wid}: bad ending family -{w['grp']}")
    if any(t not in TAGS for t in w.get("tags", [])):
        errors.append(f"{wid}: unknown tag")
for r in rules:
    if r.get("g") not in ("m", "f") or not 50 <= r.get("pct", 0) <= 100:
        errors.append(f"rule -{r.get('end')}: bad gender or share")
    if any(not x.endswith(r["end"]) or x == r["end"] for x in r.get("not", [])):
        errors.append(f"rule -{r['end']}: bad exclusion list")
for m in mixed:
    if m.get("in") not in ends or not m["end"].endswith(m["in"]) or not 0 <= m.get("f", -1) <= m.get("n", 0) or m["n"] < 1:
        errors.append(f"mixed -{m.get('end')}: bad entry")

if errors:
    sys.exit("DATA CHECK FAILED\n" + "\n".join("- " + e for e in errors[:40]))
print(f"data ok: {len(words)} words, {len(rules)} rules, version {data['version']}, sources {src}")
