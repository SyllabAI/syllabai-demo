#!/usr/bin/env python3
"""Recon 2: analyze resources tree locally + fetch key web source files."""
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

# ---- analyze resources tree ----
paths = open(f"{OUT}/resources_tree.txt").read().splitlines()
print(f"resources total paths: {len(paths)}")
top = {}
for p in paths:
    parts = p.split("/")
    key = "/".join(parts[:2])
    top[key] = top.get(key, 0) + 1
print("top-level distribution (first 40):")
for k in sorted(top, key=lambda x: -top[x])[:40]:
    print(f"  {top[k]:6}  {k}")

# find flashcards / exam-questions / revision-notes patterns
fc = [p for p in paths if "flashcard" in p.lower()][:15]
eq = [p for p in paths if "exam-question" in p.lower()][:15]
rn = [p for p in paths if "revision-note" in p.lower()][:15]
kg = [p for p in paths if ("graph" in p.lower() or "spec-point" in p.lower() or "specpoint" in p.lower())][:15]
print("\nflashcard samples:", *fc[:10], sep="\n  ")
print("\nexam-question samples:", *eq[:10], sep="\n  ")
print("\nrevision-note samples:", *rn[:10], sep="\n  ")
print("\ngraph/specpoint samples:", *kg[:10], sep="\n  ")

with open(f"{OUT}/resources_analysis.txt", "w") as f:
    f.write("TOP LEVEL:\n" + "\n".join(f"{top[k]:6}  {k}" for k in sorted(top, key=lambda x: -top[x])[:60]))
    f.write("\n\nFLASHCARDS:\n" + "\n".join(fc[:40]))
    f.write("\n\nEXAM QUESTIONS:\n" + "\n".join(eq[:40]))
    f.write("\n\nREVISION NOTES:\n" + "\n".join(rn[:40]))
    f.write("\n\nGRAPH/SPEC-POINT:\n" + "\n".join(kg[:40]))

# ---- fetch syllabai-web key files ----
for name, path in [
    ("web_api.ts", "src/lib/api.ts"),
    ("web_types.ts", "src/lib/types.ts"),
    ("web_globals.css", "src/app/globals.css"),
    ("web_page.tsx", "src/app/page.tsx"),
]:
    save(name, api_get(f"{API}/repos/SyllabAI/syllabai-web/contents/{path}?ref=main", raw=True))

# check file sizes of the two graph views first
meta = api_get(f"{API}/repos/SyllabAI/syllabai-web/contents/src/components/syllabai?ref=main")
try:
    for m in json.loads(meta):
        print(f"  {m.get('size', 0):8}  {m['name']}")
except Exception:
    print(meta[:300])
print("DONE")
