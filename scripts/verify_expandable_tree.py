#!/usr/bin/env python3
"""Task 18 local verification — expandable sub-topic tree (multiple notes /
question sets per sub-topic reachable from the topic tree)."""
import html as html_mod
import json
import os
import re
import subprocess
import sys

BASE = os.environ.get("VERIFY_BASE", "http://localhost:3000")
PILOT = "igcse-chemistry-19"
IAL = "ial-chemistry-17"
ROOT = os.path.join(os.path.dirname(__file__), "..")

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))


def fetch(url: str) -> str:
    html = subprocess.run(["curl", "-s", url], capture_output=True, text=True).stdout
    html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.S)
    html = re.sub(r"<style\b[^>]*>.*?</style>", "", html, flags=re.S)
    return html.replace("<!-- -->", "")


def has_current(page_html: str, rel_href: str) -> bool:
    """aria-current="true" on the same <a> as rel_href (either attr order —
    Next/React renders aria-current before href on Link)."""
    for a in re.findall(r"<a\b[^>]*>", page_html):
        if f'href="{rel_href}"' in a and 'aria-current="true"' in a:
            return True
    return False


# resolve pilot notes for sub-topic "States of matter" straight from the corpus
notes = json.load(open(os.path.join(ROOT, "content", PILOT, "notes.json")))
S1A_TITLES = ["The Three States of Matter", "Diffusion & Dilution", "Solutions", "Solubility"]
by_title = {n["title"]: n["noteId"] for n in notes}
probe = by_title.get("Diffusion & Dilution")          # NOT the first note — proves siblings render
first_note = by_title.get("The Three States of Matter")  # first-write href target for the row
check("corpus: probe notes resolved", bool(probe and first_note))

# ── 1. Pilot note reader — nested notes under the active sub-topic ─────────
if probe:
    nr = fetch(f"{BASE}/courses/{PILOT}/revision-notes/{probe}")
    nr_text = html_mod.unescape(nr)
    check("note reader: nested notes list rendered (auto-expanded)",
          'aria-label="States of matter notes"' in nr)
    check("note reader: chevron button labelled with note count",
          "the 5 notes in States of matter" in nr_text)
    for t in S1A_TITLES:
        check(f"note reader: sibling note reachable — {t}", t in nr_text)
    check("note reader: current note highlighted in nested list",
          has_current(nr, f"/courses/{PILOT}/revision-notes/{probe}"))
    check("note reader: row href = first corpus note (first-write wins)",
          f'href="/courses/{PILOT}/revision-notes/{first_note}"' in nr)
    check("note reader: row count label says 5 notes", "5 notes" in nr_text)
    check("note reader: no more than one nested notes list for S1-a",
          nr.count('aria-label="States of matter notes"') == 1)

# ── 2. Pilot question set — single set per sub-topic: no expander ──────────
ts = fetch(f"{BASE}/courses/{PILOT}/exam-questions/1-1-states-of-matter--exam-questions")
check("pilot set: no expander buttons (1 set per sub-topic)", "Show the" not in ts and "Hide the" not in ts)
check("pilot set: row links to the set", f"/courses/{PILOT}/exam-questions/1-1-states-of-matter--exam-questions" in ts)

# ── 3. IAL chemistry — dual sets (MCQ + Structured) both in the tree ───────
mcq_rel = f"/courses/{IAL}/exam-questions/1-1-formulae-and-equations--multiple-choice-questions"
st_rel = f"/courses/{IAL}/exam-questions/1-1-formulae-and-equations--structured-questions"
mcq = fetch(f"{BASE}{mcq_rel}")
st = fetch(f"{BASE}{st_rel}")
check("ial mcq: nested sets list rendered (auto-expanded)",
      'aria-label="Formulae &amp; Equations question sets"' in mcq)
check("ial mcq: chevron labelled with set count", "the 2 question sets" in mcq)
check("ial mcq: sibling set (Structured) reachable", "Structured Questions" in mcq)
check("ial mcq: current set highlighted", has_current(mcq, mcq_rel))
check("ial mcq: row href = first corpus set (MCQ, first-write wins)",
      mcq.count(f'href="{mcq_rel}"') >= 2)  # row + nested active item
check("ial structured: active sub-topic resolved on 2nd set page",
      'aria-label="Formulae &amp; Equations question sets"' in st)
check("ial structured: both sets listed too", "Multiple-Choice Questions" in st and "Structured Questions" in st)
check("ial structured: current set highlighted", has_current(st, st_rel))
check("ial structured: row href still points at first corpus set (MCQ)",
      f'href="{mcq_rel}"' in st)

# ── 4. Regression — panel/index pages unaffected ───────────────────────────
qi = fetch(f"{BASE}/courses/{IAL}/exam-questions")
check("ial questions index: both sets still listed", "Multiple-Choice Questions" in qi and "Structured Questions" in qi)
hub = fetch(f"{BASE}/courses/{PILOT}")
check("hub: no tree/expander on hub (SME rule)", "Show the" not in hub and "Hide topics" not in hub)

fails = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(("PASS" if ok else "FAIL") + f"  {name}" + (f"  [{detail}]" if detail and not ok else ""))
print(f"\n{len(results) - len(fails)}/{len(results)} PASS")
sys.exit(1 if fails else 0)
