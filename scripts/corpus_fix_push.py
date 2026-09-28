#!/usr/bin/env python3
"""Corpus-fix wave push (mirrors push_4sc0_wave.py mechanics).

Uploads 23 replacement PDFs + 12 corrected manifests + the wave doc as blobs,
applies them to main in ONE tree with a single commit, ff-guarded.
"""
import base64
import hashlib
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

UP = Path("/home/z/my-project/upload/corpus_fix_staging")
REPO = "SyllabAI/syllabai-pastpapers"
API = f"https://api.github.com/repos/{REPO}/"
SPEC = "past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers"
COMMIT_MSG = (
    "fix: corpus-fix wave — replace 23 mis-filed regional (R) PDFs in the June 2013-2018\n"
    "4PH0 1P/2P dirs with the genuine non-R papers\n\n"
    "The 2026-09-11 ingestion filed PMT's '(R)' downloads (the 4PH0/1PR, 4PH0/2PR\n"
    "regional-variant papers) under the plain-paper dirs for every June session\n"
    "2013-2018 — 23 files across 12 dirs — leaving the genuine non-R June papers\n"
    "absent while the R dirs (4SC0 legacy wave) already hold the regional ones.\n\n"
    "Every replacement re-downloaded at wave time from the Pearson qualifications\n"
    "portal content-dam (sha-matched to the 4SC0 wave's stored copies; URLs + new\n"
    "sha256/size recorded per material). Identity proof per mis-filed file: PMT '(R)'\n"
    "naming, byte-exact DAM-regional sha match (3 files), and pixel-render distance\n"
    "(corpus copy ~ DAM regional 0.00-0.40 vs ~ non-R 8.4-34.9). Replacements:\n"
    "21/23 text-clean covers printing the plain code only; the two 2013/2015-era\n"
    "covers with broken ToUnicode maps verified visually from renders (P41561A,\n"
    "P44238A) + pixel distance.\n\n"
    "Left alone (verified genuine): 2013-06/4PH0-2P/qp.pdf (text-similarity 0.998 vs\n"
    "non-R, 0.035 vs R); January sessions 2012-2019 and June 2011/2012 (no regional\n"
    "files exist on the DAM for those series; no '(R)' naming); the 1PR/2PR dirs.\n\n"
    "manifest.yaml per fixed dir: new material blocks + identification rebuilt from\n"
    "the new covers with a correction note. Wave doc: docs/CORPUS-FIX-2026-09-28.md.\n\n"
    "Found via demo recon qstn_by9mpfwQND3Dy2gk (underground-train Q11, pinned to\n"
    "June 2016 in syllabai-demo 33faa4c): absent from the corpus's mis-filed\n"
    "2016-06/4PH0-1P (P46079A = 1PR), present in the genuine paper as Q11 = 11 marks."
)


def token():
    if os.environ.get("GITHUB_TOKEN"):
        return os.environ["GITHUB_TOKEN"].strip()
    try:
        return open("/home/z/my-project/scripts/.gh_token").read().strip()
    except Exception:
        sys.exit("NO TOKEN")


T = token()


def api(method, path, payload=None, tries=3):
    url = API + path
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {T}", "Accept": "application/vnd.github+json",
        "User-Agent": "syllabai-corpus-fix", "Content-Type": "application/json"})
    for a in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:300]
            if e.code in (502, 504, 409) and a < tries - 1:
                time.sleep(4 * (a + 1)); continue
            raise SystemExit(f"{method} {path} -> {e.code}: {body}")
        except Exception as e:
            if a < tries - 1:
                time.sleep(4 * (a + 1)); continue
            raise SystemExit(f"{method} {path} -> {e}")


def git_sha(data: bytes) -> str:
    h = hashlib.sha1(); h.update(b"blob %d\0" % len(data)); h.update(data)
    return h.hexdigest()


def main() -> None:
    staging: dict[str, Path] = {}
    for f in sorted(UP.rglob("*")):
        if f.is_file() and f.name != "staged.json":
            rel = f.relative_to(UP)
            staging[f"{SPEC}/{rel}" if str(rel).startswith("20") else str(rel)] = f
    print(f"{len(staging)} staged files")
    assert len(staging) == 36, f"expected 36 files (23 pdf + 12 manifest + 1 doc), got {len(staging)}"

    head = api("GET", "git/ref/heads/main")["object"]["sha"]
    base_tree = api("GET", f"commits/{head}")["commit"]["tree"]["sha"]
    print(f"HEAD {head[:12]} tree {base_tree[:12]}")

    entries = []
    for rel, f in staging.items():
        data = f.read_bytes()
        entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": git_sha(data), "_data": data})
    by_sha: dict[str, bytes] = {}
    for e in entries:
        by_sha[e["sha"]] = e["_data"]
    print(f"unique blobs: {len(by_sha)}")
    for sha, data in sorted(by_sha.items()):
        got = api("POST", "git/blobs", {"content": base64.b64encode(data).decode(), "encoding": "base64"})["sha"]
        if got != sha:
            raise SystemExit(f"blob sha mismatch: sent {sha[:10]} got {got[:10]}")
    print("blobs uploaded")

    tree_items = [{"path": e["path"], "mode": e["mode"], "type": e["type"], "sha": e["sha"]} for e in entries]
    tree = api("POST", "git/trees", {"base_tree": base_tree, "tree": tree_items})
    print(f"tree {tree['sha'][:12]}")
    commit = api("POST", "git/commits", {"message": COMMIT_MSG, "tree": tree["sha"], "parents": [head]})
    print(f"commit {commit['sha'][:12]}")

    cur = api("GET", "git/ref/heads/main")["object"]["sha"]
    if cur != head:
        raise SystemExit(f"ref moved during push ({cur[:10]} != {head[:10]}); re-run to fast-forward")
    api("PATCH", "git/refs/heads/main", {"sha": commit["sha"], "force": False})
    print(f"PUSHED: main -> {commit['sha'][:12]}")


if __name__ == "__main__":
    main()
