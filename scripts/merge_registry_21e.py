#!/usr/bin/env python3
"""Merge courses.json: keep the 39 existing entries byte-identical, append the
10 T-SME-11 entries from the 10-lane rebuild, update the note to 49."""
import json

BAK = "/home/z/my-project/work/courses.json.bak"
NEW = "/home/z/my-project/content/courses.json"

old = json.load(open(BAK))
new = json.load(open(NEW))
old_slugs = {c["slug"] for c in old["courses"]}
add = [c for c in new["courses"] if c["slug"] not in old_slugs]
assert len(add) == 10, f"expected 10 new entries, got {len(add)}"
assert len(old["courses"]) == 39

merged = dict(old)
merged["note"] = (
    "Operator-maintained registry mirroring the 49 Edexcel IAL/IGCSE course "
    "variants scraped in SyllabAI/syllabai-resources (authoritative source). "
    "Every course has a content bundle under content/<slug>/ imported from the "
    "corpus: 'pilot' = official-tree course with the 4CH1 concept graph and "
    "learner overlay; 'full' = complete SME-native corpus import (notes, exam "
    "questions, flashcards; official-spec mapping pending upstream for all "
    "non-4CH1 courses). Slugs, levels, subjects and exam codes come from the "
    "upstream manifests — never invented. T-SME-11 (2026-09-20) added the 10 "
    "missing-subject lanes: English Language A 4EA1 (3 paper lanes), Maths B "
    "4MB1, Science Double Award Modular 2024 4XSD1 (6 unit lanes); 8 of them "
    "carry no SME topic questions (honest upstream census), all have revision "
    "notes and spec indexes."
)
merged["courses"] = old["courses"] + add
with open(NEW, "w", encoding="utf8") as f:
    json.dump(merged, f, ensure_ascii=False, indent=2)
    f.write("\n")
print(f"merged registry: {len(merged['courses'])} courses (39 kept + 10 added)")
