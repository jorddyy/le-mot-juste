#!/usr/bin/env python3
"""Build the app data from the hand-curated source files.

  data/src/*.json  +  raw/Lexique383.tsv (not in git)
      -> public/data/words.json   nouns, sorted by level then frequency
      -> public/data/rules.json   ending -> gender guidelines with measured reliability
      -> build/report.md          counts, flags and a random sample (read this, not the data)

Lexique is used to cross-check every gender, to order words by frequency and to
measure how reliable each ending is. Words whose gender disagrees with Lexique are
left out and listed in the report.

A noun with two genders and two meanings is two entries: the second one carries
"s": 2 in the source and gets the id "lemma#n2" (le poste / la poste).

Any flag starting with "CHECK" is a blocker: the report is written, the shipped
files are left untouched and the script exits with status 1.
"""
import csv, glob, hashlib, json, os, random, re, sys, unicodedata
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEX = os.path.join(ROOT, "raw", "Lexique383.tsv")
LEVELS = ["A1", "A2", "B1", "B2"]
TAGS = {"science", "admin", "tech", "cinema", "ch", "faux-ami"}
# Candidate endings; the data decides which ones are reliable enough to show.
ENDINGS = """tion sion ion té ée ette ence ance ure ade ie tude aison esse ise ille elle enne ine ière
euse trice ique ache oire ole one ue che ace ée ité logie
ment age eau isme oir ail et ème ier in on al eur teur scope phone gramme ou is at ard é o
an ant ent c d l r s t x
aison son sse tte nne rre mme ice ège été eté auté nté rté tié""".split()
STOP = {"putain", "catin", "zelle", "unetelle", "gail", "quant", "virginie", "pence", "miss", "barmaid", "girl", "soul"}
# Nouns with an aspirated h (no elision: le hasard). Every other h-noun is treated as silent (l'heure).
ASPIRE = set("""hasard honte héros haine haricot hibou hauteur hache hanche harpe hausse haie halte hameau hangar
harcèlement hantise hérisson homard housse hublot handicap hall hamac hareng hâte haut hernie héron hockey houle
huée hurlement hutte hongrois harnais hochet horde""".split())
# Lexique 3.83 has no gender for these (or lacks the word); genders reviewed by hand on 2026-11-14.
# lemma -> genders accepted ("fm" when the noun has one sense per gender).
REVIEWED = dict(w.split(":") for w in  """maison:f orange:f œuf:m voiture:f main:f cœur:m livre:m ordonnance:f gorge:f
poste:fm cours:m page:f radio:f mode:f tour:m politique:f justice:f carrière:f critique:f mémoire:f manche:f voile:f
somme:f vase:m hymne:m couple:m aide:f chance:f graphique:m souris:f bogue:m suspense:m natel:m votation:f
bancomat:m tablard:m carnotzet:m""".split())
# Mass nouns and one-of-a-kind nouns: "un/une" in front of them is odd ("une eau", "un soleil"),
# so the app quizzes them with le/la, ce/cette or mon/ma instead. Only lemmas present in the list matter.
UNCOUNTABLE = set("""eau lait riz sucre sel poivre beurre farine huile argent sable neige air essence miel monnaie
courage patience santé chômage tourisme sommeil faim soif humour électricité météo natation informatique
nourriture circulation justice paix bétail linge soleil lune ciel nord sud monde passé avenir 
or fer bois cuir coton laine plastique pétrole gaz vapeur fumée poussière boue pluie
recherche physique chimie biologie économie grammaire politesse confiance honte fierté tristesse joie colère
bonheur malheur trafic pollution sécurité liberté égalité violence pauvreté richesse""".split())
MIN_N, MIN_SHARE = 15, 0.85          # an ending becomes a guideline above these
MIN_FREQ = 0.5                       # Lexique nouns rarer than this (per million) are ignored


def norm(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()


def load_lexique():
    """lemma -> {'g': set of genders, 'f': frequency per million (films, else books)}"""
    lex = {}
    with open(LEX, encoding="utf-8") as fh:
        for r in csv.DictReader(fh, delimiter="\t", quoting=csv.QUOTE_NONE):
            if r["cgram"] != "NOM" or r["ortho"] != r["lemme"] or r["genre"] not in ("m", "f"):
                continue
            e = lex.setdefault(r["lemme"], {"g": set(), "f": 0.0})
            e["g"].add(r["genre"])
            e["f"] = max(e["f"], float(r["freqlemfilms2"] or 0), float(r["freqlemlivres"] or 0))
    return lex


def ending_of(word, endings):
    best = ""
    for e in endings:
        if len(word) > len(e) and word.endswith(e) and len(e) > len(best):
            best = e
    return best


def build_rules(lex):
    cands = sorted(set(ENDINGS), key=len, reverse=True)
    groups = defaultdict(list)
    for lemma, e in lex.items():
        if len(e["g"]) != 1 or e["f"] < MIN_FREQ or not lemma.isalpha():
            continue
        end = ending_of(lemma, cands)
        if end:
            groups[end].append((lemma, next(iter(e["g"])), e["f"]))

    def lean(items):
        n = len(items)
        nf = sum(1 for _, g, _ in items if g == "f")
        g = "f" if nf * 2 >= n else "m"
        return g, (nf if g == "f" else n - nf) / n

    def is_rule(end):
        return len(groups[end]) >= MIN_N and lean(groups[end])[1] >= MIN_SHARE

    # A longer ending too small to be a rule but agreeing with the rule above it (-ier under -r,
    # both masculine) is counted in that rule: listing it apart would only look like a contradiction.
    alias = {}
    for end in sorted(groups, key=len, reverse=True):
        if is_rule(end):
            continue
        up = ending_of(end, cands)
        while up and up not in groups:
            up = ending_of(up, cands)
        g, share = lean(groups[end])
        if up and is_rule(up) and g == lean(groups[up])[0] and share >= MIN_SHARE:
            groups[up].extend(groups.pop(end))
            alias[end] = up
    for end, up in list(alias.items()):  # follow chains of folds
        while up in alias:
            up = alias[up]
        alias[end] = up

    rules = []
    for end, items in groups.items():
        if not is_rule(end):
            continue
        g, share = lean(items)
        exc = sorted((i for i in items if i[1] != g and i[2] >= 3 and i[0] not in STOP), key=lambda i: -i[2])[:8]
        ex = sorted((i for i in items if i[1] == g), key=lambda i: -i[2])[:4]
        rules.append({"end": end, "g": g, "pct": round(100 * share), "n": len(items),
                      "examples": [i[0] for i in ex], "exceptions": [i[0] for i in exc]})
    rules.sort(key=lambda r: (r["g"], -r["pct"], -r["n"]))
    return rules, groups, alias


def carve_outs(rules, groups, cands, alias):
    """Each word counts under its longest candidate ending only, so a rule like -é (masculine)
    does not cover -té or -ité nouns: those are measured on their own. Make that visible.

    Returns (excluded, mixed, family):
      excluded  rule ending -> the longer endings measured apart from it, nearest first (-é: té, ée)
      mixed     the excluded endings that are not rules themselves, with their gender split;
                nouns under a longer rule (-ité inside -té) are left out of that split
      family    candidate ending -> (rule, excluded ending) it falls under, for endings
                that are not rules but sit inside one (rté -> (é, té))
    """
    by_end = {r["end"]: r for r in rules}
    parent = {}
    for c in cands:                     # endings folded into a rule are not steps of their own
        p = ending_of(c, cands)
        while p in alias:
            p = ending_of(p, cands)
        parent[c] = p

    def path(c):                        # c, then its shorter candidate endings, nearest first
        out = []
        while c:
            out.append(c)
            c = parent[c]
        return out

    family = {}
    for c in cands:
        p = path(c)
        k = next((i for i, x in enumerate(p) if x in by_end), None)
        if k:                           # a rule further up, and c is not covered by a closer rule
            family[c] = (p[k], p[k - 1])
    excluded = defaultdict(set)
    for end in groups:                  # only endings that real nouns fall under
        p = path(end)
        for i in range(1, len(p)):
            if p[i] in by_end:
                excluded[p[i]].add(p[i - 1])
                break
    stats = {}
    for end, items in groups.items():
        if end in family:
            rule, c = family[end]
            st = stats.setdefault(c, {"end": c, "in": rule, "n": 0, "f": 0, "_f": [], "_m": [], "rules": set()})
            for lemma, g, f in items:
                st["n"] += 1
                st["f"] += g == "f"
                if f >= 3 and lemma not in STOP:
                    st["_" + g].append((f, lemma))
    for r in by_end:                    # rules nested inside an excluded ending (-ité inside -té)
        p = path(r)[1:]
        for x in p:
            if x in stats:
                stats[x]["rules"].add(r)
            if x in by_end:
                break
    mixed = []
    for st in sorted(stats.values(), key=lambda st: -st["n"]):
        mixed.append({"end": st["end"], "in": st["in"], "n": st["n"], "f": st["f"],
                      "fem": [l for _, l in sorted(st["_f"], reverse=True)[:3]],
                      "masc": [l for _, l in sorted(st["_m"], reverse=True)[:3]],
                      "rules": sorted(st["rules"], key=lambda e: (len(e), e))})
    excluded = {r: sorted(v, key=lambda e: (len(e), e)) for r, v in excluded.items()}
    return excluded, mixed, family


def source_hash(files):
    """Fingerprint of the source files, stored in words.json so CI can tell when it is stale."""
    h = hashlib.sha1()
    for path in sorted(files):
        h.update(os.path.basename(path).encode() + b"\0" + open(path, "rb").read())
    return h.hexdigest()[:12]


def main():
    if not os.path.exists(LEX):
        sys.exit("raw/Lexique383.tsv is missing: download it from http://www.lexique.org/databases/Lexique383/Lexique383.tsv")
    lex = load_lexique()
    rules, groups, alias = build_rules(lex)
    rule_by_end = {r["end"]: r for r in rules}
    cands = sorted(set(ENDINGS), key=len, reverse=True)
    excluded, mixed, family = carve_outs(rules, groups, cands, alias)
    mixed_ends = {m["end"] for m in mixed}
    for r in rules:
        if excluded.get(r["end"]):
            r["not"] = excluded[r["end"]]

    def rule_end(word):                 # the word's longest candidate ending, if that ending is a guideline
        e = ending_of(word, cands)
        e = alias.get(e, e)
        return e if e in rule_by_end else ""

    flags = defaultdict(list)
    seen, words = {}, []
    files = sorted(glob.glob(os.path.join(ROOT, "data", "src", "*.json")))
    for path in files:
        name = os.path.basename(path)
        for e in json.load(open(path, encoding="utf-8")):
            l = e.get("l", "")
            sense = e.get("s", 1)
            wid = f"{l}#n" if sense == 1 else f"{l}#n{sense}"
            miss = [k for k in ("l", "g", "lv", "def", "en", "ex", "exEn") if not e.get(k)]
            if miss or e.get("g") not in ("m", "f") or e.get("lv") not in LEVELS or " " in l or l != l.lower():
                flags["dropped: malformed"].append(f"{l or '?'} ({name}: {miss or 'bad value'})")
                continue
            tags = [t for t in e.get("tags", []) if t in TAGS]
            if not isinstance(sense, int) or sense < 1:
                flags["CHECK: bad sense number"].append(l)
                continue
            if wid in seen:                     # same word again: keep the easier level, merge tags
                w = seen[wid]
                if w["g"] != e["g"]:            # two genders = two senses: mark the second with "s": 2
                    flags["CHECK: duplicate with different gender"].append(l)
                w["tags"] = sorted(set(w["tags"]) | set(tags))
                if LEVELS.index(e["lv"]) < LEVELS.index(w["lv"]):
                    w["lv"] = e["lv"]
                flags["duplicates merged"].append(l)
                continue
            lx = lex.get(l)
            if lx is None:
                if e["g"] not in REVIEWED.get(l, ""):
                    flags["CHECK: no gender in Lexique and not reviewed by hand"].append(f"{l} ({e['g']})")
            elif e["g"] not in lx["g"]:
                flags["dropped: gender disagrees with Lexique"].append(f"{l}: ours {e['g']}, Lexique {'/'.join(sorted(lx['g']))}")
                continue
            elif len(lx["g"]) == 2:
                flags["both genders exist in Lexique (needs a note)"].append(f"{l} ({e['g']}){'' if e.get('note') else '  NO NOTE'}")
            h = ""
            if l.startswith("h"):
                h = "aspire" if l in ASPIRE else "muet"
                if e.get("h") and e["h"] != h:
                    flags["CHECK: h field disagrees with our aspirated-h list"].append(f"{l}: source says {e['h']}")
            if norm(l) in re.findall(r"[a-z-]+", norm(e["def"])):
                flags["definition contains the headword"].append(l)
            if not re.search(rf"(?<![a-z]){re.escape(norm(l))}(?![a-z])", norm(e["ex"])):
                flags["example lacks the singular noun"].append(f"{l}: {e['ex']}")
            if len(e["def"].split()) > 20:
                flags["long definition"].append(l)
            end = rule_end(l)
            w = {"id": wid, "l": l, "g": e["g"], "lv": e["lv"], "end": end,
                 **({"grp": family[own][1]} if not end and (own := ending_of(l, cands)) in family
                    and family[own][1] in mixed_ends else {}),
                 "el": bool(re.match(r"[aeiouyàâéèêëîïôûœ]", l)) or h == "muet",
                 "def": e["def"], "en": e["en"], "ex": e["ex"], "exEn": e["exEn"], "tags": tags,
                 "_f": lx["f"] if lx else 0.0}
            if l in UNCOUNTABLE:
                w["unc"] = True
            for k in ("note", "noteEn"):
                if e.get(k):
                    w[k] = e[k]
            seen[wid] = w
            words.append(w)

    words.sort(key=lambda w: (LEVELS.index(w["lv"]), -w["_f"], w["l"]))
    for w in words:
        del w["_f"]
    body = json.dumps(words, ensure_ascii=False, separators=(",", ":"))
    version = hashlib.sha1(body.encode()).hexdigest()[:8]
    out = os.path.join(ROOT, "public", "data")
    os.makedirs(out, exist_ok=True)
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    blockers = sorted(k for k in flags if k.startswith("CHECK"))
    if not blockers:                    # never replace the shipped files with unchecked data
        with open(os.path.join(out, "words.json"), "w", encoding="utf-8") as fh:
            fh.write('{"version":"%s","src":"%s","words":%s}\n' % (version, source_hash(files), body))
        with open(os.path.join(out, "rules.json"), "w", encoding="utf-8") as fh:
            json.dump({"source": "Lexique 3.83, noun lemmas with frequency >= %s per million" % MIN_FREQ,
                       "rules": rules, "mixed": mixed}, fh, ensure_ascii=False, separators=(",", ":"))

    # ---- report ----
    R = ["# Data build report", "", f"Data version `{version}` · {len(words)} nouns from {len(files)} source files", ""]
    lv = Counter(w["lv"] for w in words)
    R += ["## Counts", "", "| level | nouns | f | m | follows a rule | exception | no rule |", "|---|---|---|---|---|---|---|"]
    for L in LEVELS:
        ws = [w for w in words if w["lv"] == L]
        fol = sum(1 for w in ws if w["end"] and rule_by_end[w["end"]]["g"] == w["g"])
        exc = sum(1 for w in ws if w["end"] and rule_by_end[w["end"]]["g"] != w["g"])
        R.append(f"| {L} | {lv[L]} | {sum(w['g']=='f' for w in ws)} | {sum(w['g']=='m' for w in ws)} | {fol} | {exc} | {len(ws)-fol-exc} |")
    tg = Counter(t for w in words for t in w["tags"])
    R += ["", "Tags: " + ", ".join(f"{t} {n}" for t, n in tg.most_common()), ""]
    R += ["## Flags", ""]
    for k in sorted(flags):
        R += [f"### {k} ({len(flags[k])})", "", ", ".join(flags[k]) if not k.startswith("example") else "\n".join("- " + x for x in flags[k]), ""]
    R += ["## h-words", "", ", ".join(f"{w['l']} ({'l’' if w['el'] else 'le/la'})" for w in words if w["l"].startswith("h")) or "none", ""]
    R += ["## Quizzed without un/une (mass or unique nouns)", "", ", ".join(w["l"] for w in words if w.get("unc")), ""]
    R += ["## Exceptions in our list", "", ", ".join(f"{w['l']} ({w['g']}, -{w['end']})" for w in words if w["end"] and rule_by_end[w["end"]]["g"] != w["g"]), ""]
    R += ["## Ending guidelines (measured on Lexique)", "", "| ending | gender | share | nouns | top exceptions |", "|---|---|---|---|---|"]
    R += [f"| -{r['end']} | {r['g']} | {r['pct']}% | {r['n']} | {', '.join(r['exceptions'])} |" for r in rules]
    rej = sorted(((e, len(i), max(sum(1 for x in i if x[1] == 'f'), sum(1 for x in i if x[1] == 'm')) / len(i))
                  for e, i in groups.items() if e not in rule_by_end and len(i) >= MIN_N), key=lambda x: -x[2])
    R += ["", "## Measured apart from a rule (not rules themselves)", "",
          "| ending | inside | nouns | f | feminine | masculine | rules inside |", "|---|---|---|---|---|---|---|"]
    R += [f"| -{m['end']} | -{m['in']} | {m['n']} | {round(100 * m['f'] / m['n'])}% | {', '.join(m['fem'])} | {', '.join(m['masc'])} | {', '.join(m['rules'])} |" for m in mixed]
    R += ["", "Our nouns per family: " + ", ".join(f"-{k} {v}" for k, v in Counter(w["grp"] for w in words if w.get("grp")).most_common())]
    R += ["", "Not reliable enough: " + ", ".join(f"-{e} {round(100*s)}% (n={n})" for e, n, s in rej), ""]
    random.seed(1)
    R += ["## Random sample", ""]
    for w in random.sample(words, min(20, len(words))):
        R.append(f"- **{w['l']}** {w['g']} {w['lv']} {w['tags'] or ''} — {w['def']} — _{w['en']}_ — {w['ex']} / {w['exEn']}" + (f" — NOTE {w['note']}" if w.get("note") else ""))
    open(os.path.join(ROOT, "build", "report.md"), "w", encoding="utf-8").write("\n".join(R) + "\n")
    print(f"{len(words)} nouns, {len(rules)} rules, data version {version}; "
          + "; ".join(f"{k.split(':')[0].split(' (')[0]}: {len(v)}" for k, v in sorted(flags.items())))
    print("see build/report.md")
    if blockers:
        sys.exit("NOT WRITTEN: unresolved " + "; ".join(f"{k} ({', '.join(flags[k])})" for k in blockers))


if __name__ == "__main__":
    main()
