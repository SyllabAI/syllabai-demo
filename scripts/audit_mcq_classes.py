#!/usr/bin/env python3
"""Refined audit: classify MCQ parts lacking usable structured choices into
SME's rendering modes (verified against live SME markup 2026-09-18):
  A) text-statement options  -> SME renders <li> option cards
  B) image options           -> SME keeps composite image in stem, empty choices, letter buttons
  C) table-row options       -> SME keeps static table in stem, empty choices, letter buttons
  D) other / none visible
"""
import json, os, re
from collections import Counter

ROOT = "/home/z/my-project/content"
IMG = re.compile(r"!\[[^\]]*\]\(([^)]+)\)|<img\b")
TABLE_ROW_A = re.compile(r"^\s*\|[^|\n]*[\u2610\u2611]?\s*\*{0,2}A\*{0,2}\s*\|", re.M)
TABLE_ANY = re.compile(r"^\s*\|.+\|\s*$", re.M)
LETTER_CELL = re.compile(r"^\s*\|(?:\s*[\u2610\u2611]\s*\|)?\s*\*{0,2}[A-D]\*{0,2}\s*\|", re.M)

cls = Counter()
by_course = {}
detail = {"B": [], "C": [], "D": []}

for course in sorted(os.listdir(ROOT)):
    qf = os.path.join(ROOT, course, "questions.json")
    if not os.path.isfile(qf):
        continue
    data = json.load(open(qf))
    if isinstance(data, dict):
        data = data.get("topics", [])
    for topic in data:
        for q in topic.get("questions", []):
            for p in q.get("parts", []):
                if p.get("questionType") != "multiple_choice":
                    continue
                ch = p.get("choices")
                if ch and any(o.get("label") and (o.get("textMd") or "").strip() for o in ch):
                    cls["A_structured_text"] += 1
                    continue
                if not ch:
                    cls["Z_no_choices_field"] += 1
                    detail["D"].append((course, topic.get("slug"), p.get("id"), "no choices field"))
                    continue
                problem = p.get("problemMd") or ""
                imgs = IMG.findall(problem)
                if imgs:
                    cls["B_composite_image"] += 1
                    by_course.setdefault(course, Counter())["B"] += 1
                    if len(detail["B"]) < 2:
                        detail["B"].append((course, topic.get("slug"), p.get("id"), f"{len(imgs)} img(s)"))
                elif TABLE_ANY.search(problem) and LETTER_CELL.search(problem):
                    cls["C_table_rows"] += 1
                    by_course.setdefault(course, Counter())["C"] += 1
                    if len(detail["C"]) < 2:
                        detail["C"].append((course, topic.get("slug"), p.get("id"), "table w/ letter rows"))
                else:
                    cls["D_other"] += 1
                    by_course.setdefault(course, Counter())["D"] += 1
                    if len(detail["D"]) < 8:
                        detail["D"].append((course, topic.get("slug"), p.get("id"), problem[:120].replace("\n", " | ")))

print("CLASS COUNTS:")
for k, v in sorted(cls.items()):
    print(f"  {k:24s} {v}")

print("\nPER-COURSE (affected only):")
for c, cnt in sorted(by_course.items()):
    print(f"  {c:52s} {dict(cnt)}")

for k in ("B", "C", "D"):
    print(f"\nDETAIL {k}:")
    for d in detail[k]:
        print("  ", d)
