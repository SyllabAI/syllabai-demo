#!/usr/bin/env python3
"""Categorize KaTeX audit errors (parses output of audit_katex_render.cjs)."""
import sys, re, collections

txt = sys.stdin.read()
pat = re.compile(r"#\d+ x(\d+)  (.+)")
cats = collections.Counter()
for cnt, msg in pat.findall(txt):
    cnt = int(cnt)
    m = re.search(r"Undefined control sequence: \\(\w+)", msg)
    if m:
        cats["GLUED-MACRO \\" + m.group(1)] += cnt
    elif "left" in msg or "right" in msg:
        cats["UNMATCHED left/right"] += cnt
    elif msg.startswith("unbalanced $"):
        cats["UNBALANCED $ (mostly code spans)"] += cnt
    else:
        cats["OTHER: " + msg[:90]] += cnt

glued = [(k, v) for k, v in cats.items() if k.startswith("GLUED")]
print(f"glued-macro families: {len(glued)}  total: {sum(v for _, v in glued)}")
for k, v in cats.most_common(50):
    print(f"{v:5d}  {k}")
