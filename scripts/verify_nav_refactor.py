#!/usr/bin/env python3
"""Task 16 local SSR verification — SME navigation refactor + learner-face cleanup."""
import re
import subprocess
import sys

import os
BASE = os.environ.get("VERIFY_BASE", "http://localhost:3000")
COURSE = "igcse-chemistry-19"

PAGES = {
    "home": f"{BASE}/",
    "hub": f"{BASE}/courses/{COURSE}",
    "questions_index": f"{BASE}/courses/{COURSE}/exam-questions",
    "topic_set": f"{BASE}/courses/{COURSE}/exam-questions/1-1-states-of-matter--exam-questions",
    "notes_index": f"{BASE}/courses/{COURSE}/revision-notes",
    "saved": f"{BASE}/courses/{COURSE}/exam-questions/saved",
    "flashcards_index": f"{BASE}/courses/{COURSE}/flashcards",
}

def visible_html(url: str) -> str:
    """SSR HTML minus <script> (RSC flight) and <style>, plus React's <!-- --> text-node markers."""
    html = subprocess.run(["curl", "-s", url], capture_output=True, text=True).stdout
    html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.S)
    html = re.sub(r"<style\b[^>]*>.*?</style>", "", html, flags=re.S)
    html = html.replace("<!-- -->", "")
    return html

def visible_text(html: str) -> str:
    """Tag-stripped visible text (no attribute values), footer excluded
    (provenance disclosures intentionally live in the footer)."""
    html = re.sub(r"<footer\b.*?</footer>", " ", html, flags=re.S)
    return re.sub(r"<[^>]+>", " ", html)

def get_note_url() -> str:
    html = visible_html(PAGES["notes_index"])
    m = re.search(r'href="(/courses/[^"]+/revision-notes/rn_[^"]+)"', html)
    return BASE + m.group(1) if m else None

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))

# ── 1. AppShell refactor: no global sidebar anywhere ──────────────────────
home = visible_html(PAGES["home"])
hub = visible_html(PAGES["hub"])
check("home: no global demo sidebar (nav[aria-label=Primary])", 'aria-label="Primary"' not in home)
check("home: header has Study tools trigger", "Study tools" in home)
check("home: demo discipline moved to footer", "demo discipline" in home)
check("home: data-mode badge in footer only", "data: " in home or "neon" in home.lower() or "mock" in home.lower())
check("hub: no global demo sidebar", 'aria-label="Primary"' not in hub)
check("hub: one course sidebar (Hide menu once)", hub.count("Hide menu") == 1, f"count={hub.count('Hide menu')}")
check("hub: NO topic tree on hub (SME: index pages have no tree)", "View all topics" not in hub)
check("hub: no hub tabs duplication — tabs present on hub root", "Course Resources" in hub and "Strengths &amp; Weaknesses" in hub)
qi = visible_html(PAGES["questions_index"])
check("questions index: no hub tabs (SME: tabs only on hub root)", 'aria-label="Hub tabs"' not in qi)
check("questions index: no raw topic IDs (top_)", "top_" not in qi)
check("questions index: no schema string", "sme-exam-questions" not in qi)
check("questions index: no '1 min/mark' jargon", "1 min/mark" not in qi)

# ── 2. Topic set page: resource panel + clean learner face ────────────────
ts = visible_html(PAGES["topic_set"])
ts_text = visible_text(ts)
check("topic set: resource panel present (Exam Questions header)", "Hide topics" in ts)
check("topic set: View all topics card", "View all topics" in ts)
check("topic set: Saved questions card", "Saved questions" in ts)
check("topic set: sidebar nav + panel (exactly 2 nav columns)", ts.count("Hide menu") == 1 and ts.count("Hide topics") == 1)
check("topic set: meta line est time", re.search(r"questions · \d+ marks · ≈ \d+ (min|hours)", ts_text) is not None)
check("topic set: no schema leak", "sme-exam-questions" not in ts_text)
check("topic set: no licensing line in content", "LICENSE-DATA" not in ts_text and "attestation" not in ts_text)
check("topic set: no 'All question sets' button", "All question sets" not in ts_text)
check("topic set: no raw topic IDs", "top_" not in ts_text)

# player HTML is client-rendered beyond SSR, but the SSR shell must not carry leaks
check("topic set: no 'SaveMyExams' mention", "SaveMyExams" not in ts_text and "Save My Exams" not in ts_text)

# ── 3. Note reader ─────────────────────────────────────────────────────────
note_url = get_note_url()
check("note reader: resolved a note URL", note_url is not None)
if note_url:
    nr = visible_html(note_url)
    nr_text = visible_text(nr)
    check("note reader: resource panel (Revision Notes header)", "Hide topics" in nr)
    check("note reader: no REVISION NOTE eyebrow", "REVISION NOTE" not in nr_text)
    check("note reader: no raw note id chip (visible text)", "rn_" not in nr_text)
    check("note reader: trust meta row", "Pearson Edexcel" in nr_text and "Updated" in nr_text)
    check("note reader: no corpus attestation card", "SME attestation" not in nr_text)
    check("note reader: guided study reworded", "refuse when evidence is thin" not in nr_text)
    # H1 dedupe: title appears in breadcrumb + h1; body duplicate H1 gone
    m = re.search(r"<h1[^>]*>(.*?)</h1>", nr, re.S)
    check("note reader: exactly one h1", nr.lower().count("<h1") == 1, f"h1s={nr.lower().count('<h1')}")

# ── 4. Saved page panel ────────────────────────────────────────────────────
sv = visible_html(PAGES["saved"])
check("saved: resource panel present", "Hide topics" in sv)

# ── 5. Flashcards pages ────────────────────────────────────────────────────
fi = visible_html(PAGES["flashcards_index"])
check("flashcards index: no 'Save My Exams' mention", "Save My Exams" not in fi and "SaveMyExams" not in fi)

fails = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(("PASS" if ok else "FAIL") + f"  {name}" + (f"  [{detail}]" if detail and not ok else ""))
print(f"\n{len(results) - len(fails)}/{len(results)} PASS")
sys.exit(1 if fails else 0)
