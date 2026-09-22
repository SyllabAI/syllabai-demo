#!/usr/bin/env python3
"""build_official_content.py — Stage 3 flip generator (gated).

Consumes the Stage 1 official spine (spines/<slug>.json) + the Stage 2
attachment layer (content-maps/<slug>.json) and produces the rekeyed content
bundle: every SME note / flashcard / question part re-attached to official
spec-point codes, the curriculum tree swapped for the official spine, and the
manifest re-stamped. content/ itself is NEVER written by this script — the
flip is applied by a separate, explicitly-run step (Stage 3 proper).

Rekey rules (per course):
  curriculum.json   = spines/<slug>.json curriculum verbatim (official tree)
  notes.json        specPointIds/specPointCodes -> attached codes
                    (spine-resolved preferred), smeSpecPointIds keeps the
                    original spcpt_* ids for traceability, inline
                    `spcpt_*` references in bodyMd are rewritten to codes
  flashcards.json   specPointIds -> codes, specPointCode -> first code,
                    smeSpecPointIds keeps originals
  questions.json    per part: specPointIds/specPointCodes -> codes,
                    smeSpecPointIds keeps originals
  manifest.json     counts recomputed for the official tree,
                    treeKind "sme-native" -> "official-spine"
  concept-graph.json / learner-sim.json / everything else: copied through

Usage:
    python3 scripts/build_official_content.py --check              # validate all 49, no writes
    python3 scripts/build_official_content.py --check --course X   # validate one
    python3 scripts/build_official_content.py --course X --out DIR # materialize one bundle
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import attach_official_map as AOM  # noqa: E402  (Stage 2 resolver reused)

REPO = Path(__file__).resolve().parent.parent
SPCPT_RE = re.compile(r"spcpt_[A-Za-z0-9]+")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def item_codes(entry: dict) -> list[str]:
    """Ordered, de-duplicated attachment codes for one item (spine-resolved
    preferred; unresolved rows fall back to their verbatim officialCode)."""
    out: list[str] = []
    for c in entry.get("codes", []):
        code = c.get("spineCode") or c.get("officialCode")
        if code and code not in out:
            out.append(code)
    return out


def rekey_course(slug: str) -> dict:
    """Build the rekeyed bundle in memory and return it with stats."""
    spine = load_json(REPO / "spines" / f"{slug}.json")
    att = load_json(REPO / "content-maps" / f"{slug}.json")
    cdir = REPO / "content" / slug

    spine_codes = {n["code"] for n in spine["curriculum"]["nodes"] if n["family"] == "SPEC_POINT"}
    items = att["items"]
    spcpt_map_raw = att["spcptToOfficial"]
    ctx = AOM.course_ctx(spine["meta"].get("scopeRule") or {}, spine_codes)
    # spcpt -> display code: spine-resolved when possible, verbatim otherwise
    spcpt_map = {
        sid: {
            "spineCode": AOM.resolve_spine_code(
                m.get("officialCode"), m.get("officialId"), m.get("unit"), ctx, spine_codes
            ),
            "officialCode": m.get("officialCode"),
        }
        for sid, m in spcpt_map_raw.items()
    }

    # ---- curriculum: official spine verbatim -----------------------------
    curriculum = spine["curriculum"]

    # ---- notes -------------------------------------------------------------
    src_notes = load_json(cdir / "notes.json")
    notes, notes_resid, notes_unmapped_items = [], 0, 0
    for n in src_notes:
        entry = items.get(n["noteId"], {})
        codes = item_codes(entry)
        if not codes:
            notes_unmapped_items += 1
        body = n.get("bodyMd") or ""
        resid_here = []

        def sub(m: re.Match) -> str:
            sid = m.group(0)
            mapped = spcpt_map.get(sid) or {}
            code = mapped.get("spineCode") or mapped.get("officialCode")
            if not code:
                resid_here.append(sid)
                return sid
            return code

        new_body = SPCPT_RE.sub(sub, body)
        notes_resid += len(resid_here)
        notes.append({
            **n,
            "specPointIds": codes,
            "specPointCodes": codes,
            "smeSpecPointIds": n.get("specPointIds") or [],
            "bodyMd": new_body,
        })

    # ---- flashcards ----------------------------------------------------------
    fc_path = cdir / "flashcards.json"
    src_cards = load_json(fc_path) if fc_path.exists() else []
    cards, cards_unmapped_items = [], 0
    for f in src_cards:
        entry = items.get(f["id"], {})
        codes = item_codes(entry)
        if not codes:
            cards_unmapped_items += 1
        cards.append({
            **f,
            "specPointIds": codes,
            "specPointCode": codes[0] if codes else None,
            "smeSpecPointIds": f.get("specPointIds") or [],
        })

    # ---- questions -----------------------------------------------------------
    src_sets = load_json(cdir / "questions.json")
    qsets, parts_unmapped_items, part_count = [], 0, 0
    for s in src_sets:
        s2 = {**s, "questions": []}
        for q in s.get("questions", []):
            q2 = {**q, "parts": []}
            for p in q.get("parts", []):
                part_count += 1
                entry = items.get(p["id"], {})
                codes = item_codes(entry)
                if not codes:
                    parts_unmapped_items += 1
                q2["parts"].append({
                    **p,
                    "specPointIds": codes,
                    "specPointCodes": codes,
                    "smeSpecPointIds": p.get("specPointIds") or [],
                })
            s2["questions"].append(q2)
        qsets.append(s2)

    # ---- manifest --------------------------------------------------------------
    src_manifest = load_json(cdir / "manifest.json")
    sections = {n["code"] for n in curriculum["nodes"] if n["family"] == "TOPIC"}
    topics = {n["code"] for n in curriculum["nodes"] if n["family"] == "SUBTOPIC"}
    spec_points = len(spine_codes)
    manifest = {
        **src_manifest,
        "treeKind": "official-spine",
        "officialSpine": {
            "spine": f"spines/{slug}.json",
            "resourcesSha": att["resourcesSha"],
            "attachmentMap": f"content-maps/{slug}.json",
        },
        "counts": {
            **src_manifest.get("counts", {}),
            "sections": len(sections),
            "topics": len(topics),
            "specPoints": spec_points,
        },
    }

    return {
        "curriculum.json": curriculum,
        "notes.json": notes,
        "flashcards.json": cards,
        "questions.json": qsets,
        "manifest.json": manifest,
        "_stats": {
            "spineSpecPoints": spec_points,
            "notes": len(notes),
            "notesUnmapped": notes_unmapped_items,
            "notesInlineResidual": notes_resid,
            "flashcards": len(cards),
            "flashcardsUnmapped": cards_unmapped_items,
            "questionParts": part_count,
            "questionPartsUnmapped": parts_unmapped_items,
        },
    }


def check_course(slug: str, bundle: dict) -> list[str]:
    """Hard validations for one rekeyed bundle. Returns list of failures."""
    problems: list[str] = []
    stats = bundle["_stats"]
    spine = load_json(REPO / "spines" / f"{slug}.json")
    spine_codes = {n["code"] for n in spine["curriculum"]["nodes"] if n["family"] == "SPEC_POINT"}
    att = load_json(REPO / "content-maps" / f"{slug}.json")
    cdir = REPO / "content" / slug

    # 1. every attached code exists in the spine (or is an honest outside row)
    for iid, entry in att["items"].items():
        for c in entry.get("codes", []):
            if c.get("spineCode") and c["spineCode"] not in spine_codes:
                problems.append(f"{iid}: spineCode {c['spineCode']} not in spine")

    # 2. counts preserved through the rekey
    src_notes = len(load_json(cdir / "notes.json"))
    if src_notes != stats["notes"]:
        problems.append(f"notes count drift {src_notes} -> {stats['notes']}")
    fc_path = cdir / "flashcards.json"
    src_cards = len(load_json(fc_path)) if fc_path.exists() else 0
    if src_cards != stats["flashcards"]:
        problems.append(f"flashcards count drift {src_cards} -> {stats['flashcards']}")
    src_sets = load_json(cdir / "questions.json")
    src_parts = sum(len(q.get("parts", [])) for s in src_sets for q in s.get("questions", []))
    if src_parts != stats["questionParts"]:
        problems.append(f"parts count drift {src_parts} -> {stats['questionParts']}")

    # 3. no spcpt token survives in rekeyed linkage fields
    for n in bundle["notes.json"]:
        if SPCPT_RE.search(json.dumps(n["specPointIds"]) + json.dumps(n["specPointCodes"])):
            problems.append(f"note {n['noteId']}: spcpt token survived in linkage fields")
    for f in bundle["flashcards.json"]:
        if SPCPT_RE.search(json.dumps(f["specPointIds"]) + json.dumps(str(f["specPointCode"]))):
            problems.append(f"flashcard {f['id']}: spcpt token survived in linkage fields")
    for s in bundle["questions.json"]:
        for q in s["questions"]:
            for p in q["parts"]:
                if SPCPT_RE.search(json.dumps(p["specPointIds"]) + json.dumps(p["specPointCodes"])):
                    problems.append(f"part {p['id']}: spcpt token survived in linkage fields")

    # 4. curriculum is the official spine (family counts sane)
    cur = bundle["curriculum.json"]
    if not any(n["family"] == "SUBJECT" for n in cur["nodes"]):
        problems.append("curriculum missing SUBJECT node")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--course")
    ap.add_argument("--out", type=Path, help="materialize rekeyed bundle for --course")
    ap.add_argument("--check", action="store_true", help="validate (all courses or --course), no writes")
    args = ap.parse_args()

    courses = sorted(p.name for p in (REPO / "content").iterdir() if p.is_dir())
    if args.course:
        if args.course not in courses:
            print(f"unknown course {args.course!r}", file=sys.stderr)
            return 2
        courses = [args.course]

    if args.out:
        if not args.course:
            print("--out requires --course", file=sys.stderr)
            return 2
        bundle = rekey_course(args.course)
        stats = bundle.pop("_stats")
        args.out.mkdir(parents=True, exist_ok=True)
        for name, data in bundle.items():
            (args.out / name).write_text(
                json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
            )
        print(f"materialized {args.course} -> {args.out}")
        print(json.dumps(stats, indent=1))
        return 0

    if not args.check:
        print("nothing to do: pass --check or --out (see --help)", file=sys.stderr)
        return 2

    agg = []
    failed = 0
    for slug in courses:
        bundle = rekey_course(slug)
        problems = check_course(slug, bundle)
        stats = bundle["_stats"]
        row = {"course": slug, **{k: v for k, v in stats.items()}}
        if problems:
            failed += 1
            row["problems"] = problems
            print(f"FAIL {slug}")
            for p in problems[:8]:
                print(f"   - {p}")
        agg.append(row)

    tot = {
        "courses": len(agg),
        "failed": failed,
        "notesUnmapped": sum(r["notesUnmapped"] for r in agg),
        "flashcardsUnmapped": sum(r["flashcardsUnmapped"] for r in agg),
        "questionPartsUnmapped": sum(r["questionPartsUnmapped"] for r in agg),
        "inlineResidual": sum(r["notesInlineResidual"] for r in agg),
    }
    print(json.dumps(tot, indent=1))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
