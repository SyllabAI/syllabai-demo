#!/usr/bin/env python3
"""
Pin the double-award physics recons' two '2016' year-only rows and normalize
number-spelling stragglers ('P1' / bare '1' -> '1P') — the follow-up to
scripts/normalize_physics_dates.py, every change backed by external or
same-question evidence gathered 2026-09-27 (see worklog Task 5).

PIN 1 — '2016' 1P (qstn_by9mpfwQND3Dy2gk, underground-train Q11, 11 marks)
  -> 'June 2016'.
  Evidence: the question is absent from EVERY 4PH0/4PH1/4SD0 QP held in the
  corpus (sweep of ~70 QPs for 'underground|250 000|18 MJ|street level').
  PMT hosts the authentic June 2016 4PH0/1P (cover 'Wednesday 25 May 2016 -
  Afternoon', 'Paper Reference KPH0/1P 4PH0/1P'): Q11 = the underground-train
  question, 'Total for Question 11 = 11 marks', part structure (a)(i)=1,
  (ii)=3, (iii)=1 / (b)(i)=2, (ii)=4 — exactly the recon's 11a=5 + 11b=6.
  Neither 2016 1-series paper in the corpus contains it, because (corpus bug,
  see worklog) the corpus's 2016-06/4PH0-1P dir actually holds the 1PR paper
  (P46079A, cover prints 4PH0/1PR) — same PDF as the 1PR dir.

PIN 2 — '2016' 2P (qstn_SNZthzftbv88sC2f, book-shelf Q1c, 1 mark)
  -> 'January 2016'.
  Evidence: corpus 2016-01/4PH0-2P (GENUINE: cover 'Monday 25 January 2016 -
  Afternoon', P46802A) Q1c = 'When a book from a low shelf is placed on a
  higher shelf, the book gains' with options headed by 'A gravitational
  potential energy' — exact text+question-number+marks match; absent from the
  genuine June 2016 2P (P46080A, cover 17 June 2016). Blueprint Q1=4 covers
  a/b/c/d x 1 mark.

NUMBERS — 'P1' and bare '1' -> '1P' (4SC0-era physics papers are 1P/2P/1PR/2PR;
the file holds only physics-component questions, so Paper 1 = 1P):
  - qstn_8Ry8VfFJ7k4TnFHc 12b '1' — siblings 12a/12c '1P' (same question)
  - qstn_HxNbt37krYGx9Ngt 11b '1' — sibling 11c '1P' (same question)
  - qstn_6ZM4hGZBXVK6q4nK 6c 'P1' — siblings 6a/6b '1P' (same question)
  - qstn_yhcqFxmjfbtmckpy 7b 'P1' — sibling 7a '1P' (same question)
  - qstn_66BT5bjKQpqsQw5Q 6a-6d 'P1' (no 1P sibling) — blueprint corroboration:
    2013-01:4PH0-1P Q6 = 11 marks = the recon's total (parts 1+3+2+5).

The writer byte-round-trips the file before mutating; the diff contains only
the changed date/number strings.
"""
import json
import sys
from collections import Counter

PATH = "content/igcse-science-double-award-17-physics/questions.json"

# (question id, part id) -> {field: new value}; part ids resolve ambiguities
PINS = {
    "qstn_by9mpfwQND3Dy2gk": {"date": "June 2016"},
    "qstn_SNZthzftbv88sC2f": {"date": "January 2016"},
}

def main() -> None:
    raw = open(PATH, "rb").read()
    data = json.loads(raw)
    reserialized = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if reserialized != raw:
        sys.exit("ABORT: round-trip mismatch — writer style does not match file")

    changes = []
    before: Counter = Counter()
    after: Counter = Counter()

    for block in data:
        for q in block.get("questions", []):
            qid = q.get("id")
            parts = q.get("parts", [])
            for p in parts:
                sp = p.get("sourcePaper")
                if not sp:
                    continue
                before[(sp.get("date"), sp.get("number"))] += 1

            # PIN 1 / PIN 2 — question-level date pins
            if qid in PINS:
                sp0 = parts[0].get("sourcePaper") or {}
                if (sp0.get("date") or "").strip() != "2016":
                    sys.exit(f"ABORT: {qid} expected date '2016', found {sp0.get('date')!r}")
                for p in parts:
                    sp = p["sourcePaper"]
                    new = PINS[qid]["date"]
                    if sp.get("date") != new:
                        changes.append((block["slug"], sp.get("questionNumber"), "date", sp.get("date"), new, qid))
                        sp["date"] = new

            # NUMBERS — per-question sibling rule + audited explicit fixes
            nums = [((p.get("sourcePaper") or {}).get("number") or "").strip() for p in parts if p.get("sourcePaper")]
            has_1p = "1P" in nums
            for p in parts:
                sp = p.get("sourcePaper")
                if not sp:
                    continue
                num = (sp.get("number") or "").strip()
                # sibling evidence: same question carries '1P'
                if num in ("1", "P1") and has_1p:
                    changes.append((block["slug"], sp.get("questionNumber"), "number", num, "1P", qid))
                    sp["number"] = "1P"
                elif num == "P1" and qid == "qstn_66BT5bjKQpqsQw5Q":
                    # no 1P sibling; blueprint corroboration (2013-01:4PH0-1P Q6 = 11)
                    changes.append((block["slug"], sp.get("questionNumber"), "number", num, "1P", qid))
                    sp["number"] = "1P"

            for p in parts:
                sp = p.get("sourcePaper")
                if sp:
                    after[(sp.get("date"), sp.get("number"))] += 1

    print(f"changed parts: {len(changes)}\n")
    for slug, qn, field, old, new, qid in changes:
        print(f"  {slug[:44]:44s} {qn}\t{field}: {old!r} → {new!r}  ({qid})")

    print("\n(date, number) attestation pairs: before =", len(before), " after =", len(after))
    print("\nafter pairs:")
    for (d, n), c in sorted(after.items(), key=lambda x: (str(x[0][0]), str(x[0][1]))):
        print(f"{c:4d}  date={d!r:16s} number={n!r}")

    out = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(PATH, "wb") as f:
        f.write(out)
    print(f"\nwritten: {PATH} ({len(out)} bytes; was {len(raw)})")

if __name__ == "__main__":
    main()
