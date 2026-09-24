#!/usr/bin/env python3
"""Extract text structure from saved SME (Save My Exams) Test Builder HTML pages."""
import re, sys, html
from pathlib import Path

def extract(path: Path) -> str:
    raw = path.read_text(errors="ignore")
    # strip scripts/styles
    raw = re.sub(r"<script[^>]*>.*?</script>", " ", raw, flags=re.S | re.I)
    raw = re.sub(r"<style[^>]*>.*?</style>", " ", raw, flags=re.S | re.I)
    raw = re.sub(r"<!--.*?-->", " ", raw, flags=re.S)
    # block-level tags -> newlines
    raw = re.sub(r"<(br|/p|/div|/h[1-6]|/li|/tr|/section|/header|/footer|/button|/label|/span)[^>]*>", "\n", raw, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", raw)
    text = html.unescape(text)
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.split("\n")]
    out, prev = [], None
    for ln in lines:
        if ln and ln != prev:
            out.append(ln)
            prev = ln
    return "\n".join(out)

if __name__ == "__main__":
    base = Path("/tmp/sme-ref/TestBuilder")
    files = sorted(base.glob("*.html"))
    # Print full text of the smallest file first, heads of others
    f = files[0]
    t = extract(f)
    print(f"===== {f.name} ({len(t)} chars) =====")
    print(t[:12000])
