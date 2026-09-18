#!/usr/bin/env python3
"""Check how MCQ options are represented: image refs? where do images live?"""
import json, re, glob, collections

img_in_problem = 0
img_samples = []
mcq = 0
scheme_patterns = collections.Counter()
opt_mention = 0  # solution mentions options text like "A is incorrect..."

for path in sorted(glob.glob("/home/z/my-project/content/*/questions.json")):
    course = path.split("/")[-2]
    data = json.load(open(path))
    topics = data if isinstance(data, list) else data.get("topics", [])
    for t in topics:
        for q in t.get("questions", []):
            for p in q.get("parts", []):
                if p.get("questionType") != "multiple_choice":
                    continue
                mcq += 1
                prob = p.get("problemMd") or ""
                sol = p.get("solutionMd") or ""
                if "![" in prob or "<img" in prob:
                    img_in_problem += 1
                    if len(img_samples) < 4:
                        img_samples.append((course, q["id"], prob[:400]))
                if re.search(r"\bA\b[^\n]{0,120}", prob) and "A." in prob:
                    pass
                for pat in [r"correct answer is\s*\**\s*([A-D])", r"Final answer", r"ark-scheme"]:
                    if re.search(pat, sol, re.I):
                        scheme_patterns[pat] += 1
                if re.search(r"[A-D]\s+is incorrect", sol):
                    opt_mention += 1

print(f"MCQ parts: {mcq}")
print(f"MCQ problemMd containing image refs: {img_in_problem}")
print(f"solution patterns: {dict(scheme_patterns)}")
print(f"solutions explaining why other options incorrect: {opt_mention}")
print()
for c, qid, prob in img_samples:
    print(f"[{c}] {qid}\n{prob}\n{'-'*70}")
