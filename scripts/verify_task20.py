#!/usr/bin/env python3
"""Task 20 local verification — note-body sanitizer + link neutralization +
MCQ answer-key fix. Run against a local (or production) server."""
import html as html_mod
import json
import os
import re
import subprocess

BASE = os.environ.get("VERIFY_BASE", "http://localhost:3000")
ROOT = os.path.join(os.path.dirname(__file__), "..")

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))


def fetch(url: str) -> str:
    raw = subprocess.run(["curl", "-s", url], capture_output=True, text=True).stdout
    return raw


def dom(raw: str) -> str:
    h = re.sub(r"<script\b[^>]*>.*?</script>", "", raw, flags=re.S)
    h = re.sub(r"<style\b[^>]*>.*?</style>", "", h, flags=re.S)
    return html_mod.unescape(h).replace("<!-- -->", "")


def dup_heads(page_dom: str):
    heads = re.findall(r"<h[23][^>]*>(.*?)</h[23]>", page_dom, flags=re.S)
    clean = [re.sub(r"<[^>]+>", "", h).strip() for h in heads]
    seen, dups = set(), []
    for h in clean:
        if h in seen and h not in dups:
            dups.append(h)
        seen.add(h)
    return dups


def corpus(course):
    return json.load(open(os.path.join(ROOT, "content", course, "notes.json")))


# ── 1. leaking + duplicate-heading note (ial-biology) ──────────────────────
bio = corpus("ial-biology-18")
probe = [n for n in bio if n["noteId"] == "rn_b945nQSBby2tWXy7"][0]
check("corpus: bio probe had a leaking chip pre-fix",
      bool(re.search(r"^>\s*\*\*Spec point\*\*\s*—\s*`spcpt_", probe["bodyMd"], re.M)))
raw = fetch(f"{BASE}/courses/ial-biology-18/revision-notes/rn_b945nQSBby2tWXy7")
d = dom(raw)
check("bio note: 0 raw spcpt_ ids in DOM", "spcpt_" not in d,
      f"count={d.count('spcpt_')}")
check("bio note: 0 duplicate h2/h3", not dup_heads(d), f"dups={dup_heads(d)[:3]}")
check("bio note: page renders (HTTP content present)", "Importance of Water" in d or "Saccharide" in d)

# ── 2. worst course (igcse-english-literature-16, 625 chips) — sample scan ──
lit = corpus("igcse-english-literature-16")
lit_notes = sorted(
    lit, key=lambda n: len(re.findall(r"^>\s*\*\*Spec point\*\*\s*—\s*`spcpt_", n["bodyMd"], re.M)),
    reverse=True,
)[:3]
all_clean = True
detail = ""
for n in lit_notes:
    rd = dom(fetch(f"{BASE}/courses/igcse-english-literature-16/revision-notes/{n['noteId']}"))
    if "spcpt_" in rd:
        all_clean = False
        detail = n["noteId"]
    if dup_heads(rd):
        all_clean = False
        detail += "/dups:" + str(dup_heads(rd)[:2])
check("lit 3 worst notes: 0 raw ids, 0 dup headings", all_clean, detail)

# ── 3. pilot regression: readable spec-text chips survive, ids stay gone ────
pilot = corpus("igcse-chemistry-19")
p_probe = next(
    (n for n in pilot if re.search(r"^\>\s*\*\*Spec point\*\*\s*—\s*`spcpt_[A-Za-z0-9_-]+`\s*·\s*\S", n["bodyMd"], re.M)),
    None,
)
check("corpus: pilot text-chip probe found", p_probe is not None)
if p_probe:
    expected = re.search(
        r"\*\*Spec point\*\*\s*—\s*`spcpt_[A-Za-z0-9_-]+`\s*·\s*(.+)", p_probe["bodyMd"], re.M,
    ).group(1).strip()
    rd = dom(fetch(f"{BASE}/courses/igcse-chemistry-19/revision-notes/{p_probe['noteId']}"))
    check("pilot: chip keeps readable spec text (no id)",
          html_mod.unescape(expected)[:40] in rd and "spcpt_" not in rd,
          f"expected={expected[:40]!r}")
    check("pilot: 0 raw ids in DOM", "spcpt_" not in rd, f"count={rd.count('spcpt_')}")

# ── 4. outbound savemyexams links neutralized (igcse-economics) ─────────────
econ_notes = corpus("igcse-economics-17")
econ_probe = max(
    econ_notes,
    key=lambda n: len(re.findall(r"\]\(https?://(?:[^/]+\.)?savemyexams", n["bodyMd"], re.I)),
)
check("corpus: econ outbound-link probe found",
      len(re.findall(r"\]\(https?://(?:[^/]+\.)?savemyexams", econ_probe["bodyMd"], re.I)) >= 1)
if econ_probe:
    rd_raw = fetch(f"{BASE}/courses/igcse-economics-17/revision-notes/{econ_probe['noteId']}")
    rd = dom(rd_raw)
    hrefs = re.findall(r'href="(https?://(?:[^/]+\.)?savemyexams\.(?:com|co\.uk)[^"]*)"', rd, flags=re.I)
    # the header "Source" provenance link is intentional — everything else must go
    check("econ: no savemyexams links left in rendered body", len(hrefs) <= 1,
          f"remaining={len(hrefs)} {hrefs[:2]}")
    # a link LABEL from the corpus must survive as text while its href is gone
    mlabel = re.search(r"\[([^\]]+)\]\(https?://(?:[^/]+\.)?savemyexams", econ_probe["bodyMd"], re.I)
    check("econ: cross-reference label text kept",
          mlabel is not None and html_mod.unescape(mlabel.group(1)) in rd,
          f"label={mlabel.group(1) if mlabel else 'MISSING'!r}")

# ── 5. MCQ answer key (igcse-business-19) ───────────────────────────────────
raw_set = fetch(f"{BASE}/courses/igcse-business-19/exam-questions/cash-flow-forecasting--exam-questions")
flight = raw_set.replace('\\"', '"')  # RSC flight escapes quotes
check("business set: page renders", "net cash flow" in flight.lower())
B_FALSE = '{"label":"B","isCorrect":false,"textMd":"Total cash inflow + total cash outflow"}'
B_TRUE = '{"label":"B","isCorrect":true,"textMd":"Total cash inflow + total cash outflow"}'
check("business set: B no longer carries isCorrect=true", B_FALSE in flight and B_TRUE not in flight)
check("business set: A remains the single key",
      '{"label":"A","isCorrect":true,"textMd":"Total cash inflow – total cash outflow"}' in flight)

# ── summary ─────────────────────────────────────────────────────────────────
fails = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail and not ok else ""))
print(f"\n{len(results) - len(fails)}/{len(results)} PASS")
raise SystemExit(1 if fails else 0)
