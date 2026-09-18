#!/usr/bin/env python3
"""Spot-check live SSR HTML of ICT/mechanics exam-question pages.

For each page, separate visible DOM text from the RSC flight payload
(flight lives inside <script> tags), then check:
  - literal ** markers in visible text (should be 0 after bd8ea91)
  - unrendered $...$ LaTeX in visible text (should be 0 after 0149129)
  - katex rendering evidence (class="katex" spans)
  - <strong>/<em> counts
  - MCQ player evidence: 'Choose your answer', radiogroup, choice letters
  - anomalies: undefined / NaN in visible text
"""
import re
import subprocess
import sys

BASE = "https://syllabai-demo.vercel.app"
PAGES = [
    ("igcse-ict-17", "types-of-peripheral-devices--exam-questions"),
    ("igcse-ict-17", "memory--exam-questions"),
    ("ial-maths-20-mechanics-1", "newtons-second-law--exam-questions"),
    ("ial-maths-20-mechanics-2", "projectiles--exam-questions"),
]

SCRIPT_RE = re.compile(r"<script\b[^>]*>.*?</script>", re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")
# visible-text unrendered latex: $...$ with latex-ish interior, not £/$$ amounts
DOLLAR_MATH_RE = re.compile(r"\$[^$\n]{2,60}?\$")
LATEX_CMD_RE = re.compile(r"\\(frac|sqrt|times|cdot|div|alpha|beta|theta|mu|pi|vec|underline|text|mathrm|dfrac|tfrac)\b")
ANSWER_RE = re.compile(r"\b(undefined|NaN)\b")


def fetch(url: str) -> str:
    r = subprocess.run(["curl", "-s", url, "--max-time", "45"], capture_output=True, text=True)
    return r.stdout


def visible_text(html: str) -> str:
    no_scripts = SCRIPT_RE.sub(" ", html)
    # drop style blocks too
    no_scripts = re.sub(r"<style\b[^>]*>.*?</style>", " ", no_scripts, flags=re.S | re.I)
    return TAG_RE.sub(" ", no_scripts)


def strong_samples(vis: str, n: int = 2) -> list[str]:
    """Recover visible sentences that had <strong> by scanning pre-strip HTML."""
    out = []
    no_scripts = SCRIPT_RE.sub(" ", vis)
    for m in re.finditer(r"<strong[^>]*>(.*?)</strong>", no_scripts, re.S):
        inner = TAG_RE.sub("", m.group(1)).strip()
        if inner and inner not in out:
            out.append(inner)
        if len(out) >= n:
            break
    return out


def main() -> int:
    failures = 0
    for course, slug in PAGES:
        url = f"{BASE}/courses/{course}/exam-questions/{slug}"
        html = fetch(url)
        if len(html) < 5000:
            print(f"\n=== {course}/{slug}\n  FETCH FAILED ({len(html)} bytes)")
            failures += 1
            continue
        vis = visible_text(html)
        stars = vis.count("**")
        dollar = [m.group(0) for m in DOLLAR_MATH_RE.finditer(vis) if LATEX_CMD_RE.search(m.group(0)) or re.search(r"[\^_]\{|\}\^|\\left|\\right|\\frac", m.group(0))]
        katex = html.count('class="katex"')
        strong = html.count("<strong")
        em = html.count("<em>")
        mcq = vis.count("Choose your answer")
        rg = html.count("radiogroup")
        bad = ANSWER_RE.findall(vis)
        print(f"\n=== {course}/{slug}  ({len(html)//1024} KB)")
        print(f"  literal ** in visible text : {stars}")
        print(f"  unrendered $latex$ in text : {len(dollar)} {dollar[:3]}")
        print(f"  katex spans                : {katex}")
        print(f"  <strong>/<em>              : {strong}/{em}")
        print(f"  MCQ player markers         : choose={mcq} radiogroup={rg}")
        print(f"  undefined/NaN in text      : {len(bad)}")
        samples = strong_samples(html)
        if samples:
            print(f"  strong samples             : {samples[:2]}")
        if stars or dollar or bad or (mcq == 0 and rg == 0 and "Solution" not in vis):
            failures += 1
            print("  STATUS: PROBLEM")
        else:
            print("  STATUS: OK")
    print(f"\nTOTAL pages with problems: {failures}/{len(PAGES)}")
    return failures


if __name__ == "__main__":
    sys.exit(0 if main() == 0 else 1)
