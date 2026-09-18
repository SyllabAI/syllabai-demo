#!/usr/bin/env python3
"""Deeper look at one mechanics page: what interactive/answer markers exist,
sample katex render quality, check \\( \\) delimiter leaks and question text."""
import re
import subprocess

URL = "https://syllabai-demo.vercel.app/courses/ial-maths-20-mechanics-2/exam-questions/projectiles--exam-questions"
html = subprocess.run(["curl", "-s", URL, "--max-time", "45"], capture_output=True, text=True).stdout

no_scripts = re.sub(r"<script\b[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
vis = re.sub(r"<[^>]+>", " ", no_scripts)
vis = re.sub(r"\s+", " ", vis)

print("page bytes:", len(html))
# what answer/interactive markers exist?
for marker in [
    "Choose your answer", "Type your answer", "type=\"text\"", "textbox",
    "Check", "Submit", "Show solution", "Solution", "Reveal", "Mark",
    "working", "marks",
]:
    print(f"  {marker!r:24} visible={vis.count(marker)} raw={html.count(marker)}")

# unrendered \( \) and \[ \] leaks in visible text
print("\\( in visible:", vis.count("\\("), "| \\frac in visible:", vis.count("\\frac"),
      "| \\times in visible:", vis.count("\\times"), "| ^{ in visible:", vis.count("^{"))

# sample katex annotations (LaTeX source of rendered spans)
annos = re.findall(r'class="katex" aria-hidden="true".*?<annotation encoding="application/x-tex">(.*?)</annotation>', html[:400000], re.S)
print("katex annotation samples:", [a.strip()[:40] for a in annos[:6]])

# first visible question snippet
m = re.search(r"(Q\d+|Question \d+)", vis)
print("question marker:", m.group(0) if m else None, "| ctx:", vis[m.start():m.start()+220] if m else "NONE")
