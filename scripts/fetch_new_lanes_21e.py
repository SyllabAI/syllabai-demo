#!/usr/bin/env python3
"""T-SME-11 integration step 1: fetch ONLY the 10 new lanes' text files into
work/corpus-cache/ using the same conventions as fetch_corpus.py (no assets —
images hotlink to the public repo). Also fetch the two root manifests."""
import json, os, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

WORK = "/home/z/my-project/work"
CACHE = os.path.join(WORK, "corpus-cache")
RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main"
HDRS = {"User-Agent": "syllabai-demo-importer"}

ELA1 = "igcse-english-language-a-16-paper-1-non-fiction-texts-and-transactional-writing"
ELA2 = "igcse-english-language-a-16-paper-2-poetry-and-prose-texts-and-imaginative-writing"
NEW = [ELA1, ELA2, "igcse-english-language-a-16-paper-3-coursework", "igcse-maths-b-16"] + [
    f"igcse-science-double-award-modular-24-{s}-unit-{u}"
    for s in ("biology", "chemistry", "physics") for u in (1, 2)]

def fetch_one(repo_path, expected_size):
    dest = os.path.join(CACHE, repo_path)
    if os.path.exists(dest) and os.path.getsize(dest) == expected_size:
        return repo_path, "cached"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    url = f"{RAW}/{urllib.request.quote(repo_path)}"
    last = None
    for _ in range(4):
        try:
            req = urllib.request.Request(url, headers=HDRS)
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            with open(dest, "wb") as f:
                f.write(data)
            return repo_path, "ok"
        except Exception as e:
            last = e
            time.sleep(1.2)
    return repo_path, f"FAIL: {last}"

def build_list():
    wanted = [("SME-ExamQuestion/manifest.json", None), ("SME-Flashcards/manifest.json", None)]
    trees = {n: json.load(open(os.path.join(WORK, f"tree_{n}.json")))["tree"]
             for n in ["SME-RevisionNotes", "SME-ExamQuestion", "SME-Flashcards"]}
    for t in trees["SME-RevisionNotes"]:
        if t["type"] != "blob":
            continue
        p = t["path"]
        slug = p.split("/")[0]
        if slug not in NEW:
            continue
        if "/assets/" in p:
            continue
        if p.endswith("manifest.json") and p.count("/") == 1:
            wanted.append((f"SME-RevisionNotes/{p}", t.get("size", 0)))
        elif "/notes/" in p and p.endswith(".md"):
            wanted.append((f"SME-RevisionNotes/{p}", t.get("size", 0)))
    for t in trees["SME-ExamQuestion"]:
        if t["type"] != "blob":
            continue
        p = t["path"]
        slug = p.split("/")[0]
        if slug not in NEW:
            continue
        base = os.path.basename(p)
        if base in ("manifest.json", "spec_point_index.json", "topic.json"):
            wanted.append((f"SME-ExamQuestion/{p}", t.get("size", 0)))
    for t in trees["SME-Flashcards"]:
        if t["type"] != "blob":
            continue
        p = t["path"]
        if p.split("/")[0] in NEW and p.endswith("deck.json"):
            wanted.append((f"SME-Flashcards/{p}", t.get("size", 0)))
    return wanted

files = build_list()
print(f"to fetch: {len(files)} files")
fails, done = [], 0
with ThreadPoolExecutor(max_workers=20) as ex:
    futs = {ex.submit(fetch_one, p, s): p for p, s in files}
    for fut in as_completed(futs):
        path, status = fut.result()
        done += 1
        if status.startswith("FAIL"):
            fails.append((path, status))
        if done % 100 == 0:
            print(f"  [{done}/{len(files)}]")
print(f"done: {len(files) - len(fails)} ok/cached, {len(fails)} failed")
for p, s in fails[:20]:
    print("  !!", p, s)
