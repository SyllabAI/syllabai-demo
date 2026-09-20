#!/usr/bin/env python3
"""Enumerate course slugs per resource domain; diff vs the 39 packages already
in content/; report per-new-course file coverage + counts."""
import json, os
from collections import defaultdict

WORK = "/home/z/my-project/work"
CONTENT = "/home/z/my-project/content"

def courses_of(name, pred):
    d = json.load(open(os.path.join(WORK, f"tree_{name}.json")))
    per = defaultdict(lambda: {"files": 0, "bytes": 0, "examples": []})
    for t in d["tree"]:
        if t["type"] != "blob" or not pred(t["path"]):
            continue
        slug = t["path"].split("/")[0]
        per[slug]["files"] += 1
        per[slug]["bytes"] += t.get("size", 0)
        if len(per[slug]["examples"]) < 3:
            per[slug]["examples"].append(t["path"])
    return per

have = set(os.listdir(CONTENT)) - {"courses.json"}

rn = courses_of("SME-RevisionNotes", lambda p: p.count("/") >= 1)
eq = courses_of("SME-ExamQuestion", lambda p: p.count("/") >= 1)
fc = courses_of("SME-Flashcards", lambda p: p.count("/") >= 1)

all_repo = sorted(set(rn) | set(eq) | set(fc))
print(f"repo courses: {len(all_repo)} | local packages: {len(have)}")
new = [c for c in all_repo if c not in have]
old_missing = [c for c in sorted(have) if c not in all_repo]
print(f"\n=== NEW courses not yet on site ({len(new)}) ===")
for c in new:
    print(f"\n{c}")
    print(f"  RevisionNotes: {rn.get(c,{}).get('files',0)} files")
    print(f"  ExamQuestion : {eq.get(c,{}).get('files',0)} files")
    print(f"  Flashcards   : {fc.get(c,{}).get('files',0)} files")
print(f"\n=== local packages with NO repo presence ({len(old_missing)}) ===")
for c in old_missing:
    print(" ", c)

# official specs: which subjects have spec.json + parsed outputs
spec = json.load(open(os.path.join(WORK, "tree_Official-Specifications.json")))
top = defaultdict(lambda: {"root": [], "parsed": []})
for t in spec["tree"]:
    if t["type"] != "blob":
        continue
    parts = t["path"].split("/")
    if parts[0] == "parsed" and len(parts) >= 2:
        top[parts[1]]["parsed"].append(parts[-1])
    else:
        top[parts[0]]["root"].append(parts[-1])
print(f"\n=== Official-Specifications subjects ({len(top)}) ===")
for s in sorted(top):
    files = ",".join(sorted(set(top[s]["root"])))
    prs = sorted(set(top[s]["parsed"]))
    print(f"  {s}: root=[{files[:80]}] parsed=[{','.join(prs)}]")
