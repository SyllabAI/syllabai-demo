#!/usr/bin/env python3
"""Recon 4: graph-as-code + content samples."""
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

paths = open(f"{OUT}/resources_tree.txt").read().splitlines()

# graph dir structure
graph_files = sorted(p for p in paths if p.startswith("graph/") or p.startswith("scripts/"))
print("GRAPH/SCRIPTS files:", len(graph_files))
for p in graph_files[:50]:
    print("  " + p)

# fetch a few graph files (small ones likely: yaml/md)
gf = [p for p in graph_files if p.startswith("graph/") and (p.endswith(".md") or p.endswith(".json") or p.endswith(".yaml") or p.endswith(".yml"))][:12]
for p in gf[:8]:
    name = p.replace("/", "__")
    save(name, api_get(f"{API}/repos/SyllabAI/syllabai-resources/contents/{urllib.request.quote(p)}?ref=main", raw=True))

# content samples
base = "SME-ExamQuestion/igcse-chemistry-19/1-principles-of-chemistry/1-1-states-of-matter"
save("sample_topic.json", api_get(f"{API}/repos/SyllabAI/syllabai-resources/contents/{urllib.request.quote(base + '/topic.json')}?ref=main", raw=True))
save("sample_questions.md", api_get(f"{API}/repos/SyllabAI/syllabai-resources/contents/{urllib.request.quote(base + '/questions.md')}?ref=main", raw=True))
save("sample_mark-schemes.md", api_get(f"{API}/repos/SyllabAI/syllabai-resources/contents/{urllib.request.quote(base + '/mark-schemes.md')}?ref=main", raw=True))
save("sample_note.md", api_get(f"{API}/repos/SyllabAI/syllabai-resources/contents/{urllib.request.quote('SME-RevisionNotes/igcse-chemistry-19/notes/1-principles-of-chemistry/1-1-states-of-matter/1-1-1-the-three-states-of-matter.md')}?ref=main", raw=True))

# check flashcard-like dirs & student-book-pilot
sb = sorted(set(p for p in paths if p.startswith("student-book-pilot/")) )[:20]
print("\nSTUDENT-BOOK-PILOT:")
for p in sb:
    print("  " + p)
print("DONE")
