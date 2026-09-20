#!/usr/bin/env python3
"""Verify official-spec canonical bundles for the 3 new quals + mapping
sidecars + flashcard map report + follow-up repair commit."""
import json, os, urllib.request

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

print("=== A) spec_points.json / topics.json counts — new quals vs baseline ===")
for subj, expected in [("igcse-english-language-a", 26), ("igcse-maths-b", 98), ("igcse-science-double-award-modular", 411), ("igcse-chemistry", None)]:
    try:
        sp = j(f"Official-Specifications/parsed/{subj}/spec_points.json")
        tp = j(f"Official-Specifications/parsed/{subj}/topics.json")
        pts = sp if isinstance(sp, list) else sp.get("spec_points", sp.get("points", []))
        tops = tp if isinstance(tp, list) else tp.get("topics", [])
        print(f"{subj}: spec_points={len(pts)} topics={len(tops)} (commit claim: {expected})")
        if pts:
            print(f"   sample keys: {sorted(pts[0].keys()) if isinstance(pts[0], dict) else pts[0]}")
    except Exception as e:
        print(f"!! {subj}: {e}")

print("\n=== B) spec.json (source registration) for new quals ===")
for subj in ["igcse-english-language-a", "igcse-maths-b", "igcse-science-double-award-modular"]:
    try:
        s = j(f"Official-Specifications/{subj}/spec.json")
        print(f"{subj}: {json.dumps(s, ensure_ascii=False)[:340]}")
    except Exception as e:
        print(f"!! {subj}: {e}")

print("\n=== C) Official-Specifications/manifest.json — new qual entries ===")
man = j("Official-Specifications/manifest.json")
quals = man if isinstance(man, list) else man.get("qualifications", man.get("quals", []))
print("total quals:", len(quals))
for q in quals:
    sid = q.get("subject_slug") or q.get("slug") or ""
    if "english-language-a" in sid or "maths-b" in sid or "double-award-modular" in sid:
        print(f"  {sid}: {json.dumps(q, ensure_ascii=False)[:300]}")

print("\n=== D) spec_point_resolution.json (ELA paper-1) — resolution stats ===")
ELA1 = "igcse-english-language-a-16-paper-1-non-fiction-texts-and-transactional-writing"
res = j(f"SME-ExamQuestion/{ELA1}/spec_point_resolution.json")
print("top keys:", list(res.keys()) if isinstance(res, dict) else f"list[{len(res)}]")
items = res if isinstance(res, list) else next((v for v in res.values() if isinstance(v, list)), [])
if items and isinstance(items[0], dict):
    print("item keys:", sorted(items[0].keys()))
    from collections import Counter
    st = Counter(i.get("status", i.get("resolution", "?")) for i in items)
    print("status distribution:", dict(st))

print("\n=== E) _sme_map_report.json + _flashcard_map_report.json tails ===")
try:
    r1 = j("Official-Specifications/parsed/_sme_map_report.json")
    tail_keys = [k for k in r1.keys() if "49" in str(r1[k]) or "t_sme" in str(k).lower() or "generated" in k.lower()] if isinstance(r1, dict) else None
    print("map_report keys:", list(r1.keys())[:14] if isinstance(r1, dict) else type(r1).__name__)
    if isinstance(r1, dict):
        for k in ["generated_utc", "t_sme_11", "rounds"]:
            if k in r1: print(f"  {k}: {str(r1[k])[:200]}")
except Exception as e:
    print("!! map report:", e)
try:
    r2 = j("Official-Specifications/parsed/_flashcard_map_report.json")
    print("flashcard_report keys:", list(r2.keys())[:14] if isinstance(r2, dict) else type(r2).__name__)
    if isinstance(r2, dict):
        for k in list(r2.keys())[:8]:
            v = r2[k]
            print(f"  {k}: {str(v)[:160]}")
except Exception as e:
    print("!! flashcard report:", e)
