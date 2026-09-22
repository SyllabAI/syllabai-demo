#!/usr/bin/env python3
"""apply_official_flip.py — Stage 3 proper: materialize the official flip into
content/, for every course EXCEPT the chemistry gold standard.

Consumes (both committed, sha-pinned, validated):
    spines/<slug>.json         Stage 1 official spine
    content-maps/<slug>.json   Stage 2 attachment layer
    build_official_content.py  the rekey generator (--check 49/49 at apply time)

Writes exactly five files per flipped course, in the corpus' own compact
serialization (separators=(",", ":"), ensure_ascii=False, NO trailing newline):
    curriculum.json   official spine tree verbatim
    notes.json        linkage rekeyed to official codes, smeSpecPointIds kept
    flashcards.json   ditto
    questions.json    ditto (per part)
    manifest.json     treeKind "official-spine" + officialSpine provenance

Everything else in content/<slug>/ (concept-graph.json, learner-sim.json, ...)
is left byte-untouched.

HARD GATES enforced here (apply aborts if any fails, per course, before the
next course is touched):
    G1  flipped curriculum deep-equals the spine curriculum
    G2  item counts preserved (notes / flashcards / question parts)
    G3  zero spcpt_* tokens survive in rekeyed LINKAGE fields
        (specPointIds / specPointCodes / specPointCode — smeSpecPointIds
        intentionally keeps the originals; bodyMd inline residuals are the
        documented honest class and are excluded from this scan)
    G4  every linked code resolves to a SPEC_POINT node of the new tree
        (app-level referential integrity)
    G5  manifest stamped treeKind "official-spine" with officialSpine block

igcse-chemistry-19 is REFUSED by construction: its tree is already official
("treeKind": "official") and its KG export is the byte-golden snapshot.

Usage:
    python3 scripts/apply_official_flip.py [--course SLUG]... [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_official_content as BOC  # noqa: E402  (Stage 2/3 generator reused)

REPO = Path(__file__).resolve().parent.parent
CONTENT = REPO / "content"
GOLDEN = "igcse-chemistry-19"
SPCPT_RE = re.compile(r"spcpt_[A-Za-z0-9]+")

WRITE_FILES = ["curriculum.json", "notes.json", "flashcards.json", "questions.json", "manifest.json"]


def dump_compact(data) -> bytes:
    """The corpus' own serialization: compact, UTF-8, no trailing newline."""
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def linkage_codes(entry) -> list[str]:
    out: list[str] = []
    if isinstance(entry, dict):
        for v in entry.get("specPointIds", []) or []:
            out.append(v)
        for v in entry.get("specPointCodes", []) or []:
            out.append(v)
        sc = entry.get("specPointCode")
        if sc:
            out.append(sc)
    return out


def verify_bundle(slug: str, bundle: dict, spine_codes: set[str]) -> list[str]:
    problems: list[str] = []
    stats = bundle["_stats"]

    # G1 curriculum == spine (deep), with the syllabusVersion overlay the
    # flip applies from the corpus manifest (spine does not assert a year)
    spine = json.loads((REPO / "spines" / f"{slug}.json").read_text(encoding="utf-8"))
    expected = dict(spine["curriculum"])
    _syll = ((json.loads((CONTENT / slug / "manifest.json").read_text(encoding="utf-8"))
              .get("curriculum")) or {}).get("syllabusVersion")
    if _syll:
        expected["syllabusVersion"] = _syll
    if bundle["curriculum.json"] != expected:
        problems.append("curriculum != spine curriculum (+syllabusVersion overlay) (deep)")

    # G2 counts preserved vs the pre-flip files (read fresh from disk)
    cdir = CONTENT / slug
    if len(json.loads((cdir / "notes.json").read_text(encoding="utf-8"))) != stats["notes"]:
        problems.append("notes count drift")
    fc = cdir / "flashcards.json"
    if fc.exists() and len(json.loads(fc.read_text(encoding="utf-8"))) != stats["flashcards"]:
        problems.append("flashcards count drift")
    src_parts = sum(
        len(q.get("parts", []))
        for s in json.loads((cdir / "questions.json").read_text(encoding="utf-8"))
        for q in s.get("questions", [])
    )
    if src_parts != stats["questionParts"]:
        problems.append("question parts count drift")

    # G3 no spcpt token in linkage fields
    for n in bundle["notes.json"]:
        if SPCPT_RE.search(json.dumps(n["specPointIds"]) + json.dumps(n["specPointCodes"])):
            problems.append(f"note {n['noteId']}: spcpt in linkage")
    for f in bundle["flashcards.json"]:
        if SPCPT_RE.search(json.dumps(f["specPointIds"]) + json.dumps(str(f["specPointCode"]))):
            problems.append(f"flashcard {f['id']}: spcpt in linkage")
    for s in bundle["questions.json"]:
        for q in s["questions"]:
            for p in q["parts"]:
                if SPCPT_RE.search(json.dumps(p["specPointIds"]) + json.dumps(p["specPointCodes"])):
                    problems.append(f"part {p['id']}: spcpt in linkage")

    # G4 every linked code resolves inside the new tree
    outside: dict[str, str] = {}
    for n in bundle["notes.json"]:
        for c in linkage_codes(n):
            if c not in spine_codes:
                outside[f"note:{n['noteId']}"] = c
    for f in bundle["flashcards.json"]:
        for c in linkage_codes(f):
            if c not in spine_codes:
                outside[f"flashcard:{f['id']}"] = c
    for s in bundle["questions.json"]:
        for q in s["questions"]:
            for p in q["parts"]:
                for c in linkage_codes(p):
                    if c not in spine_codes:
                        outside[f"part:{p['id']}"] = c
    if outside:
        sample = list(outside.items())[:6]
        problems.append(f"{len(outside)} linkage codes outside spine, e.g. {sample}")

    # G5 manifest stamp
    m = bundle["manifest.json"]
    if m.get("treeKind") != "official-spine":
        problems.append(f"manifest treeKind {m.get('treeKind')!r} != 'official-spine'")
    if not isinstance(m.get("officialSpine"), dict):
        problems.append("manifest missing officialSpine block")

    return problems


def apply_course(slug: str, dry_run: bool) -> dict:
    bundle = BOC.rekey_course(slug)
    spine = json.loads((REPO / "spines" / f"{slug}.json").read_text(encoding="utf-8"))
    spine_codes = {
        n["code"] for n in spine["curriculum"]["nodes"] if n["family"] == "SPEC_POINT"
    }
    problems = verify_bundle(slug, bundle, spine_codes)
    stats = bundle.pop("_stats")
    row = {"course": slug, **stats, "ok": not problems}
    if problems:
        row["problems"] = problems
        return row
    if dry_run:
        return row

    cdir = CONTENT / slug
    for name in WRITE_FILES:
        data = bundle[name]
        blob = dump_compact(data)
        # post-serialization round-trip check before replacing anything
        if json.loads(blob.decode("utf-8")) != data:
            raise RuntimeError(f"{slug}/{name}: serialization round-trip mismatch")
        tmp = cdir / (name + ".flip-tmp")
        tmp.write_bytes(blob)
        os.replace(tmp, cdir / name)
    return row


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--course", action="append", default=[],
                    help="restrict to these course slugs (repeatable)")
    ap.add_argument("--dry-run", action="store_true",
                    help="verify all gates for every course, write nothing")
    args = ap.parse_args()

    slugs = sorted(p.name for p in CONTENT.iterdir() if p.is_dir())
    if args.course:
        unknown = [c for c in args.course if c not in slugs]
        if unknown:
            print(f"unknown courses: {unknown}", file=sys.stderr)
            return 2
        slugs = args.course
    if GOLDEN in slugs:
        print(f"REFUSED: {GOLDEN} is the byte-golden official course — excluded by construction",
              file=sys.stderr)
        slugs = [s for s in slugs if s != GOLDEN]

    rows, failed = [], 0
    for slug in slugs:
        row = apply_course(slug, args.dry_run)
        rows.append(row)
        if not row["ok"]:
            failed += 1
            print(f"FAIL {slug}: {row.get('problems', [])[:4]}", file=sys.stderr)
        else:
            print(f"  ok  {slug:70s} notes={row['notes']:4d} cards={row['flashcards']:5d} "
                  f"parts={row['questionParts']:5d} "
                  f"(unmapped {row['notesUnmapped']}/{row['flashcardsUnmapped']}"
                  f"/{row['questionPartsUnmapped']})")

    report = {
        "mode": "dry-run" if args.dry_run else "apply",
        "goldenExcluded": GOLDEN,
        "courses": len(rows),
        "failed": failed,
        "totals": {
            "notes": sum(r["notes"] for r in rows),
            "flashcards": sum(r["flashcards"] for r in rows),
            "questionParts": sum(r["questionParts"] for r in rows),
            "notesUnmapped": sum(r["notesUnmapped"] for r in rows),
            "flashcardsUnmapped": sum(r["flashcardsUnmapped"] for r in rows),
            "questionPartsUnmapped": sum(r["questionPartsUnmapped"] for r in rows),
            "notesInlineResidual": sum(r["notesInlineResidual"] for r in rows),
        },
        "rows": rows,
    }
    out = Path("/home/z/my-project/work/stage3")
    out.mkdir(parents=True, exist_ok=True)
    (out / ("flip_dryrun.json" if args.dry_run else "flip_report.json")).write_text(
        json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\n{len(rows) - failed}/{len(rows)} courses ok "
          f"({'dry-run' if args.dry_run else 'APPLIED'}), golden {GOLDEN} excluded")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
