#!/usr/bin/env python3
"""kg_export.py — per-course canonicalKG export for the OpenHuman visualizer.

    content/<slug>/curriculum.json  ->  public/kg/data/<slug>.json  (+ index.json)

Contract: GRAPH_CONTRACT v1.0 — node types Subject / Section / SubTopic /
SpecificationPoint / ExamPaper; edge types hier / pre / rel / assess.

v1 ships hier edges only: curriculum.json carries no prerequisite, relation or
paper metadata, and the corpus discipline forbids inventing edges. The 4CH1
counts cross-check against the prototype's hand-curated dataset (1 Subject /
4 Sections / 28 SubTopics / 182 SpecificationPoints, 214 hier edges).

Node id conventions mirror the visualizer build exactly:
    Subject             id 'subject'
    Section             id 'sec<N>'            (N = 1-based curriculum order)
    SubTopic            id '<N><a..z|aa..zz>'  (section number + letter)
    SpecificationPoint  id 'p:<pointId>'       (pointId '1.5C' when the
                                               official code is numeric, else
                                               the SME code, verbatim)

The payload carries the build's own table shapes (sections / subtopics /
points / subPointCounts / sectionAnchors / pointSubtopics) so the loader fork
rebuilds the graph through the renderer's own makeBase() pipeline.

Usage:
    python3 scripts/kg_export.py                 # export all courses
    python3 scripts/kg_export.py --qual igcse-chemistry-19
    python3 scripts/kg_export.py --check-only    # validate, write nothing
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import math
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CONTENT = REPO / "content"
OUT_DIR = REPO / "public" / "kg" / "data"

CONTRACT_VERSION = "1.0"
NODE_TYPES = {"Subject", "Section", "SubTopic", "SpecificationPoint", "ExamPaper"}
EDGE_TYPES = {"hier", "pre", "rel", "assess"}

# section colours (first four = the build's own 4CH1 palette)
SECTION_COLORS = [
    "#6656a9", "#2a8b8a", "#3d79a6", "#4a9b70",
    "#c38422", "#a85566", "#5b6ee1", "#7a7a52",
]

NUMERIC_POINT = re.compile(r"^\d+\.\d+[A-Z]?$")


def sub_letter(seq: int) -> str:
    """0 -> 'a', 25 -> 'z', 26 -> 'aa', 27 -> 'ab', ... (no collision)."""
    if seq < 26:
        return chr(ord("a") + seq)
    return chr(ord("a") + seq // 26 - 1) + chr(ord("a") + seq % 26)


def point_id_for(qual_code: str, raw_code: str) -> str:
    """'4CH1-1.5C' -> '1.5C'; opaque SME codes pass through verbatim."""
    prefix = qual_code + "-"
    if raw_code.startswith(prefix):
        stripped = raw_code[len(prefix):]
        if NUMERIC_POINT.match(stripped):
            return stripped
    return raw_code


def section_anchor(i: int, n: int) -> tuple[float, float]:
    """Ellipse ring around the subject node (750, 420), like the build's
    hand-placed 4CH1 anchors (390,220) (1090,220) (420,640) (1080,650)."""
    cx, cy = 750.0, 420.0
    if n == 1:
        return (cx + 330.0, cy)
    rx, ry = 370.0 * max(1.0, math.sqrt(n / 4)), 240.0 * max(1.0, math.sqrt(n / 4))
    angle = -math.pi / 2 + 2 * math.pi * i / n
    return (round(cx + rx * math.cos(angle), 1), round(cy + ry * math.sin(angle), 1))


class ExportError(Exception):
    pass


def export_course(slug: str, registry: dict[str, dict]) -> dict:
    cur_path = CONTENT / slug / "curriculum.json"
    cur = json.loads(cur_path.read_text(encoding="utf-8"))
    nodes = cur["nodes"]
    qual_code = cur.get("code") or slug

    # display truth: the course registry carries clean labels ("English Literature",
    # level "IGCSE"/"IAL"); curriculum meta can hold raw ids ("English-literature")
    reg = registry.get(slug, {})
    display_subject = reg.get("subject") or cur.get("subject") or slug
    display_level = reg.get("level") or cur.get("level") or ""
    display_code = reg.get("code") or qual_code

    by_code = {n["code"]: n for n in nodes}
    families = collections.Counter(n["family"] for n in nodes)
    if families.get("SUBJECT", 0) != 1:
        raise ExportError(f"{slug}: expected exactly 1 SUBJECT node, got {families.get('SUBJECT', 0)}")

    subject = next(n for n in nodes if n["family"] == "SUBJECT")
    topics = [n for n in nodes if n["family"] == "TOPIC"]
    subtopics = [n for n in nodes if n["family"] == "SUBTOPIC"]
    points = [n for n in nodes if n["family"] == "SPEC_POINT"]
    if not topics:
        raise ExportError(f"{slug}: no TOPIC nodes")

    # --- sections (curriculum order) -------------------------------------
    sec_key_of = {}          # topic code -> "1".."N"
    sections_tbl = {}        # "1" -> {label, color}
    for i, t in enumerate(topics, start=1):
        key = str(i)
        sec_key_of[t["code"]] = key
        sections_tbl[key] = {
            "label": t["title"],
            "color": SECTION_COLORS[(i - 1) % len(SECTION_COLORS)],
        }

    # --- subtopics, grouped under their section ---------------------------
    subs_by_section: dict[str, list[dict]] = collections.defaultdict(list)
    sub_id_of: dict[str, str] = {}   # subtopic code -> build id ("1a")
    for st in subtopics:
        parents = st.get("parents") or []
        topic_code = next((p for p in parents if p in sec_key_of), None)
        if topic_code is None:
            raise ExportError(f"{slug}: SUBTOPIC {st['code']} has no TOPIC parent")
        subs_by_section[topic_code].append(st)
    subtopics_tbl: dict[str, list[list[str]]] = {}
    for topic_code, sts in subs_by_section.items():
        key = sec_key_of[topic_code]
        defs = []
        for j, st in enumerate(sts):
            sid = key + sub_letter(j)
            sub_id_of[st["code"]] = sid
            defs.append([sid, st["title"]])
        subtopics_tbl[key] = defs

    # duplicate subtopic titles within a section would break the build's
    # parentSubtopicId() title matching — refuse rather than guess
    for topic_code, sts in subs_by_section.items():
        titles = [st["title"] for st in sts]
        if len(set(titles)) != len(titles):
            raise ExportError(f"{slug}: duplicate subtopic titles in section "
                              f"{sec_key_of[topic_code]} ({topic_code})")

    # --- points: explicit subtopic mapping (from curriculum parents) ------
    points_list = []
    point_subs: dict[str, list[str]] = collections.defaultdict(list)  # sub build id -> [pointId]
    seen_pid = {}
    for p in points:
        pid = point_id_for(qual_code, p["code"])
        if pid in seen_pid:
            raise ExportError(f"{slug}: duplicate pointId {pid} ({p['code']} vs {seen_pid[pid]})")
        seen_pid[pid] = p["code"]
        parents = p.get("parents") or []
        sub_codes = [c for c in parents if c in sub_id_of]
        if len(sub_codes) != 1:
            raise ExportError(f"{slug}: SPEC_POINT {p['code']} has {len(sub_codes)} "
                              f"SUBTOPIC parents ({parents})")
        points_list.append({"id": pid, "text": p["title"]})
        point_subs[sub_id_of[sub_codes[0]]].append(pid)

    # numeric ids must order strictly within a section (port of pointOrd gate)
    # ord key = tuple of numeric components + trailing letter, so multi-level
    # codes (economics '1.1.1a') and letter suffixes ('1.5C', '1.3A' vs '1.3B')
    # order naturally; plain '1.5' sorts before '1.5C'
    def _ord_key(pid: str):
        head = pid.split(".", 1)[0] if "." in pid else pid
        parts = pid.split(".")
        nums = []
        letter = ""
        for i, comp in enumerate(parts):
            if i == 0 and comp == head and len(parts) > 1:
                nums.append(float(comp))
                continue
            m = re.match(r"^(\d+)([A-Za-z]*)$", comp)
            if m:
                nums.append(float(m.group(1)))
                letter = m.group(2) or letter
            else:
                try:
                    nums.append(float(comp.rstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")))
                except ValueError:
                    nums.append(0.0)
        return tuple(nums) + (letter,)

    for key, defs in subtopics_tbl.items():
        secs = {sid[0] for sid, _ in defs}
        if len(secs) != 1:
            raise ExportError(f"{slug}: section {key} subtopic ids span {secs}")
        numeric = [pt["id"] for pt in points_list
                   if "." in pt["id"] and pt["id"].split(".")[0] == key]
        ords = [_ord_key(numeric_id) for numeric_id in numeric]
        if ords != sorted(ords) or len(set(ords)) != len(ords):
            raise ExportError(f"{slug}: point ordering invalid in section {key}")

    # --- nodes & edges (build conventions) --------------------------------
    kg_nodes = [
        {"id": "subject", "type": "Subject", "label": display_subject},
    ]
    for key, meta in sections_tbl.items():
        kg_nodes.append({"id": "sec" + key, "type": "Section", "section": key,
                         "label": meta["label"]})
    for key, defs in subtopics_tbl.items():
        for sid, title in defs:
            kg_nodes.append({"id": sid, "type": "SubTopic", "section": key, "label": title})
    for pt in points_list:
        short = len(pt["id"]) <= 12
        kg_nodes.append({
            "id": "p:" + pt["id"], "pointId": pt["id"], "type": "SpecificationPoint",
            "label": pt["id"] if short else (pt["text"][:48] + "…"
                                             if len(pt["text"]) > 48 else pt["text"]),
            "statement": pt["text"],
        })

    edges = [["subject", "sec" + key, "hier"] for key in subtopics_tbl]
    for key, defs in subtopics_tbl.items():
        for sid, _ in defs:
            edges.append(["sec" + key, sid, "hier"])
            for pid in point_subs.get(sid, []):
                edges.append([sid, "p:" + pid, "hier"])

    # --- final validation (contract + referential integrity) --------------
    ids = {n["id"] for n in kg_nodes}
    if len(ids) != len(kg_nodes):
        raise ExportError(f"{slug}: duplicate node ids")
    for n in kg_nodes:
        if n["type"] not in NODE_TYPES:
            raise ExportError(f"{slug}: node {n['id']} has non-contract type {n['type']}")
    for e in edges:
        if e[2] not in EDGE_TYPES:
            raise ExportError(f"{slug}: edge {e} has non-contract type {e[2]}")
        if e[0] not in ids or e[1] not in ids:
            raise ExportError(f"{slug}: dangling edge {e[0]} -> {e[1]}")
    mapped = sum(len(v) for v in point_subs.values())
    if mapped != len(points_list):
        raise ExportError(f"{slug}: mapping covers {mapped}/{len(points_list)} points")
    point_sub_nodes = sum(1 for e in edges if e[2] == "hier" and e[1].startswith("p:"))
    if point_sub_nodes != len(points_list):
        raise ExportError(f"{slug}: hier point edges {point_sub_nodes} != points {len(points_list)}")

    by_type = collections.Counter(n["type"] for n in kg_nodes)
    by_edge = collections.Counter(e[2] for e in edges)
    payload = {
        "meta": {
            "contract": f"GRAPH_CONTRACT v{CONTRACT_VERSION}",
            "course": slug,
            "board": "Pearson Edexcel",
            "level": display_level,
            "subject": display_subject,
            "code": display_code,
            "curriculumCode": qual_code,
            "syllabusVersion": cur.get("syllabusVersion"),
            "source": f"content/{slug}/curriculum.json (curriculum truth, RULE_DERIVED)",
            "exporter": "scripts/kg_export.py v1",
            "generatedUtc": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "notes": ("v1: hier edges only — curriculum.json carries no prerequisite, "
                      "relation or paper metadata; none are invented."),
            "counts": {
                "nodes": len(kg_nodes),
                "edges": len(edges),
                "byType": dict(sorted(by_type.items())),
                "byEdgeType": dict(sorted(by_edge.items())),
                "specPoints": by_type["SpecificationPoint"],
            },
        },
        # build table shapes (consumed by the loader fork)
        "subjectLabel": display_subject,
        "subjectAnchor": [750, 420],
        "sections": sections_tbl,
        "subtopics": subtopics_tbl,
        "points": points_list,
        "pointSubtopics": {k: v for k, v in point_subs.items()},
        "subPointCounts": {k: len(v) for k, v in point_subs.items()},
        "sectionAnchors": {key: list(section_anchor(int(key) - 1, len(sections_tbl)))
                           for key in sections_tbl},
        "nodes": kg_nodes,
        "edges": edges,
    }
    return payload


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--qual", action="append", default=[],
                    help="course slug to export (repeatable; default: all)")
    ap.add_argument("--check-only", action="store_true", help="validate, write nothing")
    args = ap.parse_args()

    slugs = args.qual
    if not slugs:
        slugs = sorted(p.parent.name for p in CONTENT.glob("*/curriculum.json"))
        if not slugs:
            print("no content bundles found", file=sys.stderr)
            return 2

    registry: dict[str, dict] = {}
    reg_path = CONTENT / "courses.json"
    if reg_path.exists():
        reg_data = json.loads(reg_path.read_text(encoding="utf-8"))
        for entry in (reg_data if isinstance(reg_data, list) else reg_data.get("courses", [])):
            if isinstance(entry, dict) and entry.get("slug"):
                registry[entry["slug"]] = entry

    if not args.check_only:
        OUT_DIR.mkdir(parents=True, exist_ok=True)

    index = []
    failures = 0
    for slug in slugs:
        try:
            payload = export_course(slug, registry)
            counts = payload["meta"]["counts"]
            index.append({
                "slug": slug,
                "subject": payload["meta"]["subject"],
                "code": payload["meta"]["code"],
                "counts": {
                    "nodes": counts["nodes"],
                    "edges": counts["edges"],
                    "specPoints": counts["specPoints"],
                },
            })
            print(f"  ok  {slug:70s} {counts['nodes']:5d} nodes  {counts['edges']:5d} edges  "
                  f"{counts['byType'].get('SubTopic', 0):3d} subs  {counts['specPoints']:4d} pts")
            if not args.check_only:
                out = OUT_DIR / f"{slug}.json"
                out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                               encoding="utf-8")
        except (ExportError, FileNotFoundError, json.JSONDecodeError) as exc:
            failures += 1
            print(f"FAIL  {slug}: {exc}", file=sys.stderr)

    if not args.check_only and not args.qual:
        index_path = OUT_DIR / "index.json"
        index_path.write_text(json.dumps({"generatedFrom": "content/courses.json + "
                                          "curriculum bundles", "courses": index},
                                         ensure_ascii=False, separators=(",", ":")),
                              encoding="utf-8")
        print(f"index: {len(index)} courses -> {index_path}")

    print(f"\n{len(slugs) - failures}/{len(slugs)} courses ok"
          + (" (check-only)" if args.check_only else ""))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
