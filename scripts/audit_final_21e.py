#!/usr/bin/env python3
"""Final spot checks: resolution counts, ELA question/marks totals vs commit
claims, status_note on no-TQ lanes, follow-up commit c2fcd88aea."""
import json, os, subprocess, urllib.request

RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main"
import os as _os

def _gh_headers():
    tok = ""
    _p = "/home/z/my-project/scripts/.gh_token"
    if _os.path.exists(_p):
        tok = open(_p).read().strip()
    h = {"User-Agent": "syllabai-demo-importer"}
    if tok:
        h["Authorization"] = f"token {tok}"
    return h

HDRS = _gh_headers()
CACHE = "/home/z/my-project/work/sample-cache"

def raw(path):
    dest = os.path.join(CACHE, path)
    if os.path.exists(dest):
        return open(dest, encoding="utf8").read()
    req = urllib.request.Request(f"{RAW}/{urllib.request.quote(path)}", headers=_gh_headers())
    with urllib.request.urlopen(req) as r:
        text = r.read().decode("utf8", "replace")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "w").write(text)
    return text

def j(path):
    return json.loads(raw(path))

ELA1 = "igcse-english-language-a-16-paper-1-non-fiction-texts-and-transactional-writing"
ELA2 = "igcse-english-language-a-16-paper-2-poetry-and-prose-texts-and-imaginative-writing"

print("=== ELA question/marks totals vs commit claims (p1: 100q/1980m, p2: 65q/1950m) ===")
for slug, want_q, want_m in [(ELA1, 100, 1980), (ELA2, 65, 1950)]:
    man = j(f"SME-ExamQuestion/{slug}/manifest.json")
    tot = man.get("totals", {})
    print(f"{slug[:50]}: totals={json.dumps(tot)[:180]}")

print("\n=== status_note on the 8 no-TQ lanes ===")
for slug in ["igcse-maths-b-16", "igcse-english-language-a-16-paper-3-coursework",
             "igcse-science-double-award-modular-24-biology-unit-1",
             "igcse-science-double-award-modular-24-physics-unit-2"]:
    man = j(f"SME-ExamQuestion/{slug}/manifest.json")
    print(f"{slug}: status_note={man.get('status_note','<none>')!r} topics={man.get('topics')} totals={json.dumps(man.get('totals'))[:120]}")

print("\n=== ELA p1 resolution counts/validation ===")
res = j(f"SME-ExamQuestion/{ELA1}/spec_point_resolution.json")
print("counts:", json.dumps(res.get("counts"))[:220])
print("validation:", json.dumps(res.get("validation"))[:220])

print("\n=== follow-up commit c2fcd88aea ===")
out = subprocess.run(
    ["curl", "-s", "-H", f"Authorization: token {HDRS['Authorization'].split(' ')[1]}",
     "-H", "User-Agent: syllabai-demo-importer",
     "https://api.github.com/repos/SyllabAI/syllabai-resources/commits/c2fcd88aea"],
    capture_output=True, text=True).stdout
d = json.loads(out)
print("message:", d["commit"]["message"][:400].replace("\n", " | "))
print("files:")
for f in d["files"][:12]:
    print(f"  {f['status'][:6]} +{f['additions']}/-{f['deletions']} {f['filename'][:100]}")

print("\n=== RN page sums for the 10 new lanes (commit claim +548) ===")
NEW = [ELA1, ELA2, "igcse-english-language-a-16-paper-3-coursework", "igcse-maths-b-16"] + [
    f"igcse-science-double-award-modular-24-{s}-unit-{u}"
    for s in ("biology", "chemistry", "physics") for u in (1, 2)]
total = 0
for slug in NEW:
    man = j(f"SME-RevisionNotes/{slug}/manifest.json")
    c = man.get("counts", {})
    exp, got, fails = c.get("pages_expected"), c.get("pages_scraped"), c.get("fetch_failures")
    total += got or 0
    flag = "" if exp == got and fails == 0 else "  <-- MISMATCH"
    print(f"{slug[:64]:<64} exp={exp} got={got} fails={fails}{flag}")
print("SUM:", total, "(claim: +548)")
