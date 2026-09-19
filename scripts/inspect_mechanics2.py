#!/usr/bin/env python3
"""Refined: strip scripts, math/, annotation/ (KaTeX's hidden TeX mirror),
then hunt REAL unrendered-latex leaks with context; also locate
'Type your answer' / 'Mark' markers outside scripts."""
import re
import subprocess

URL = "https://syllabai-demo.vercel.app/courses/ial-maths-20-mechanics-2/exam-questions/projectiles--exam-questions"
html = subprocess.run(["curl", "-s", URL, "--max-time", "45"], capture_output=True, text=True).stdout

body = re.sub(r"<script\b[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
body = re.sub(r"<style\b[^>]*>.*?</style>", " ", body, flags=re.S | re.I)
body = re.sub(r"<annotation\b[^>]*>.*?</annotation>", " ", body, flags=re.S | re.I)
body = re.sub(r"<math\b[^>]*>.*?</math>", " ", body, flags=re.S | re.I)
vis = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body))

def ctx(pattern, vis, n=3, w=90):
    return [vis[max(0, m.start()-w):m.start()+w] for m in list(re.finditer(pattern, vis))[:n]]

print("== real leaks after removing KaTeX mirror ==")
for pat in [r"\\frac", r"\^\{", r"\\times", r"\\sqrt", r"\$\$?[^$]{2,40}\$\$?"]:
    hits = re.findall(pat, vis)
    print(f"  {pat!r}: {len(hits)}")
    for c in ctx(pat, vis, 2):
        print("     …", c[:150], "…")

print("\n== marker locations (outside scripts) ==")
for pat in [r"Type your answer", r"Mark", r"Submit", r"Check answer"]:
    hits = re.findall(pat, vis)
    print(f"  {pat!r}: visible={len(hits)}")
    for c in ctx(pat, vis, 2, 60):
        print("     …", c, "…")

print("\n== question header probe ==")
for pat in [r"Q\s?\d+", r"Part\s?\d", r"1 of \d+", r"question\s+1"]:
    hits = re.findall(pat, vis, re.I)
    print(f"  {pat!r}: {len(hits)} {hits[:5]}")
