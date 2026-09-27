#!/usr/bin/env python3
"""
Normalize date-spelling variants in the double-award physics content file.

Operator-approved follow-up from the 4SC0 legacy wave (worklog, 2026-09-27):
duplicate date spellings split one physical paper into several phantom
reconstruction rows (collectPastPapers groups by slugify(date)-slugify(number)),
so '2012 January' / 'January 2012' / 'Jan 2012' compete for the same corpus row
and dilute per-paper question sets.

Canonical form: "Month YYYY" with the full month name (e.g. "January 2012") —
month-first full spelling, repo-wide dominant pattern, and the direction named
in the worklog proposal.

Rules
  Pass 1 (spelling, applies to every sourcePaper.date):
    a. trim stray whitespace ('2013 January ' → '2013 January')
    b. strip embedded paper-code junk after the year
       ('June 2016 1P' → 'June 2016'; '2014 June 1PR1' → '2014 June')
       — the part's `number` field already carries the paper reference
    c. expand 2-digit-year shorthand, 2011+ IGCSE/IAL era
       ('Jan 13' → 'January 2013'; 'Jun 16'/'June 16' → 'June 2016')
    d. canonical order + full month name
       ('2012 January' → 'January 2012'; 'Jan 2012' → 'January 2012')
  Pass 2 (session evidence, per question):
    A date that names no real session — a bare year ('2013') or a non-Pearson
    month word ('February', 'July') — inherits the canonical date of a
    same-question sibling part carrying the SAME paper number with an explicit
    'January/June YYYY' date. One official question cannot span two sessions,
    so the sibling is decisive evidence. If siblings disagree, ABORT (never
    guess). No sibling → leave untouched (honest unknown within that year).
    Expected adoptions (verified by inspection before writing this script):
      '2016 February' → 'January 2016'  (qstn_CWZrfn79YSGkKKJn 8c sibling 'Jan 2016' 1P)
      '2014 July'     → 'June 2014'     (qstn_g4979CZZmC4mB6Jb 3a sibling 'Jun 2014' 1PR)
      '2013' 1P       → 'January 2013'  (qstn_BgsSwf9NZ84CjqTt 11c sibling '2013 January')
      '2014' 1P       → 'June 2014'     (qstn_BVmvpJcNYjfnkxTj 10d/10e sibling '2014 June')
      '2013' 2PR      → 'June 2013'     (qstn_jGZXP7bsD49fk26Z 11c–e sibling '2013 June')
    Left untouched (no month-bearing sibling): '2016' 2P (qstn_SNZthzftbv88sC2f 1c),
    '2016' 1P ×2 (qstn_by9mpfwQND3Dy2gk 11a/11b).

Out of scope (number-spelling variants, separate decision): 'P1' vs '1P',
bare '1' vs '1P', 2-series citations.

The writer byte-round-trips the original before touching it, so the git diff
contains exactly the changed date strings — nothing else.
"""
import json
import re
import sys
from collections import Counter

PATH = "content/igcse-science-double-award-17-physics/questions.json"

MONTHS = {"jan": "January", "jun": "June"}  # only these occur in this file
MONTH_RE = r"(January|June|Jan|Jun)"

# --- pass 1 patterns ---------------------------------------------------------
TRAILING_CODE = re.compile(r"^(.*\d{4})\s+(?:[12]P[RA]?|P[12])1?$")
# '2014 June 1PR1' — year month code[+question junk]: keep year+month, drop the rest
POLLUTED_YM = re.compile(r"^(\d{4})\s+(Jan|Jun)(?:uary|e)?\s+(?:[12]P[RA]?|P[12])1?$")
SHORT_YEAR = re.compile(r"^(Jan|Jun)(?:uary|e)?\s+(\d{2})$")
YEAR_FIRST = re.compile(r"^(\d{4})\s+" + MONTH_RE + r"$")
MONTH_FIRST = re.compile(r"^" + MONTH_RE + r"\s+(\d{4})$")

def full_month(token: str) -> str:
    return MONTHS[token[:3].lower()]

def canonicalize(date: str) -> str:
    d = (date or "").strip()
    m = POLLUTED_YM.match(d)
    if m:
        return f"{full_month(m.group(2))} {m.group(1)}"
    m = TRAILING_CODE.match(d)
    if m:
        d = m.group(1).strip()
    m = SHORT_YEAR.match(d)
    if m:
        d = f"{full_month(m.group(1))} 20{m.group(2)}"
    m = YEAR_FIRST.match(d)
    if m:
        d = f"{full_month(m.group(2))} {m.group(1)}"
        return d
    m = MONTH_FIRST.match(d)
    if m:
        d = f"{full_month(m.group(1))} {m.group(2)}"
    return d

SESSION_MONTH = re.compile(r"^(January|June) (\d{4})$")
FUZZY = re.compile(r"^(\d{4})$|^(January|June|Jan|Jun|\d{4})$")

def is_fuzzy(date: str) -> bool:
    """Bare year, or a month word that names no Pearson IGCSE session."""
    if not date:
        return False
    if SESSION_MONTH.match(date):
        return False
    # bare year or month-first/year-first with an unusable month word
    return bool(re.match(r"^\d{4}$", date) or re.match(r"^[A-Za-z]+ \d{4}$", date) or re.match(r"^\d{4} [A-Za-z]+$", date))

def main() -> None:
    raw = open(PATH, "rb").read()
    data = json.loads(raw)

    # writer round-trip guard — byte-exact before any mutation
    reserialized = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if reserialized != raw:
        sys.exit("ABORT: round-trip mismatch — writer style does not match file")

    changes = []
    before_variants: Counter = Counter()
    after_variants: Counter = Counter()

    for block in data:
        for q in block.get("questions", []):
            parts = q.get("parts", [])
            # pass 1
            canon = []  # (part, original, canonical)
            for p in parts:
                sp = p.get("sourcePaper")
                if not sp or not sp.get("date"):
                    continue
                orig = sp["date"]
                before_variants[orig.strip()] += 1
                c = canonicalize(orig)
                canon.append((p, orig, c))
            # pass 2 — sibling evidence within the question
            evidence: dict[str, set[str]] = {}
            for p, _, c in canon:
                num = ((p.get("sourcePaper") or {}).get("number") or "").strip().upper()
                m = SESSION_MONTH.match(c)
                if m and num:
                    evidence.setdefault(num, set()).add(c)
            final = {}
            for p, orig, c in canon:
                num = ((p.get("sourcePaper") or {}).get("number") or "").strip().upper()
                if is_fuzzy(c) and num in evidence:
                    cands = evidence[num]
                    if len(cands) == 1:
                        final[id(p)] = next(iter(cands))
                    else:
                        sys.exit(f"ABORT: sibling evidence disagrees for {p.get('id')}: {sorted(cands)}")
                else:
                    final[id(p)] = c
            # apply
            for p, orig, _ in canon:
                new = final[id(p)]
                after_variants[new] += 1
                if new != orig:
                    sp = p["sourcePaper"]
                    changes.append((block["slug"], q["id"], p["id"], sp.get("questionNumber"), orig, new))
                    sp["date"] = new

    print(f"changed parts: {len(changes)}\n")
    for slug, qid, pid, qn, old, new in changes:
        print(f"  {slug[:44]:44s} {qn}\t{old!r:20s} → {new!r}")

    print("\ndistinct date strings: before =", len(before_variants), " after =", len(after_variants))
    print("\nafter variants (all):")
    for d, c in sorted(after_variants.items()):
        print(f"{c:5d}  {d!r}")

    out = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(PATH, "wb") as f:
        f.write(out)
    print(f"\nwritten: {PATH} ({len(out)} bytes; was {len(raw)})")

if __name__ == "__main__":
    main()
