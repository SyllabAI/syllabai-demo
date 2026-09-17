#!/usr/bin/env python3
"""
syllabai-demo corpus fetcher.

Downloads the TEXT content of SyllabAI/syllabai-resources (public repo) into
work/corpus-cache/ — only the files the bundle importer needs:

  SME-RevisionNotes/{course}/manifest.json          (39)
  SME-RevisionNotes/{course}/notes/**/*.md          (~3196 note renders)
  SME-ExamQuestion/{course}/spec_point_index.json   (39)
  SME-ExamQuestion/{course}/**/topic.json           (~888 structured topics)
  SME-Flashcards/{course}/**/deck.json              (~747 structured decks)

Images are NOT downloaded: the demo hotlinks them from raw.githubusercontent
(public repo, zero repo bloat). Binary books/PDFs are ignored.

Cache-aware: re-runs skip files already present with correct size.
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

WORK = "/home/z/my-project/work"
CACHE = os.path.join(WORK, "corpus-cache")
RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main"

MAX_WORKERS = 20
RETRIES = 4


def load_tree(name: str):
    with open(os.path.join(WORK, f"tree_{name}.json"), encoding="utf8") as f:
        return json.load(f)["tree"]


def build_fetch_list():
    # tree JSONs are relative to each subtree root — prefix the corpus dir
    wanted = []  # (repo_path, size)

    rn = load_tree("SME-RevisionNotes")
    for t in rn:
        if t["type"] != "blob":
            continue
        p = f"SME-RevisionNotes/{t['path']}"
        if "/assets/" in p:
            continue
        if p.endswith("manifest.json") and p.count("/") == 2:
            wanted.append((p, t.get("size", 0)))
        elif "/notes/" in p and p.endswith(".md"):
            wanted.append((p, t.get("size", 0)))

    eq = load_tree("SME-ExamQuestion")
    for t in eq:
        if t["type"] != "blob":
            continue
        p = f"SME-ExamQuestion/{t['path']}"
        if p.endswith("spec_point_index.json") and p.count("/") == 2:
            wanted.append((p, t.get("size", 0)))
        elif p.endswith("topic.json"):
            wanted.append((p, t.get("size", 0)))

    fc = load_tree("SME-Flashcards")
    for t in fc:
        if t["type"] == "blob" and t["path"].endswith("deck.json"):
            wanted.append((f"SME-Flashcards/{t['path']}", t.get("size", 0)))

    # de-dupe, keep order
    seen = set()
    out = []
    for p, s in wanted:
        if p not in seen:
            seen.add(p)
            out.append((p, s))
    return out


def fetch_one(repo_path: str, expected_size: int):
    dest = os.path.join(CACHE, repo_path)
    if os.path.exists(dest):
        actual = os.path.getsize(dest)
        if expected_size in (0, actual):
            return repo_path, "cached"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    url = f"{RAW}/{urllib.request.quote(repo_path)}"
    last_err = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "syllabai-demo-import/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if expected_size and len(data) != expected_size:
                raise IOError(f"size mismatch: got {len(data)} want {expected_size}")
            with open(dest, "wb") as f:
                f.write(data)
            return repo_path, "ok"
        except (urllib.error.URLError, urllib.error.HTTPError, IOError, OSError) as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    return repo_path, f"FAIL: {last_err}"


def main():
    os.makedirs(CACHE, exist_ok=True)
    files = build_fetch_list()
    total_bytes = sum(s for _, s in files)
    print(f"fetch list: {len(files)} files, {total_bytes/1e6:.1f} MB expected")
    ok = cached = failed = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = {ex.submit(fetch_one, p, s): p for p, s in files}
        for i, fut in enumerate(as_completed(futs), 1):
            path, status = fut.result()
            if status.startswith("FAIL"):
                failed += 1
                print(f"  [{i}/{len(files)}] {status} {path}", flush=True)
            elif status == "cached":
                cached += 1
            else:
                ok += 1
            if i % 250 == 0:
                rate = i / (time.time() - t0)
                print(f"  progress {i}/{len(files)} ({rate:.1f} files/s, ok={ok} cached={cached} failed={failed})", flush=True)
    print(f"DONE in {time.time()-t0:.0f}s — ok={ok} cached={cached} failed={failed}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
