#!/usr/bin/env python3
"""4SC0-wave push orchestrator (mirrors pp_fix_14_push.py mechanics).

Uploads the staged 4PH0 R-variant PDFs + manifests + wave doc as blobs, applies
them to main in ONE tree with a single commit, guarded by a fast-forward check.
Auth: GITHUB_TOKEN env or scripts/.gh_token (repo write scope).
"""
import base64
import hashlib
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

UP = Path("/home/z/my-project/upload/4ph0_r")
REPO = "SyllabAI/syllabai-pastpapers"
API = f"https://api.github.com/repos/{REPO}/"
COMMIT_MSG = (
    "feat: 4SC0 legacy wave — add June 2014 4PH0 R-variant QP+MS (dash-named DAM files); "
    "Paper 1s shared with Science Double Award 4SC0 (spec Issue 3 attestation)"
)


def token():
    if os.environ.get("GITHUB_TOKEN"):
        return os.environ["GITHUB_TOKEN"].strip()
    try:
        return open("/home/z/my-project/scripts/.gh_token").read().strip()
    except Exception:
        sys.exit("NO TOKEN: set GITHUB_TOKEN or restore scripts/.gh_token (repo write scope)")


T = token()


def api(method, path, payload=None, raw=False, tries=3):
    url = API + path
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {T}", "Accept": "application/vnd.github+json",
        "User-Agent": "syllabai-4sc0-wave", "Content-Type": "application/json"})
    for a in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                body = r.read()
                return json.loads(body) if not raw else body
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
    # collect staged files → corpus paths
    staging: dict[str, Path] = {}
    pp_root = UP / "past-papers"
    for f in sorted(pp_root.rglob("*")):
        if f.is_file():
            rel = f.relative_to(UP)
            staging[str(rel)] = f
    doc = UP / "docs" / "4SC0-WAVE-2026-09-28.md"
    staging["docs/4SC0-WAVE-2026-09-28.md"] = doc

    print(f"{len(staging)} staged files")
    head = api("GET", "git/ref/heads/main")["object"]["sha"]
    base_tree = api("GET", f"commits/{head}")["commit"]["tree"]["sha"]
    print(f"HEAD {head[:12]} tree {base_tree[:12]}")

    # phase 1: upload new blobs (skip ones already in the repo via a tree probe)
    entries = []
    existing = set()

    # list existing paths under the touched prefixes (avoid re-uploading)
    for prefix in ("past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers", "docs"):
        url = f"git/trees/{head}?recursive=1"
        # recursive listing of a 4GB repo is heavy; instead probe per-file below
        break
    uploaded = 0
    for rel, f in staging.items():
        data = f.read_bytes()
        sha = git_sha(data)
        entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": sha, "_data": data})
    # dedupe blob uploads by sha
    by_sha: dict[str, bytes] = {}
    for e in entries:
        by_sha[e["sha"]] = e["_data"]
    print(f"unique blobs: {len(by_sha)}")
    for i, (sha, data) in enumerate(sorted(by_sha.items()), 1):
        got = api("POST", "git/blobs", {"content": base64.b64encode(data).decode(), "encoding": "base64"})["sha"]
        if got != sha:
            raise SystemExit(f"blob sha mismatch: sent {sha[:10]} got {got[:10]}")
        uploaded += 1
    print(f"blobs uploaded: {uploaded}")

    # phase 2: one tree + one commit
    tree_items = [{"path": e["path"], "mode": e["mode"], "type": e["type"], "sha": e["sha"]} for e in entries]
    tree = api("POST", "git/trees", {"base_tree": base_tree, "tree": tree_items})
    print(f"tree {tree['sha'][:12]}")
    commit = api("POST", "git/commits", {"message": COMMIT_MSG, "tree": tree["sha"], "parents": [head]})
    print(f"commit {commit['sha'][:12]}")

    # phase 3: fast-forward ref update
    cur = api("GET", "git/ref/heads/main")["object"]["sha"]
    if cur != head:
        raise SystemExit(f"ref moved during push ({cur[:10]} != {head[:10]}); re-run to fast-forward")
    api("PATCH", "git/refs/heads/main", {"sha": commit["sha"], "force": False})
    print(f"PUSHED: main -> {commit['sha'][:12]}")


if __name__ == "__main__":
    main()
