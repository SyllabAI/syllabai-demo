#!/usr/bin/env python3
"""normalize_board_level_tags.py — content-truth tag normalization (Ict-class fixes).

Fixes surfaced by scripts/content_tag_audit.py (first full corpus run):

  F1 board      'Edexcel' -> 'Pearson Edexcel' in manifest.curriculum and every
                questions.json topic-set curriculum block (943 tag blocks).
                curriculum.json truth already says 'Pearson Edexcel'; the exporter
                hardcodes it; the live fork renders it. Manifests/questions held
                the legacy short form.
  F2 level      igcse-chemistry-19/curriculum.json 'International GCSE' -> 'IGCSE'
                (the only course whose curriculum level disagreed with registry,
                manifest, questions, kg export and the rendered fork).
  F3 year       igcse-chemistry-19 manifest + question blocks '2017' ->
                '2017 (Issue 3)' to match curriculum truth (kg meta already
                carries the Issue-3 form via curriculum passthrough).
  F4 counts     manifest.counts {sections,topics,specPoints} re-derived from
                curriculum family counts for the 3 courses whose counts predate
                a curriculum rebuild (accounting x2, geography-19). Semantics
                verified corpus-wide: sections==TOPIC, topics==SUBTOPIC,
                specPoints==SPEC_POINT (46/49 held before this fix).

Scoped edits only: exact key:value byte patterns — prose mentions of 'Edexcel'
in notes/flashcards/question text are NOT touched. Every touched file is
re-parsed to guarantee JSON validity, and counts are verified before/after.

Usage: python3 scripts/normalize_board_level_tags.py [--dry-run]
"""
import argparse
import glob
import json
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TOTAL = Counter()


def tag_blocks_with_board_edexcel(raw_parsed):
    """Count parsed tag-shaped dicts whose board is exactly 'Edexcel'."""
    n = 0

    def walk(o):
        nonlocal n
        if isinstance(o, dict):
            if o.get("board") == "Edexcel" and {"board", "level", "subject"} <= set(o):
                n += 1
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(raw_parsed)
    return n


def fix_board():
    """F1: exact-key replace, both spacing variants, manifests + question sets."""
    patterns = [('"board":"Edexcel"', '"board":"Pearson Edexcel"'),
                ('"board": "Edexcel"', '"board": "Pearson Edexcel"')]
    for path in sorted(glob.glob(str(REPO / "content/*/manifest.json"))) + \
                sorted(glob.glob(str(REPO / "content/*/questions.json"))):
        raw = Path(path).read_text(encoding="utf-8")
        parsed = json.loads(raw)
        expect = tag_blocks_with_board_edexcel(parsed)
        if expect == 0:
            continue
        n_repl = 0
        new = raw
        for old, repl in patterns:
            c = new.count(old)
            if c:
                n_repl += c
                new = new.replace(old, repl)
        if n_repl != expect:
            raise SystemExit(f"{path}: replaced {n_repl} board keys but parsed {expect} tag blocks")
        json.loads(new)  # validity gate
        Path(path).write_text(new, encoding="utf-8")
        TOTAL["board_keys"] += n_repl
        TOTAL["board_files"] += 1
        print(f"  F1 {Path(path).relative_to(REPO)}: {n_repl} board keys")


def fix_chem19_level_and_year():
    """F2 + F3: chemistry-19 level tag and derived-surface year stamps."""
    cur = REPO / "content/igcse-chemistry-19/curriculum.json"
    raw = cur.read_text(encoding="utf-8")
    if '"level":"International GCSE"' in raw:
        raw = raw.replace('"level":"International GCSE"', '"level":"IGCSE"')
        json.loads(raw)
        cur.write_text(raw, encoding="utf-8")
        TOTAL["level"] += 1
        print("  F2 igcse-chemistry-19/curriculum.json: level -> IGCSE")

    for rel in ("content/igcse-chemistry-19/manifest.json",
                "content/igcse-chemistry-19/questions.json"):
        p = REPO / rel
        raw = p.read_text(encoding="utf-8")
        c = raw.count('"syllabusVersion":"2017"')
        if c:
            raw = raw.replace('"syllabusVersion":"2017"', '"syllabusVersion":"2017 (Issue 3)"')
            json.loads(raw)
            p.write_text(raw, encoding="utf-8")
            TOTAL["year_keys"] += c
            print(f"  F3 {rel}: {c} syllabusVersion stamps -> '2017 (Issue 3)'")


def fix_stale_counts():
    """F4: re-derive the three count fields from curriculum families."""
    targets = ["igcse-accounting-17-financial-statements",
               "igcse-accounting-17-introduction-to-bookkeeping-and-accounting",
               "igcse-geography-19"]
    for slug in targets:
        cur = json.loads((REPO / f"content/{slug}/curriculum.json").read_text(encoding="utf-8"))
        fams = Counter(n["family"] for n in cur["nodes"])
        want = {"sections": fams.get("TOPIC", 0),
                "topics": fams.get("SUBTOPIC", 0),
                "specPoints": fams.get("SPEC_POINT", 0)}
        p = REPO / f"content/{slug}/manifest.json"
        man = json.loads(p.read_text(encoding="utf-8"))
        have = {k: man["counts"].get(k) for k in want}
        if have == want:
            continue
        raw = p.read_text(encoding="utf-8")
        for k, v in want.items():
            import re
            # compact serialization, keyed inside "counts" only — anchored replace
            pat = re.compile(r'("' + k + r'":\s*)\d+')
            hits = pat.findall(raw)
            if len(hits) != 1:
                raise SystemExit(f"{p}: expected exactly 1 {k} key, found {len(hits)}")
            raw = pat.sub(lambda m: f"{m.group(1)}{v}", raw, count=1)
        json.loads(raw)
        p.write_text(raw, encoding="utf-8")
        TOTAL["counts_files"] += 1
        print(f"  F4 {slug}: counts {have} -> {want}")


def fix_subject_forms():
    """F5: subject tag values must use the canonical registry form.
    Slug-derived hyphenated forms in manifests; 'English Language A' variant
    form in english-language-a question blocks (the A is the qualification
    variant, not part of the subject tag — registry/curriculum/kg all say
    'English Language')."""
    mapping = [('"subject":"English-language"', '"subject":"English Language"'),
               ('"subject": "English-language"', '"subject": "English Language"'),
               ('"subject":"English-literature"', '"subject":"English Literature"'),
               ('"subject": "English-literature"', '"subject": "English Literature"'),
               ('"subject":"Further-maths"', '"subject":"Further Maths"'),
               ('"subject": "Further-maths"', '"subject": "Further Maths"'),
               ('"subject":"English Language A"', '"subject":"English Language"'),
               ('"subject": "English Language A"', '"subject": "English Language"')]
    for path in sorted(glob.glob(str(REPO / "content/*/manifest.json"))) + \
                sorted(glob.glob(str(REPO / "content/*/questions.json"))):
        raw = Path(path).read_text(encoding="utf-8")
        n_repl = 0
        new = raw
        for old, repl in mapping:
            c = new.count(old)
            if c:
                n_repl += c
                new = new.replace(old, repl)
        if n_repl:
            json.loads(new)
            Path(path).write_text(new, encoding="utf-8")
            TOTAL["subject_keys"] += n_repl
            TOTAL["subject_files"] += 1
            print(f"  F5 {Path(path).relative_to(REPO)}: {n_repl} subject keys")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.dry_run:
        print("dry-run: no writes (not implemented — edit deliberately)")
        return
    fix_board()
    fix_chem19_level_and_year()
    fix_stale_counts()
    fix_subject_forms()
    print(f"\nDONE: {dict(TOTAL)}")
    print("next: python3 scripts/content_tag_audit.py  (expect 0 FAIL)")


if __name__ == "__main__":
    main()
