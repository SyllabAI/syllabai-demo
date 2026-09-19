#!/usr/bin/env python3
"""
Task 19 — thorough site-wide data-integrity audit.

Replicates the exact mapping semantics of src/lib/spec-tree.ts +
src/lib/courses.ts (loadHubCourse) and checks every committed bundle for:
  A. identity / duplicate-id / route-collision problems
  B. dangling references (notes/sets/cards/curriculum/concept-graph/sim)
  C. placement orphans + per-subtopic resource distribution (Task-17 class)
  D. question data integrity (marks, MCQ choices, solutions, empties)
  E. manifest count drift
  F. content rendering hazards (raw ids, brand leaks, broken fences)
  G. registry vs bundle cross-check

Output: aggregate counts per check + worst offenders, written to
work/audit19/report.md and printed to stdout.
"""

from __future__ import annotations
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path("/home/z/my-project")
CONTENT = ROOT / "content"

# ── helpers ─────────────────────────────────────────────────────────────

FINDINGS: dict[str, list] = defaultdict(list)

def add(check: str, course: str, detail: str):
    FINDINGS[check].append((course, detail))


def by_node_order(n: dict):
    return (n.get("order", float("inf")), n["code"])


def build_spec_index(curriculum: dict):
    """Replica of buildSpecTreeIndex (spec-tree.ts)."""
    nodes = curriculum["nodes"]
    topics = sorted([n for n in nodes if n["family"] == "TOPIC"], key=by_node_order)
    subtopic_of_spec = {}
    subtopic_by_code = {}
    topic_by_code = {}
    tree_topics = []
    for i, topic in enumerate(topics):
        subs = sorted(
            [n for n in nodes if n["family"] == "SUBTOPIC" and topic["code"] in n.get("parents", [])],
            key=by_node_order,
        )
        spec_subs = []
        sp_count = 0
        for j, sub in enumerate(subs):
            pts = [n["code"] for n in sorted(
                [n for n in nodes if n["family"] == "SPEC_POINT" and sub["code"] in n.get("parents", [])],
                key=by_node_order)]
            for c in pts:
                subtopic_of_spec[c] = sub["code"]
            code = sub["code"]
            suffix = code[len(topic["code"]):]
            if suffix.startswith("-") and re.fullmatch(r"[a-z]\d*", suffix[1:], re.I):
                label = suffix[1:]
            else:
                m = re.match(r"^(\d+)-(\d+)-", code)
                label = f"{m.group(1)}.{m.group(2)}" if m else str(j + 1)
            spec_subs.append({"code": code, "label": label, "title": sub["title"],
                              "topicCode": topic["code"], "specPointCodes": pts})
            sp_count += len(pts)
        orphan_specs = []
        seen = set(subtopic_of_spec)
        for n in nodes:
            if n["family"] == "SPEC_POINT" and topic["code"] in n.get("parents", []) and n["code"] not in seen:
                orphan_specs.append(n)
        if orphan_specs:
            codes = [n["code"] for n in sorted(orphan_specs, key=by_node_order)]
            gen = {"code": f"{topic['code']}-gen", "label": "gen", "title": "General requirements",
                   "topicCode": topic["code"], "specPointCodes": codes}
            spec_subs.append(gen)
            sp_count += len(codes)
            for c in codes:
                subtopic_of_spec.setdefault(c, gen["code"])
        tree_topics.append({"code": topic["code"], "number": i + 1, "title": topic["title"],
                            "subtopics": spec_subs, "specPointCount": sp_count})
        topic_by_code[topic["code"]] = tree_topics[-1]
        for s in spec_subs:
            subtopic_by_code[s["code"]] = s
    return {"topics": tree_topics, "subtopic_of_spec": subtopic_of_spec,
            "subtopic_by_code": subtopic_by_code, "topic_by_code": topic_by_code}


def subtopic_of_note(note: dict, idx) -> str | None:
    """Replica of subtopicOfNote."""
    for c in note.get("specPointCodes") or []:
        s = idx["subtopic_of_spec"].get(c)
        if s:
            return s
    ts = note.get("topicSlug")
    if ts and ts in idx["subtopic_by_code"]:
        return ts
    for i in note.get("specPointIds") or []:
        s = idx["subtopic_of_spec"].get(i)
        if s:
            return s
    return None


def subtopic_of_set(topic: dict, idx) -> str | None:
    """Replica of subtopicOfQuestionSet."""
    ts = topic.get("topicSlug")
    if ts and ts in idx["subtopic_by_code"]:
        return ts
    tally = Counter()
    for q in topic.get("questions") or []:
        codes = set()
        for p in q.get("parts") or []:
            for c in (p.get("specPointCodes") or []) + (p.get("specPointIds") or []):
                s = idx["subtopic_of_spec"].get(c)
                if s:
                    codes.add(s)
        for s in codes:
            tally[s] += 1
    return tally.most_common(1)[0][0] if tally else None


def subtopic_of_card(card: dict, notes_by_id: dict, idx) -> str | None:
    """Replica of subtopicOfFlashcard."""
    sc = card.get("subtopicCode")
    if sc and sc in idx["subtopic_by_code"]:
        return sc
    for i in card.get("specPointIds") or []:
        s = idx["subtopic_of_spec"].get(i)
        if s:
            return s
    spc = card.get("specPointCode")
    if spc:
        s = idx["subtopic_of_spec"].get(spc)
        if s:
            return s
    note = notes_by_id.get(card.get("sourceNoteId"))
    if note is not None:
        return subtopic_of_note(note, idx)
    ts = card.get("topicSlug")
    if ts and ts in idx["subtopic_by_code"]:
        return ts
    return None


URL_UNSAFE = re.compile(r"[^A-Za-z0-9_\-~.]")

RAW_ID = re.compile(r"\b(?:rn_|top_|spcpt_|qstn_|qstnprt_|cncpt_|flsh|skill_)[A-Za-z0-9_]{6,}\b")

FENCE = re.compile(r"^```", re.M)


def audit_course(dirpath: Path):
    course = dirpath.name
    try:
        manifest = json.loads((dirpath / "manifest.json").read_text())
        curriculum = json.loads((dirpath / "curriculum.json").read_text())
        cgraph = json.loads((dirpath / "concept-graph.json").read_text())
        notes = json.loads((dirpath / "notes.json").read_text())
        qtopics = json.loads((dirpath / "questions.json").read_text())
        cards = json.loads((dirpath / "flashcards.json").read_text())
        sim = json.loads((dirpath / "learner-sim.json").read_text())
    except Exception as e:  # unreadable bundle = worst class of issue
        add("B0_unreadable_bundle", course, str(e))
        return

    idx = build_spec_index(curriculum)
    spec_codes = {n["code"] for n in curriculum["nodes"] if n["family"] == "SPEC_POINT"}
    node_codes = Counter(n["code"] for n in curriculum["nodes"])
    notes_by_id = {n["noteId"]: n for n in notes}
    set_by_slug = {t["slug"]: t for t in qtopics}
    card_ids = {c["id"] for c in cards}

    # ── A. identity / duplicates / route collisions ────────────────────
    for kind, seq, keyf in (
        ("noteId", notes, lambda n: n["noteId"]),
        ("set_slug", qtopics, lambda t: t["slug"]),
        ("set_topicId", qtopics, lambda t: t["topicId"]),
        ("card_id", cards, lambda c: c["id"]),
    ):
        dups = [k for k, v in Counter(keyf(x) for x in seq).items() if v > 1]
        for d in dups:
            add("A1_duplicate_" + kind, course, d)
    qids = Counter()
    pids = Counter()
    for t in qtopics:
        for q in t.get("questions") or []:
            qids[q["id"]] += 1
            for p in q.get("parts") or []:
                pids[p["id"]] += 1
    for d, v in qids.items():
        if v > 1:
            add("A2_duplicate_question_id_across_sets", course, f"{d} x{v}")
    for d, v in pids.items():
        if v > 1:
            add("A3_duplicate_part_id", course, f"{d} x{v}")
    for d, v in node_codes.items():
        if v > 1:
            add("A4_duplicate_curriculum_node_code", course, f"{d} x{v}")
    for kind, seq, keyf in (
        ("noteId", notes, lambda n: n["noteId"]),
        ("set_slug", qtopics, lambda t: t["slug"]),
    ):
        for x in seq:
            k = keyf(x)
            if URL_UNSAFE.search(k):
                add("A5_url_unsafe_" + kind, course, repr(k))

    # ── B. dangling references ─────────────────────────────────────────
    for n in notes:
        for c in n.get("specPointCodes") or []:
            if c not in spec_codes:
                add("B1_note_specCode_missing", course, f"{n['noteId']} → {c}")
        for i in n.get("specPointIds") or []:
            if i not in node_codes:
                add("B2_note_specId_missing", course, f"{n['noteId']} → {i}")
        ts = n.get("topicSlug")
        if ts and ts not in idx["subtopic_by_code"]:
            add("B3_note_topicSlug_not_subtopic", course, f"{n['noteId']} → {ts}")
    for t in qtopics:
        ts = t.get("topicSlug")
        if ts and ts not in idx["subtopic_by_code"]:
            add("B4_set_topicSlug_not_subtopic", course, f"{t['slug']} → {ts}")
        for rid in t.get("relatedNoteIds") or []:
            if rid not in notes_by_id:
                add("B5_set_relatedNote_missing", course, f"{t['slug']} → {rid}")
        for q in t.get("questions") or []:
            for p in q.get("parts") or []:
                for c in p.get("specPointCodes") or []:
                    if c not in spec_codes:
                        add("B6_part_specCode_missing", course, f"{p['id']} → {c}")
                for i in p.get("specPointIds") or []:
                    if i not in node_codes:
                        add("B7_part_specId_missing", course, f"{p['id']} → {i}")
    for c in cards:
        sn = c.get("sourceNoteId")
        if sn and sn not in notes_by_id:
            add("B8_card_sourceNote_missing", course, f"{c['id']} → {sn}")
        spc = c.get("specPointCode")
        if spc and spc not in spec_codes:
            add("B9_card_specCode_missing", course, f"{c['id']} → {spc}")
        for i in c.get("specPointIds") or []:
            if i not in node_codes:
                add("B10_card_specId_missing", course, f"{c['id']} → {i}")
        sc = c.get("subtopicCode")
        if sc and sc not in idx["subtopic_by_code"]:
            add("B11_card_subtopicCode_missing", course, f"{c['id']} → {sc}")
        if sn and sn in notes_by_id:
            pass
    for n in curriculum["nodes"]:
        for p in n.get("parents") or []:
            if p not in node_codes:
                add("B12_curriculum_parent_missing", course, f"{n['code']} → {p}")
    cnode_codes = {c["code"] for c in cgraph.get("nodes") or []}
    for c in cgraph.get("nodes") or []:
        for sp in c.get("specPoints") or []:
            if sp not in spec_codes:
                add("B13_concept_specPoint_missing", course, f"{c['code']} → {sp}")
    for e in cgraph.get("edges") or []:
        if e.get("source") not in cnode_codes:
            add("B14_concept_edge_source_missing", course, f"{e.get('source')} → {e.get('target')}")
        if e.get("target") not in cnode_codes:
            add("B14_concept_edge_source_missing", course, f"{e.get('target')} ← {e.get('source')}")
    for s in sim.get("skillStates") or []:
        if s.get("nodeId") not in spec_codes:
            add("B15_sim_skillNode_missing", course, s.get("nodeId", "?"))

    # ── C. placement orphans + distribution ────────────────────────────
    notes_per_sub = defaultdict(list)
    orphan_notes = []
    for n in notes:
        s = subtopic_of_note(n, idx)
        if s is None:
            orphan_notes.append(n)
        else:
            notes_per_sub[s].append(n)
    sets_per_sub = defaultdict(list)
    orphan_sets = []
    for t in qtopics:
        s = subtopic_of_set(t, idx)
        if s is None:
            orphan_sets.append(t)
        else:
            sets_per_sub[s].append(t)
    cards_per_sub = defaultdict(list)
    orphan_cards = []
    for c in cards:
        s = subtopic_of_card(c, notes_by_id, idx)
        if s is None:
            orphan_cards.append(c)
        else:
            cards_per_sub[s].append(c)

    for n in orphan_notes:
        add("C1_orphan_note_no_subtopic", course,
            f"{n['noteId']} ({n['title'][:40]!r}) topicSlug={n.get('topicSlug')!r}")
    for t in orphan_sets:
        add("C2_orphan_set_no_subtopic", course, f"{t['slug']} ({t.get('name')!r})")
    for c in orphan_cards:
        add("C3_orphan_card_fully_unreachable", course,
            f"{c['id']} front={c.get('front','')[:40]!r}")

    multi_notes = {s: len(v) for s, v in notes_per_sub.items() if len(v) > 1}
    multi_sets = {s: len(v) for s, v in sets_per_sub.items() if len(v) > 1}
    if multi_notes:
        add("C4_subtopics_multi_notes", course, f"{len(multi_notes)} subtopics, max {max(multi_notes.values())}")
    if multi_sets:
        add("C5_subtopics_multi_sets", course, f"{len(multi_sets)} subtopics, max {max(multi_sets.values())}")

    all_subs = [s for t in idx["topics"] for s in t["subtopics"]]
    empty_subs = [s["code"] for s in all_subs
                  if not notes_per_sub.get(s["code"]) and not sets_per_sub.get(s["code"])
                  and not cards_per_sub.get(s["code"])]
    if empty_subs:
        add("C6_subtopic_zero_resources", course, f"{len(empty_subs)}/{len(all_subs)}")

    # spec-point coverage: spec points with no note anchoring them
    noted_specs = set()
    for n in notes:
        noted_specs.update(n.get("specPointCodes") or [])
    # include specPointIds only when they are official codes (pilot)
    uncovered = spec_codes - noted_specs
    if uncovered:
        add("C7_spec_points_no_note", course, f"{len(uncovered)}/{len(spec_codes)}")

    # ── D. question data integrity ─────────────────────────────────────
    def is_mcq(p):
        qt = (p.get("questionType") or "").lower()
        return "multiple" in qt or "mcq" in qt or p.get("choices")

    for t in qtopics:
        if not (t.get("questions") or []):
            add("D1_set_zero_questions", course, t["slug"])
        for q in t.get("questions") or []:
            parts = q.get("parts") or []
            if not parts:
                add("D2_question_zero_parts", course, f"{t['slug']}/{q['id']}")
            psum = sum(p.get("marks") or 0 for p in parts)
            if psum != q.get("totalMarks"):
                add("D3_totalMarks_mismatch", course,
                    f"{t['slug']}/{q['id']}: total={q.get('totalMarks')} sum(parts)={psum}")
            for p in parts:
                if (p.get("marks") or 0) <= 0:
                    add("D4_part_mark_nonpositive", course, f"{p['id']} marks={p.get('marks')}")
                if not (p.get("problemMd") or "").strip():
                    add("D5_part_empty_problem", course, f"{t['slug']}/{p['id']}")
                if is_mcq(p):
                    ch = p.get("choices")
                    if not ch:
                        add("D6_mcq_no_choices", course, f"{t['slug']}/{p['id']}")
                    else:
                        correct = [c for c in ch if c.get("isCorrect")]
                        if len(correct) == 0:
                            add("D7_mcq_no_correct_flag", course, f"{t['slug']}/{p['id']}")
                        elif len(correct) > 1:
                            add("D8_mcq_multiple_correct", course, f"{t['slug']}/{p['id']}")
                else:
                    if not (p.get("solutionMd") or "").strip():
                        add("D9_structured_part_no_solution", course, f"{t['slug']}/{p['id']}")
                if not (p.get("specPointCodes") or []) and not (p.get("specPointIds") or []):
                    add("D10_part_unanchored", course, f"{t['slug']}/{p['id']}")

    # ── E. manifest drift ──────────────────────────────────────────────
    mc = manifest.get("counts") or {}
    actual = {"notes": len(notes), "questionSets": len(qtopics),
              "questions": sum(len(t.get("questions") or []) for t in qtopics),
              "flashcards": len(cards)}
    for k, v in actual.items():
        if k in mc and mc[k] != v:
            add("E1_manifest_count_drift", course, f"{k}: manifest={mc[k]} actual={v}")

    # ── F. content rendering hazards ───────────────────────────────────
    for n in notes:
        body = n.get("bodyMd") or ""
        if not body.strip():
            add("F1_note_empty_body", course, n["noteId"])
            continue
        if len(FENCE.findall(body)) % 2:
            add("F2_note_unbalanced_fence", course, n["noteId"])
        for m in set(RAW_ID.findall(body)):
            add("F3_note_raw_id_in_body", course, f"{n['noteId']}: {m}")
        if re.search(r"save\s*my\s*exams", body, re.I):
            add("F4_note_brand_leak", course, n["noteId"])
    for c in cards:
        for f in ("front", "back"):
            if not (c.get(f) or "").strip():
                add("F5_card_empty_side", course, f"{c['id']}:{f}")
    for t in qtopics:
        for q in t.get("questions") or []:
            for p in q.get("parts") or []:
                for field in ("problemMd", "solutionMd"):
                    txt = p.get(field) or ""
                    if txt and len(FENCE.findall(txt)) % 2:
                        add("F6_part_unbalanced_fence", course, f"{p['id']}:{field}")
                    for m in set(RAW_ID.findall(txt)):
                        add("F7_part_raw_id_in_body", course, f"{p['id']}:{field}: {m}")

    # ── G. cross-file summary used by report ───────────────────────────
    return {
        "notes": len(notes), "sets": len(qtopics),
        "questions": sum(len(t.get("questions") or []) for t in qtopics),
        "parts": sum(len(q.get("parts") or []) for t in qtopics for q in t.get("questions") or []),
        "cards": len(cards),
        "orphan_notes": len(orphan_notes), "orphan_sets": len(orphan_sets),
        "orphan_cards": len(orphan_cards),
        "multi_notes_subs": len(multi_notes), "multi_sets_subs": len(multi_sets),
        "empty_subs": len(empty_subs), "total_subs": len(all_subs),
        "tree_kind": manifest.get("treeKind", "?"),
    }


def main():
    courses = sorted([d for d in CONTENT.iterdir() if d.is_dir() and (d / "manifest.json").exists()])
    registry = json.loads((CONTENT / "courses.json").read_text())
    reg_slugs = {c["slug"] for c in registry["courses"]}
    bundle_slugs = {d.name for d in courses}
    for s in sorted(bundle_slugs - reg_slugs):
        add("G1_bundle_not_in_registry", s, "has manifest but missing from courses.json")
    for s in sorted(reg_slugs - bundle_slugs):
        add("G2_registered_no_bundle", s, "registered, no committed bundle (expected for ladder)")

    summary = {}
    for d in courses:
        summary[d.name] = audit_course(d) or {}

    # ── report ─────────────────────────────────────────────────────────
    out = ROOT / "work" / "audit19"
    out.mkdir(parents=True, exist_ok=True)
    lines = ["# Task 19 — site-wide integrity audit", ""]
    total_notes = sum(s.get("notes", 0) for s in summary.values())
    total_cards = sum(s.get("cards", 0) for s in summary.values())
    total_orphan_cards = sum(s.get("orphan_cards", 0) for s in summary.values())
    lines.append(f"Scanned {len(courses)} bundles · {total_notes} notes · "
                 f"{sum(s.get('questions', 0) for s in summary.values())} questions · {total_cards} flashcards")
    lines.append("")
    lines.append("## Findings by check")
    for check in sorted(FINDINGS):
        items = FINDINGS[check]
        lines.append(f"\n### {check} — {len(items)} occurrence(s) in {len({c for c, _ in items})} course(s)")
        per_course = Counter(c for c, _ in items)
        lines.append("courses: " + ", ".join(f"{c}({n})" for c, n in per_course.most_common(8)))
        shown = 0
        last_course = None
        for c, detail in items:
            if c != last_course:
                lines.append(f"- {c}: {detail}")
                last_course = c
                shown += 1
            if shown >= 10 and len(per_course) > 10:
                break
    (out / "report.md").write_text("\n".join(lines))
    (out / "summary.json").write_text(json.dumps(summary, indent=1))
    (out / "findings.json").write_text(
        json.dumps({k: v for k, v in FINDINGS.items()}, indent=1, default=str))

    print(f"Scanned {len(courses)} bundles; notes={total_notes} cards={total_cards}")
    for check in sorted(FINDINGS):
        items = FINDINGS[check]
        per_course = Counter(c for c, _ in items)
        print(f"{check:42s} {len(items):6d} occurrences in {len(per_course):3d} courses | e.g. {items[0][0]}: {str(items[0][1])[:70]}")


if __name__ == "__main__":
    main()
