#!/usr/bin/env python3
"""Recon 3: fetch KG views + sample content from resources."""
import json
import os
import urllib.request

TOKEN = open("/home/z/my-project/scripts/.gh_token").read().strip()
API = "https://api.github.com"
OUT = "/home/z/my-project/scripts/recon"

def api_get(url, raw=False):
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github.raw" if raw else "application/vnd.github+json",
        "User-Agent": "demo-recon",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        return f"__error__: {e}"

def save(name, content):
    with open(f"{OUT}/{name}", "w", encoding="utf-8") as f:
        f.write(content)
    print(f"saved {name} ({len(content)} bytes)")

# KG viz + mastery map + header (visual language)
for name, path in [
    ("web_KnowledgeGraphView.tsx", "src/components/syllabai/KnowledgeGraphView.tsx"),
    ("web_ConceptGraphView.tsx", "src/components/syllabai/ConceptGraphView.tsx"),
    ("web_RevisionNotesView.tsx", "src/components/syllabai/RevisionNotesView.tsx"),
]:
    save(name, api_get(f"{API}/repos/SyllabAI/syllabai-web/contents/{path}?ref=main", raw=True))

# resources: top-level dirs from analysis
paths = open(f"{OUT}/resources_tree.txt").read().splitlines()
topdirs = sorted(set(p.split("/")[0] for p in paths if "/" in p))
print("\nTOP-LEVEL DIRS in syllabai-resources:")
for d in topdirs:
    print("  " + d)

# sample: igcse-chemistry-19 exam question file listing
chem_eq = sorted(set(p for p in paths if p.startswith("SME-ExamQuestion/igcse-chemistry-19/") and not p.endswith(".png") and not p.endswith(".jpg")))[:40]
print("\nCHEM EXAM QUESTIONS (igcse-chemistry-19):")
for p in chem_eq:
    print("  " + p)

chem_rn = sorted(set(p for p in paths if p.startswith("SME-RevisionNotes/igcse-chemistry-19/") and p.endswith(".md")))[:25]
print("\nCHEM REVISION NOTES (igcse-chemistry-19):")
for p in chem_rn:
    print("  " + p)

with open(f"{OUT}/resources_chem_files.txt", "w") as f:
    f.write("EXAM QUESTIONS:\n" + "\n".join(chem_eq) + "\n\nREVISION NOTES:\n" + "\n".join(chem_rn))
print("DONE")
