#!/usr/bin/env python3
"""Grep interesting UI strings across all SME saved pages."""
import re, sys
sys.path.insert(0, "/home/z/my-project/scripts")
from extract_sme import extract
from pathlib import Path

KEYS = [
    "filters", "difficulty", "mark scheme", "question paper", "model answer",
    "download", "preview", "print", "target", "total marks", "questions",
    "move question", "delete question", "view question", "add", "remove",
    "saved", "answer", "show more", "select", "clear", "marks)", "mark)",
]

base = Path("/tmp/sme-ref/TestBuilder")
for f in sorted(base.glob("*.html")):
    t = extract(f).lower()
    print(f"===== {f.name}")
    for k in KEYS:
        n = t.count(k)
        if n:
            print(f"  {k!r}: {n}")
