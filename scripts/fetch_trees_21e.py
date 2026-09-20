#!/usr/bin/env python3
"""Fetch per-subtree recursive trees for SME-RevisionNotes / SME-ExamQuestion /
SME-Flashcards / Official-Specifications from SyllabAI/syllabai-resources."""
import json, os, urllib.request

GH = "https://api.github.com"
REPO = "SyllabAI/syllabai-resources"
WORK = "/home/z/my-project/work"

def api(url):
    h = {"User-Agent": "syllabai-demo-importer"}
    tok = (open("/home/z/my-project/scripts/.gh_token").read().strip()
           if os.path.exists("/home/z/my-project/scripts/.gh_token") else "")
    if tok:
        h["Authorization"] = f"token {tok}"
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req) as r:
        return json.load(r)

root = api(f"{GH}/repos/{REPO}/git/trees/main")
subtrees = {}
for t in root["tree"]:
    if t["type"] == "tree":
        subtrees[t["path"]] = t["sha"]

for name in ["SME-RevisionNotes", "SME-ExamQuestion", "SME-Flashcards", "Official-Specifications"]:
    if name not in subtrees:
        print(f"!! {name}: NOT FOUND at root")
        continue
    sha = subtrees[name]
    d = api(f"{GH}/repos/{REPO}/git/trees/{sha}?recursive=1")
    out = os.path.join(WORK, f"tree_{name}.json")
    with open(out, "w") as f:
        json.dump(d, f)
    trunc = d.get("truncated", False)
    print(f"{name}: {len(d['tree'])} entries, truncated={trunc} -> {out}")
