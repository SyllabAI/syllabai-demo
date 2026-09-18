#!/usr/bin/env python3
"""Local SSR verification for the marks-alignment UX fixes."""
import re
import subprocess

BASE = "http://localhost:3100"

def fetch(url):
    return subprocess.run(["curl", "-s", url, "--max-time", "45"], capture_output=True, text=True).stdout

def visible(html):
    body = re.sub(r"<script\b[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
    body = re.sub(r"<annotation\b[^>]*>.*?</annotation>", " ", body, flags=re.S | re.I)
    body = re.sub(r"<math\b[^>]*>.*?</math>", " ", body, flags=re.S | re.I)
    body = body.replace("<!-- -->", "")  # React SSR text-node separators
    return re.sub(r"<[^>]+>", " ", re.sub(r"<style\b[^>]*>.*?</style>", " ", body, flags=re.S | re.I))

fail = 0

# 1) ICT structured page: orphan [2]/[4] → right-aligned "(N marks)"
h = fetch(f"{BASE}/courses/igcse-ict-17/exam-questions/types-of-peripheral-devices--exam-questions")
vis = visible(h)
orphan = re.findall(r">\s*\[(\d+)\]\s*<", h)  # raw bracket tags still rendered inline
right_marks = len(re.findall(r"text-right text-xs tabular-nums text-muted-foreground", h))
print(f"ICT page: right-aligned mark nodes={right_marks}, inline [N] tags left={len(orphan)}")
if right_marks < 1 or len(orphan): fail += 1

# 2) single-part structured: header badge marks present, no duplicate meta-row marks
q1 = vis.count("6 marks")
print(f"ICT Q1 '6 marks' occurrences (expect 1, header badge only): {q1}")
if q1 != 1: fail += 1

# 3) multi-part structured (biology): per-part marks right-aligned via ml-auto
h2 = fetch(f"{BASE}/courses/ial-biology-18/exam-questions/biological-molecules--exam-questions")
h2 = h2.replace("<!-- -->", "")
vis2 = visible(h2)
ml_auto_marks = len(re.findall(r'class="ml-auto"\s*>\s*\d+ marks?', h2))
print(f"mechanics: ml-auto marks nodes={ml_auto_marks}")
if ml_auto_marks < 1: fail += 1

# 4) duplicate View answer removed from MCQ part (exactly one per question footer)
h3 = fetch(f"{BASE}/courses/igcse-ict-17/exam-questions/memory--exam-questions")
vis3 = visible(h3)
va = vis3.count("View answer")
q_count = len(re.findall(r"\d+ marks", vis3)) # rough
print(f"MCQ page: View answer occurrences={va}")
# 6 questions on memory page → expect exactly 6 footers with one View answer each
if va != 6: fail += 1

# 5) home stat cards filled
h4 = fetch(f"{BASE}/")
vis4 = visible(h4)
blank = re.search(r"Curriculum nodes", vis4)
spec_ok = re.search(r"Spec points\s+\d+", vis4)
graph_ok = re.search(r"Graph nodes \(T-C11\)\s+\d+", vis4)
print(f"home: spec_points={bool(spec_ok)} graph_nodes={bool(graph_ok)} old_labels_gone={not blank}")
if blank or not spec_ok or not graph_ok: fail += 1

# 6) solid header (no /85 translucency)
if 'bg-background/85' in fetch(f"{BASE}/"):
    fail += 1
    print("header: STILL TRANSLUCENT")
else:
    print("header: solid bg-background ✓")

# 7) practice page marks right-aligned
h5 = fetch(f"{BASE}/practice")
pr = len(re.findall(r'ml-auto text-xs font-normal text-muted-foreground', h5))
orphan_pr = len(re.findall(r">\s*\[\d+\]\s*<", h5))
print(f"practice: ml-auto marks={pr}, orphan [N] left={orphan_pr}")
if pr < 1 or orphan_pr: fail += 1

print(f"\nRESULT: {'ALL PASS' if fail == 0 else f'{fail} FAILURES'}")
exit(0 if fail == 0 else 1)
