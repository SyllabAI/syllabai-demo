#!/usr/bin/env python3
"""Audit bundled questions.json: MCQ-typed parts without usable choices.
For each such part, test the legacy markdown-parse fallback and classify
where the answer actually lives (choices absent upstream? answer in image?
no answer at all?)."""
import json, os, re
from collections import Counter, defaultdict

ROOT = "/home/z/my-project/content"

OPT_LINE = re.compile(r"^\s*(?:\*{0,2})([A-F])(?:\*{0,2})[\).]\s+(.+?)\s*$", re.M)
CORRECT_PATTERNS = [
    re.compile(r"correct\s+(?:answer|option)\s*(?:is|:)?\s*\**\(?([A-F])\)?", re.I),
    re.compile(r"\*\*([A-F])\**\s*(?:is\s+)?(?:the\s+)?correct", re.I),
    re.compile(r"answer\s*(?:is|:)\s*\**\(?([A-F])\)?", re.I),
]

stats = defaultdict(Counter)   # course -> counters
examples = defaultdict(list)   # course -> list of dicts

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
                s = stats[course]
                s["mcq_total"] += 1
                ch = p.get("choices")
                if ch and any(o.get("label") and (o.get("textMd") or "").strip() for o in ch):
                    s["with_choices"] += 1
                    continue
                # no usable structured choices
                s["no_structured_choices"] += 1
                problem = p.get("problemMd") or ""
                solution = p.get("solutionMd") or ""
                opts = OPT_LINE.findall(problem)
                correct = None
                for pat in CORRECT_PATTERNS:
                    m = pat.search(solution)
                    if m:
                        correct = m.group(1)
                        break
                has_img = bool(re.search(r"!\[[^\]]*\]\([^)]+\)|<img\b", problem))
                if opts and correct:
                    s["legacy_parse_ok"] += 1
                elif opts and not correct:
                    s["opts_but_no_correct"] += 1
                elif has_img:
                    s["answer_likely_in_image"] += 1
                else:
                    s["no_options_anywhere"] += 1
                if len(examples[course]) < 3:
                    examples[course].append({
                        "topic": topic.get("slug"),
                        "qid": q.get("id"),
                        "pid": p.get("id"),
                        "n_opts_in_md": len(opts),
                        "correct_found": correct,
                        "has_img": has_img,
                        "choices_field": ch if ch is None else f"{len(ch)} items",
                        "problem_head": problem[:220].replace("\n", " | "),
                        "solution_head": solution[:200].replace("\n", " | "),
                    })

print(f"{'course':52s} {'mcq':>5s} {'ok':>5s} {'none':>5s} {'lgcy':>5s} {'opt?':>5s} {'img':>5s} {'none!':>5s}")
tot = Counter()
for c, s in sorted(stats.items()):
    tot.update(s)
    print(f"{c:52s} {s['mcq_total']:5d} {s['with_choices']:5d} {s['no_structured_choices']:5d} "
          f"{s['legacy_parse_ok']:5d} {s['opts_but_no_correct']:5d} {s['answer_likely_in_image']:5d} "
          f"{s['no_options_anywhere']:5d}")
print("-" * 96)
print(f"{'TOTAL':52s} {tot['mcq_total']:5d} {tot['with_choices']:5d} {tot['no_structured_choices']:5d} "
      f"{tot['legacy_parse_ok']:5d} {tot['opts_but_no_correct']:5d} {tot['answer_likely_in_image']:5d} "
      f"{tot['no_options_anywhere']:5d}")

print("\n=== sample examples (up to 3 per affected course) ===")
for c, exs in examples.items():
    s = stats[c]
    if s["no_structured_choices"] == 0:
        continue
    print(f"\n--- {c} ({s['no_structured_choices']} affected) ---")
    for e in exs:
        print(json.dumps(e, indent=1))
