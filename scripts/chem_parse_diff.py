#!/usr/bin/env python3
"""
Diff the harness PARSE sections (baseline vs after) for the chemistry date
pass. Classification per part:
  IDENTICAL   — same sessionIds + unit + variant (pure spelling normalization)
  UNLOCKED    — was unparseable (null), now parses (intended: typos, specimen,
                polluted numbers, null-number sibling pin)
  VARIANTFIX  — same sessionIds, variant changed (Ja202C/R -> 2C, Ja42 -> 1C)
  REGRESSION  — was parseable, now null or sessionIds narrowed — MUST BE ZERO
"""
import json
import sys


def load(path: str) -> dict:
    for line in open(path, encoding="utf-8"):
        if line.startswith("PARSE"):
            next_line = None
    # simpler: find the line after PARSE
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    i = lines.index("PARSE")
    return json.loads(lines[i + 1])


before = load("/home/z/my-project/scripts/chem_baseline.txt")
after = load("/home/z/my-project/scripts/chem_after.txt")

# the 7 attribution pins are INTENTIONAL session moves: (old date, old number,
# new date, new number) — falsified claims corrected on QP text + footer
# evidence (see scripts/normalize_chem_dates.py PINS docstring)
PIN_SIGNATURES = {
    ("2018", "Ju2CR", "June 2019", "2CR"),
    ("2011", "Ja1CR", "January 2021", "1CR"),
    ("2021", "Jan2CR", "June 2021", "2C"),
    ("2013", "Ja1C", "January 2020", "1C"),
    ("2015", "Ju1CR", "June 2019", "1CR"),
    ("2020", "Ja2C", "January 2021", "2C"),
}

assert set(before) == set(after), "part-id sets differ"

buckets = {"IDENTICAL": [], "UNLOCKED": [], "VARIANTFIX": [], "REGRESSION": []}
for pid, b in before.items():
    a = after[pid]
    bsem = (b["sessionIds"], b["unit"], b["variant"])
    asem = (a["sessionIds"], a["unit"], a["variant"])
    if bsem == asem:
        buckets["IDENTICAL"].append(pid)
    elif b["sessionIds"] is None and a["sessionIds"] is not None:
        buckets["UNLOCKED"].append((pid, b["date"], b["number"], a["sessionIds"], a["variant"]))
    elif b["sessionIds"] is not None and a["sessionIds"] is not None and b["sessionIds"] == a["sessionIds"] and b["variant"] != a["variant"]:
        buckets["VARIANTFIX"].append((pid, b["date"], b["number"], b["variant"], a["variant"]))
    else:
        sig = (b["date"], b["number"], a["date"], a["number"])
        if sig in PIN_SIGNATURES:
            buckets.setdefault("PIN", []).append((pid, sig))
        else:
            buckets["REGRESSION"].append((pid, b, a))

print(f"IDENTICAL  : {len(buckets['IDENTICAL'])}")
print(f"UNLOCKED   : {len(buckets['UNLOCKED'])}")
for pid, d, n, sids, v in sorted(buckets["UNLOCKED"], key=lambda x: (str(x[3]), str(x[4]))):
    print(f"   {pid}  {d!r}/{n!r} -> {sids}/{v!r}")
print(f"VARIANTFIX : {len(buckets['VARIANTFIX'])}")
for pid, d, n, bv, av in sorted(buckets["VARIANTFIX"], key=lambda x: (x[3], x[4])):
    print(f"   {pid}  {d!r}/{n!r}  {bv!r} -> {av!r}")
print(f"PIN        : {len(buckets.get('PIN', []))} (expected 7, one per pin; FSW 5b/5c share a signature)")
for pid, sig in buckets.get("PIN", []):
    print(f"   {pid}  {sig}")
print(f"REGRESSION : {len(buckets['REGRESSION'])}")
for pid, b, a in buckets["REGRESSION"]:
    print(f"   {pid}  before={b} after={a}")

if buckets["REGRESSION"]:
    sys.exit("REGRESSIONS FOUND")
print("\nOK: zero regressions")
