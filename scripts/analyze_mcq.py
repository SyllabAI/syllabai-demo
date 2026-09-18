#!/usr/bin/env python3
"""Analyze MCQ answerability + part types across the exam-question corpus."""
import json, re, glob, collections

def parse_options(problem_md):
    opts = []
    for line in problem_md.split("\n"):
        m = re.match(r"^\s*([A-D])[\.\)]\s+(.+)$", line)
        if m:
            opts.append(m.group(1))
    return opts

def parse_correct(solution_md):
    if not solution_md:
        return None
    m = re.search(r"correct answer is\s*\**\s*([A-D])", solution_md, re.I)
    return m.group(1).upper() if m else None

total_q = 0
part_types = collections.Counter()
mcq_total = 0          # questions having a multiple_choice part
mcq_with_opts = 0      # options parseable from problemMd
mcq_with_correct = 0   # correct letter parseable from solutionMd
mcq_both = 0           # fully answerable (options + correct)
mcq_solution_none = 0
qtype_by_style = collections.Counter()
sample_missing = []
per_course = collections.Counter()

for path in sorted(glob.glob("/home/z/my-project/content/*/questions.json")):
    course = path.split("/")[-2]
    data = json.load(open(path))
    topics = data if isinstance(data, list) else data.get("topics", [])
    for t in topics:
        for q in t.get("questions", []):
            total_q += 1
            per_course[course] += 1
            has_mcq = False
            for p in q.get("parts", []):
                pt = p.get("questionType") or "null"
                part_types[pt] += 1
                if pt == "multiple_choice":
                    has_mcq = True
                    mcq_total += 1
                    opts = parse_options(p.get("problemMd") or "")
                    correct = parse_correct(p.get("solutionMd"))
                    sol = p.get("solutionMd")
                    if not sol:
                        mcq_solution_none += 1
                    if opts:
                        mcq_with_opts += 1
                    if correct:
                        mcq_with_correct += 1
                    if opts and correct:
                        mcq_both += 1
                    elif not opts and len(sample_missing) < 3:
                        sample_missing.append((course, q["id"], (p.get("problemMd") or "")[:200], (sol or "")[:150]))
            if has_mcq:
                qtype_by_style[q.get("style") or "null"] += 1

print(f"questions total: {total_q}")
print(f"\npart questionType distribution: {dict(part_types)}")
print(f"\nMCQ parts: {mcq_total}")
print(f"  with options parsed from problemMd: {mcq_with_opts}")
print(f"  with correct letter in solutionMd:  {mcq_with_correct}")
print(f"  FULLY ANSWERABLE (both):            {mcq_both}")
print(f"  no solutionMd at all:               {mcq_solution_none}")
print(f"\nMCQ question style distribution: {dict(qtype_by_style)}")
print(f"\nper-course question counts: {dict(per_course)}")
print(f"\n--- samples of MCQs without options (problemMd head, solutionMd head) ---")
for c, qid, prob, sol in sample_missing:
    print(f"\n[{c}] {qid}\n  problem: {prob!r}\n  solution: {sol!r}")
