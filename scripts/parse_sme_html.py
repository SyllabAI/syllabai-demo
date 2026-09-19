#!/usr/bin/env python3
"""Task 21-b: dissect the two uploaded SaveMyExams reference pages.

Static analysis of the saved HTML: visible outline (headings, nav links,
buttons), color palette, font stacks, and key copy. <script> payloads are
stripped so we only see what renders.
"""
import re
import sys
import json
from collections import Counter
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

FILES = {
    "dashboard": Path("/home/z/my-project/upload/Your Dashboard.html"),
    "subject_hub": Path("/home/z/my-project/upload/Edexcel IGCSE Chemistry 2017 Revision.html"),
}

SCRIPT_RE = re.compile(r"<script\b.*?</script>", re.I | re.S)
STYLE_RE = re.compile(r"<style\b.*?</style>", re.I | re.S)
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
SVG_RE = re.compile(r"<svg\b.*?</svg>", re.I | re.S)
NOSCRIPT_RE = re.compile(r"<noscript\b.*?</noscript>", re.I | re.S)
TEMPLATE_RE = re.compile(r"<template\b.*?</template>", re.I | re.S)

TAG_TEXT_RE = re.compile(r"<(h1|h2|h3|h4|a|button|summary|label)\b([^>]*)>(.*?)</\1>", re.I | re.S)
TAG_RE = re.compile(r"<[^>]+>")
COLOR_RE = re.compile(r"(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\))")
FONT_RE = re.compile(r"font-family\s*:\s*([^;\"'}]+)")
CLASS_RE = re.compile(r'class="([^"]{10,400})"')


def visible_html(raw: str) -> str:
    """Drop script/style/svg payloads so regex scans only see markup + styles kept separately."""
    return COMMENT_RE.sub("", TEMPLATE_RE.sub("", NOSCRIPT_RE.sub("", raw)))


def text_of(fragment: str) -> str:
    txt = TAG_RE.sub(" ", fragment)
    txt = txt.replace("&amp;", "&").replace("&#x27;", "'").replace("&#39;", "'")
    txt = txt.replace("&quot;", '"').replace("&nbsp;", " ").replace("&rsquo;", "'")
    return re.sub(r"\s+", " ", txt).strip()


def outline(doc: str, label: str):
    print(f"\n{'='*80}\n{label}: VISIBLE OUTLINE (h1-h4 / a / button)\n{'='*80}")
    for m in TAG_TEXT_RE.finditer(doc):
        tag, attrs, inner = m.group(1).lower(), m.group(2), m.group(3)
        txt = text_of(inner)
        if not txt or len(txt) > 220:
            continue
        # skip pure-icon / aria-hidden items
        if 'aria-hidden="true"' in attrs and tag != "a":
            continue
        href = ""
        if tag == "a":
            hm = re.search(r'href="([^"]*)"', attrs)
            href = hm.group(1)[:90] if hm else ""
        line = f"[{tag.upper()}] {txt}"
        if href:
            line += f"  -> {href}"
        print(line)


def styles_palette(raw: str, label: str = ""):
    css = "\n".join(m.group(0) for m in STYLE_RE.finditer(raw))
    inline = re.findall(r'style="([^"]+)"', visible_html(raw))
    css_all = css + "\n" + "\n".join(inline)
    colors = Counter(c.lower() for c in COLOR_RE.findall(css_all))
    fonts = Counter(f.strip() for f in FONT_RE.findall(css_all))
    print(f"\n{'='*80}\n{label or 'PAGE'}: COLORS\n{'='*80}")
    for c, n in colors.most_common(40):
        print(f"{n:5d}  {c}")
    print(f"\n{'='*80}\nFONTS\n{'='*80}")
    for f, n in fonts.most_common(12):
        print(f"{n:5d}  {f[:120]}")


def label_colors(s):
    return s


def class_fingerprint(doc: str, label: str):
    print(f"\n{'='*80}\n{label}: CLASS-NAME FINGERPRINT (sample)\n{'='*80}")
    seen = []
    for m in CLASS_RE.finditer(doc):
        c = m.group(1)
        if c not in seen:
            seen.append(c)
        if len(seen) >= 25:
            break
    for c in seen:
        print(c[:300])


def full_text_dump(doc: str, label: str, max_lines=400):
    print(f"\n{'='*80}\n{label}: FULL VISIBLE TEXT (first {max_lines} lines)\n{'='*80}")
    body = re.search(r"<body\b.*</body>", doc, re.I | re.S)
    doc2 = body.group(0) if body else doc
    doc2 = SCRIPT_RE.sub(" ", doc2)
    doc2 = STYLE_RE.sub(" ", doc2)
    doc2 = SVG_RE.sub(" ", doc2)
    txt = TAG_RE.sub("\n", doc2)
    txt = txt.replace("&amp;", "&").replace("&#x27;", "'").replace("&#39;", "'")
    txt = txt.replace("&quot;", '"').replace("&nbsp;", " ")
    lines = [l.strip() for l in txt.split("\n")]
    lines = [l for l in lines if l]
    # collapse consecutive duplicates
    out = []
    for l in lines:
        if not out or out[-1] != l:
            out.append(l)
    for l in out[:max_lines]:
        print(l)


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    for key, path in FILES.items():
        if which not in ("all", key):
            continue
        raw = path.read_text(encoding="utf-8", errors="replace")
        print(f"\n{'#'*80}\n# FILE: {path.name}  ({len(raw)/1024:.0f} KB)\n{'#'*80}")
        t = re.search(r"<title[^>]*>(.*?)</title>", raw, re.I | re.S)
        if t:
            print("TITLE:", text_of(t.group(1)))
        doc = visible_html(raw)
        outline(doc, key)
        styles_palette(raw, key)
        class_fingerprint(doc, key)
        full_text_dump(doc, key)
