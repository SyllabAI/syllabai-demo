#!/usr/bin/env python3
"""
Patch demo content bundles with upstream MCQ `choices`.

The bundle builder (scripts/import_corpus/build_bundles.py) dropped the
upstream `choices` array that sits on every multiple_choice part in
SME-ExamQuestion topic.json — so no MCQ in the demo was answerable. This
script joins demo parts to upstream parts on the canonical qstnprt_* id and
writes `choices: [{label, isCorrect, textMd}]` back into
content/<course>/questions.json. Nothing is invented: only upstream-attested
choice text is carried (provenance unchanged — same SME corpus, same ids).

Usage: python3 scripts/patch_mcq_choices.py [--dry-run]
Requires the upstream topic.json cache from scripts/survey_choices.py
(work/corpus-cache2/SME-ExamQuestion/...).
"""
import json, os, sys

PROJECT = "/home/z/my-project"
CONTENT = os.path.join(PROJECT, "content")
CACHE = os.path.join(PROJECT, "work", "corpus-cache2", "SME-ExamQuestion", "SME-ExamQuestion")
DRY = "--dry-run" in sys.argv

courses = sorted(
    c for c in os.listdir(CONTENT)
    if os.path.isdir(os.path.join(CONTENT, c))
)
print(f"{len(courses)} course bundles")

stats = {
    "topics": 0, "questions": 0, "mcq_parts": 0, "patched": 0,
    "missing_upstream_topic": 0, "part_join_misses": 0,
    "courses_touched": 0,
}

for course in courses:
    qpath = os.path.join(CONTENT, course, "questions.json")
    if not os.path.exists(qpath):
        continue
    with open(qpath, encoding="utf8") as f:
        topics = json.load(f)

    course_patched = 0
    for t in topics:
        section = t.get("sectionSlug")
        tslug = t.get("topicSlug")
        up_path = os.path.join(CACHE, course, section or "", tslug or "", "topic.json")
        if not (section and tslug and os.path.exists(up_path)):
            stats["missing_upstream_topic"] += 1
            continue
        with open(up_path, encoding="utf8") as f:
            up = json.load(f)
        up_choices = {}
        for q in up.get("questions", []):
            for p in q.get("parts", []):
                ch = p.get("choices")
                if ch:
                    up_choices[p["id"]] = [
                        {
                            "label": c.get("label") or "",
                            "isCorrect": bool(c.get("is_correct")),
                            "textMd": c.get("text_md") or "",
                        }
                        for c in ch
                    ]
        stats["topics"] += 1
        for q in t.get("questions", []):
            stats["questions"] += 1
            for p in q.get("parts", []):
                if p.get("questionType") != "multiple_choice":
                    continue
                stats["mcq_parts"] += 1
                ch = up_choices.get(p["id"])
                if ch is None:
                    stats["part_join_misses"] += 1
                    continue
                if p.get("choices") != ch:
                    p["choices"] = ch
                    course_patched += 1
                    stats["patched"] += 1

    if course_patched and not DRY:
        with open(qpath, "w", encoding="utf8") as f:
            json.dump(topics, f, ensure_ascii=False, separators=(",", ":"))
        stats["courses_touched"] += 1
    if course_patched:
        print(f"  {course}: +{course_patched} MCQ parts")

print(json.dumps(stats, indent=1))
if DRY:
    print("(dry run — nothing written)")
