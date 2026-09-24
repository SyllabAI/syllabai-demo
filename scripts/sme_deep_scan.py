#!/usr/bin/env python3
"""Deep structural scan of SME Test Builder saved pages:
DOM regions, control inventory per page, and visible text skeleton."""
import re, sys, json
from pathlib import Path
from html.parser import HTMLParser

BASE = Path("/tmp/sme-ref/TestBuilder")

class Skeleton(HTMLParser):
    """Collect visible text + interactive elements with classes."""
    def __init__(self):
        super().__init__()
        self.stack = []
        self.text_chunks = []      # (tag-path, text)
        self.controls = []         # buttons/links/inputs with aria/label/class
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "")
        if tag in ("script", "style", "noscript", "svg"):
            self.skip_depth += 1
        if tag in ("button", "a", "input", "select", "textarea", "[role=tab]", "option"):
            label = a.get("aria-label") or a.get("title") or a.get("placeholder") or a.get("value", "")
            self.controls.append((tag, label[:60], cls[:110]))
        if tag in ("h1","h2","h3","h4","th","td","label","li") or "tab" in cls.lower():
            self.stack.append(tag)
        if tag == "div" and re.search(r"(tab|panel|modal|drawer|sidebar|card|badge)", cls, re.I):
            self.stack.append(f"div.{cls.split()[0] if cls else ''}")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self.skip_depth:
            self.skip_depth -= 1
        if self.stack and tag.startswith(tuple("h")) or (self.stack and tag in ("div","th","td","label","li")):
            if self.stack: self.stack.pop()

    def handle_data(self, data):
        if self.skip_depth: return
        t = data.strip()
        if t and len(t) > 1:
            path = "/".join(x.split(".")[0] for x in self.stack[-2:])
            self.text_chunks.append((path, t[:90]))

def scan(fname):
    p = Skeleton()
    p.feed(fname.read_text(errors="ignore"))
    return p

target = sys.argv[1] if len(sys.argv) > 1 else None
files = sorted(BASE.glob("*.html"))
if target: files = [f for f in files if target in f.name]
for f in files:
    p = scan(f)
    print(f"\n########## {f.name}")
    seen = set(); out = []
    for path, t in p.text_chunks:
        k = t.lower()
        if k in seen: continue
        seen.add(k); out.append(f"[{path}] {t}")
    print("\n".join(out[:90]))
    print(f"--- controls: {len(p.controls)}")
    cs = []
    cseen = set()
    for tag, label, cls in p.controls:
        key = (tag, label, cls[:40])
        if key in cseen: continue
        cseen.add(key)
        cs.append(f"  <{tag} aria/val={label!r} class={cls[:90]!r}>")
    print("\n".join(cs[:60]))
