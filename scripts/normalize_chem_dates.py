#!/usr/bin/env python3
"""
Double-award chemistry date pass — normalize year-only dates + month-prefixed
number spellings to the canonical ("Month YYYY", "1C/1CR/2C/2CR") form, fix
the '202'/'20202' year typos and polluted numbers, and apply six per-part
attribution pins. Every target value is evidence-backed (see worklog Task 7):

  - Month/session lives in the number prefix (Ja/Jan->January, Ju/Jun->June,
    Nov/N->November); parseReconstruction semantics are PRESERVED for every
    pure-spelling pair (same sessionIds, same variant).
  - '202' -> 2020 and '20202' -> 2020: sibling evidence (same question, same
    number) + QP text presence.
  - 'Ja202C'/'Ja202R' -> January 2020 "2C": QP text search — every one of the
    9 polluted parts sits in 2020-01 4CH1-2C (Q1 footer 5, Q2 footer 11,
    Q4 footer 9), the R-marker phrases are 2C-exclusive, and the R paper
    negatives hold. "Ja202R" was pure pollution, not a regional marker.
  - 'Ja42' -> January 2022 "1C": "sodium peroxide" is in 2022-01 4CH1-1C Q6
    (blueprint Q6=9 = recon 9); siblings are Jan1C/Ja1C.
  - bare 'Ja' -> January 2020 "1C": siblings Ja1C, "aluminium powder with
    iron(III) oxide" in 2020-01 4CH1-1C Q3 (footer 10 = recon 10), and the
    part's own image asset is named "2020-ja1c-q3c".
  - ('2021', None) -> January 2021 "1CR": siblings Ja1CR; "Name a mixture" in
    2021-01 4CH1-1CR Q1 (footer 6 = recon 6).
  - Specimen rows -> date "Specimen" + "1C"/"2C": corpus convention (the
    PastPaper interface's own example set), corpus holds 4ch1/specimen/
    4CH1-1C + 4CH1-2C and the index lists that specimen session; QP text +
    footers match exactly (1C: Q4=8, Q5=8, Q6=9, Q7=13; 2C: Q3=7, Q4=6).

  Attribution pins (per-part, falsified claims — same standard as the physics
  pins: text present in the sibling paper, claimed paper nonexistent or
  text-absent, footer/blueprint total exact):
    qstn_3RY3zBNQ5kxfnrH2 6b '2013 Ja1C'      -> January 2020 1C
        (image slug "2020-ja1c-q6b"; absent from 2013-01 4CH0-1C; present in
        2020-01 4CH1-1C Q6, footer 12 = recon 12)
    qstn_FSWmdzbHj2QqkXhz 5b+5c '2015 Ju1CR'  -> June 2019 1CR
        (corpus has NO June 2015 1CR; both texts in 2019-06 4CH1-1CR Q5,
        footer 13 = recon 13)
    qstn_HWgThxjYyWcsSVKZ 1b '2018 Ju2CR'     -> June 2019 2CR
        (corpus has NO June 2018 2CR; "Describe the test for oxygen" in
        2019-06 4CH1-2CR Q1, footer 5 = recon 5)
    qstn_Kdq4TRhYt4ktz4ZR 5b '2011 Ja1CR'     -> January 2021 1CR
        (corpus has NO January 2011 at all; text in 2021-01 4CH1-1CR Q5,
        footer 12 = recon 12)
    qstn_3qf3G39FNKQPHQkV 2a '2021 Jan2CR'    -> June 2021 2C
        (both parts' texts in 2021-06 4CH1-2C Q2, footer 6 = recon 6; absent
        from 2021-01 4CH1-2CR)
    qstn_MVfJ6bsbBjGvh244 1b '2020 Ja2C'      -> January 2021 2C
        (text in 2021-01 4CH1-2C Q1, footer 5 = recon 5; absent from
        2020-01 4CH1-2C; sibling 1a's image slug is "2021-ja2c-q1a")

  Left honest (no change): the 114 (None, None) parts (no provenance recorded)
  and qstn_GKVQpBTG38NQtNSh's genuine two-paper assembly (7a/7b January 2013
  1C + 7c January 2020 1C — both claims verified true in the QPs).

The writer byte-round-trips the file before mutating and aborts on any
(date, number) pair not in the evidence table.
"""
import json
import sys
from collections import Counter

PATH = "content/igcse-science-double-award-17-chemistry/questions.json"

# (old_date, old_number) -> (new_date, new_number). Every pair observed in the
# file is enumerated; anything else aborts. (None, None) stays honest.
PAIRS = {
    # pre-4SD0 era (4CH0 papers); month from the number prefix
    ("2011", "Ja1CR"): ("January 2011", "1CR"),
    ("2013", "Ja1C"): ("January 2013", "1C"),
    ("2015", "Ju1CR"): ("June 2015", "1CR"),
    ("2018", "Ju2CR"): ("June 2018", "2CR"),
    # specimen papers (4CH1 specimen; corpus date convention)
    ("2017", "Specimen1C"): ("Specimen", "1C"),
    ("2017", "Specimen2C"): ("Specimen", "2C"),
    # June 2019
    ("2019", "Ju1C"): ("June 2019", "1C"),
    ("2019", "Ju1c"): ("June 2019", "1C"),
    ("2019", "Ju1CR"): ("June 2019", "1CR"),
    ("2019", "Ju2C"): ("June 2019", "2C"),
    ("2019", "Ju2CR"): ("June 2019", "2CR"),
    # January 2020
    ("2020", "Ja1C"): ("January 2020", "1C"),
    ("2020", "Jan1C"): ("January 2020", "1C"),
    ("2020", "Ja1CR"): ("January 2020", "1CR"),
    ("2020", "Ja2C"): ("January 2020", "2C"),
    ("2020", "Ja2CR"): ("January 2020", "2CR"),
    ("2020", "Ja202C"): ("January 2020", "2C"),
    ("2020", "Ja202R"): ("January 2020", "2C"),
    ("2020", "Ja"): ("January 2020", "1C"),
    # November 2020 (+ year typos)
    ("2020", "Nov1C"): ("November 2020", "1C"),
    ("2020", "Nov1CR"): ("November 2020", "1CR"),
    ("2020", "Nov2C"): ("November 2020", "2C"),
    ("2020", "N2CR"): ("November 2020", "2CR"),
    ("202", "Nov1CR"): ("November 2020", "1CR"),
    ("20202", "Ja202C"): ("January 2020", "2C"),
    # 2021
    ("2021", "Ja1C"): ("January 2021", "1C"),
    ("2021", "Ja1CR"): ("January 2021", "1CR"),
    ("2021", "Ja2C"): ("January 2021", "2C"),
    ("2021", "Jan2CR"): ("January 2021", "2CR"),
    ("2021", None): ("January 2021", "1CR"),
    ("2021", "Ju1C"): ("June 2021", "1C"),
    ("2021", "Ju1c"): ("June 2021", "1C"),
    ("2021", "Jun2C"): ("June 2021", "2C"),
    # 2022
    ("2022", "Ja1C"): ("January 2022", "1C"),
    ("2022", "Jan1C"): ("January 2022", "1C"),
    ("2022", "Jan1CR"): ("January 2022", "1CR"),
    ("2022", "Ja2CR"): ("January 2022", "2CR"),
    ("2022", "Jan2C"): ("January 2022", "2C"),
    ("2022", "Ja42"): ("January 2022", "1C"),
}

# part-level attribution pins: (question_id, questionNumber, questionPart) ->
# (expected old date, expected old number, new date, new number)
PINS = {
    ("qstn_3RY3zBNQ5kxfnrH2", 6, "b"): ("2013", "Ja1C", "January 2020", "1C"),
    ("qstn_FSWmdzbHj2QqkXhz", 5, "b"): ("2015", "Ju1CR", "June 2019", "1CR"),
    ("qstn_FSWmdzbHj2QqkXhz", 5, "c"): ("2015", "Ju1CR", "June 2019", "1CR"),
    ("qstn_HWgThxjYyWcsSVKZ", 1, "b"): ("2018", "Ju2CR", "June 2019", "2CR"),
    ("qstn_Kdq4TRhYt4ktz4ZR", 5, "b"): ("2011", "Ja1CR", "January 2021", "1CR"),
    ("qstn_3qf3G39FNKQPHQkV", 2, "a"): ("2021", "Jan2CR", "June 2021", "2C"),
    ("qstn_MVfJ6bsbBjGvh244", 1, "b"): ("2020", "Ja2C", "January 2021", "2C"),
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
    seen_pins = set()

    for block in data:
        for q in block.get("questions", []):
            qid = q.get("id")
            for p in q.get("parts", []):
                sp = p.get("sourcePaper")
                if not sp:
                    continue
                old = (sp.get("date"), sp.get("number"))
                before[old] += 1

                # 1) attribution pins (part-level)
                key = (qid, sp.get("questionNumber"), sp.get("questionPart"))
                if key in PINS:
                    exp_old, exp_num, new_d, new_n = PINS[key]
                    cur = (sp.get("date"), sp.get("number"))
                    if cur == (new_d, new_n):
                        # idempotent re-run: pin already applied
                        seen_pins.add(key)
                        after[cur] += 1
                        continue
                    if cur != (exp_old, exp_num):
                        sys.exit(
                            f"ABORT: pin {key} expected {(exp_old, exp_num)!r} or "
                            f"already-pinned {(new_d, new_n)!r}, found {cur!r}"
                        )
                    if (sp.get("date"), sp.get("number")) != (new_d, new_n):
                        changes.append((block["slug"], sp.get("questionNumber"), sp.get("questionPart"), "pin", sp.get("date"), sp.get("number"), new_d, new_n, qid))
                        sp["date"], sp["number"] = new_d, new_n
                    seen_pins.add(key)
                    after[(sp.get("date"), sp.get("number"))] += 1
                    continue

                # 2) spelling/typo pair table
                if old == (None, None):
                    after[old] += 1
                    continue
                if old not in PAIRS:
                    # idempotence: already-canonical pairs are a no-op
                    import re as _re2
                    canon_d = (
                        old[0] is None
                        or old[0] == "Specimen"
                        or _re2.fullmatch(r"(January|June|November) \d{4}", str(old[0]))
                    )
                    canon_n = old[1] is None or _re2.fullmatch(r"1C|1CR|2C|2CR", str(old[1]))
                    if canon_d and canon_n:
                        after[old] += 1
                        continue
                    sys.exit(f"ABORT: unknown (date, number) pair {old!r} in {qid}")
                new_d, new_n = PAIRS[old]
                if old != (new_d, new_n):
                    changes.append((block["slug"], sp.get("questionNumber"), sp.get("questionPart"), "norm", sp.get("date"), sp.get("number"), new_d, new_n, qid))
                    sp["date"], sp["number"] = new_d, new_n
                after[(sp.get("date"), sp.get("number"))] += 1

    missing_pins = set(PINS) - seen_pins
    if missing_pins:
        sys.exit(f"ABORT: pins never matched: {sorted(missing_pins)}")

    print(f"changed parts: {len(changes)}\n")
    for slug, qn, qp, kind, od, on, nd, nn, qid in changes:
        print(f"  {slug[:40]:40s} qn={qn}{qp or ''}\t{kind}: {od!r}/{on!r} -> {nd!r}/{nn!r}  ({qid})")

    print(f"\n(date, number) pairs: before={len(before)} after={len(after)}")
    print("\nafter pairs:")
    for (dt, n), c in sorted(after.items(), key=lambda x: (str(x[0][0]), str(x[0][1]))):
        print(f"{c:4d}  date={dt!r:18s} number={n!r}")

    # post-conditions: every date canonical, every number canonical
    import re as _re
    bad = [
        (dt, n)
        for (dt, n) in after
        if not (
            dt is None
            or dt == "Specimen"
            or _re.fullmatch(r"(January|June|November) \d{4}", str(dt))
        )
        or not (n is None or _re.fullmatch(r"1C|1CR|2C|2CR", str(n)))
    ]
    if bad:
        sys.exit(f"ABORT: non-canonical pairs remain: {bad}")

    # report residual mixed-paper questions (expected: exactly the GKVQ assembly)
    mixed = []
    for block in data:
        for q in block.get("questions", []):
            sps = [p.get("sourcePaper") or {} for p in q.get("parts", []) if p.get("sourcePaper")]
            vals = {(sp.get("date"), sp.get("number")) for sp in sps if sp.get("date") or sp.get("number")}
            if len(vals) > 1:
                mixed.append((q["id"], sorted(vals)))
    print("\nresidual mixed-provenance questions (expected: GKVQ assembly only):")
    for qid, vals in mixed:
        print(f"  {qid}: {vals}")
    if [q for q, _ in mixed] != ["qstn_GKVQpBTG38NQtNSh"]:
        print("  NOTE: unexpected mixed set — review above")

    out = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(PATH, "wb") as f:
        f.write(out)
    print(f"\nwritten: {PATH} ({len(out)} bytes; was {len(raw)})")


if __name__ == "__main__":
    main()
