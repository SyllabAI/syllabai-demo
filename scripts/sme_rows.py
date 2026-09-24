#!/usr/bin/env python3
"""Extract non-tree visible text from SME pages: question rows, badges, CTAs."""
import re, sys
from pathlib import Path
from html.parser import HTMLParser

BASE = Path("/tmp/sme-ref/TestBuilder")

class T(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.rows = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self.skip:
            self.skip -= 1

    def handle_data(self, d):
        if self.skip: return
        t = " ".join(d.split())
        if t and len(t) > 1:
            self.rows.append(t)

TREEY = re.compile(
    r"^(Number Toolkit|Mathematical|Order of Operations|Negative Numbers|Money|Related Calc|"
    r"Set Notation|Venn|Prime|Types of Number|HCF|Powers|Laws of Indices|Converting|Operations with|"
    r"Fractions|Basic|Mixed|Adding|Multiplying|Percentages|Percentage|Reverse|Compound|Depreciation|"
    r"Recurring|Ordering|Rounding|Upper|Lower|Surds|Simplifying|Rationalising|Using a Calculator|"
    r"Ratio|Introduction to|Sharing|Working|Multiple|Exchange|Best Buys|Direct|Inverse|"
    r"Algebra|Algebraic|Substitution|Collecting|Expanding|Equations|Formulae|Inequalities|"
    r"Sequences|Straight|Graphs|Transformations|Functions|Circle|Geometry|Angles|Polygons|"
    r"Loci|Constructions|Bearings|Pythagoras|Trigonometry|Vectors|Probability|Statistics|"
    r"Averages|Sampling|Scatter|Cumulative|Histogram|Time Series|Indices|Standard Form|"
    r"Home|Start teaching|Resources|Dashboard|Claim free|Edexcel|Test Builder|Untitled test|"
    r"Test name|Filters|Topic|Search|We value|This website|Do Not Sell|Powered by|Opt-out|"
    r"We use third|Cancel|Save My Preferences|Your opt-out|Banner closes|s\.\.\.|"
    r"Show all subjects|No subjects found)\b")

def extract(fname):
    p = T()
    p.feed(Path(fname).read_text(errors="ignore"))
    seen, out = set(), []
    for t in p.rows:
        if len(t) < 2 or TREEY.match(t): continue
        if t.lower() in seen: continue
        seen.add(t.lower())
        out.append(t)
    return out

target = sys.argv[1] if len(sys.argv) > 1 else "(2).html"
f = [x for x in BASE.glob("*.html") if target in x.name][0]
rows = extract(f)
print(f"##### {f.name} — {len(rows)} rows")
for r in rows[:110]:
    print(r)
