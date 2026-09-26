#!/usr/bin/env python3
"""
setup_auto_reindex.py — corpus-side half of the zero-touch pipeline.

1. Creates .github/workflows/notify-demo-reindex.yml in SyllabAI/syllabai-pastpapers
   via the Contents API (no 4 GB clone).
2. Sets the DEMO_REINDEX_PAT Actions secret on the corpus repo (sealed with
   the repo's public key via libsodium sealed box).
3. Idempotent: re-running updates the file/secret in place.
"""
import base64
import json
import sys
from pathlib import Path

import nacl.public

TOKEN = Path("scripts/.gh_token").read_text().strip()
HDR = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github+json",
    "User-Agent": "syllabai-setup",
    "X-GitHub-Api-Version": "2022-11-28",
}
REPO = "SyllabAI/syllabai-pastpapers"


def api(method: str, url: str, payload: dict | None = None) -> tuple[int, dict | list]:
    import urllib.error
    import urllib.request

    req = urllib.request.Request(url, method=method, headers=HDR)
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data) as resp:
            body = resp.read()
            status = resp.status
    except urllib.error.HTTPError as err:
        body = err.read()
        status = err.code
    return status, (json.loads(body) if body else {})


def main() -> None:
    # 1 — create/update the notify workflow
    wf_path = ".github/workflows/notify-demo-reindex.yml"
    local = Path("upload/notify-demo-reindex.yml").read_bytes()
    content_b64 = base64.b64encode(local).decode()
    status, existing = api("GET", f"https://api.github.com/repos/{REPO}/contents/{wf_path}?ref=main")
    sha = existing.get("sha") if status == 200 else None
    msg = (
        "ci(reindex): notify syllabai-demo on paper pushes (repository_dispatch)"
        if sha
        else "ci(reindex): add notify-demo-reindex workflow (ping demo on paper pushes)"
    )
    payload = {"message": msg, "content": content_b64, "branch": "main"}
    if sha:
        payload["sha"] = sha
    status, resp = api("PUT", f"https://api.github.com/repos/{REPO}/contents/{wf_path}", payload)
    print(f"workflow file PUT: HTTP {status} ({resp.get('commit', {}).get('sha', '?')[:10]})")
    if status not in (200, 201):
        sys.exit(1)

    # 2 — set the DEMO_REINDEX_PAT secret
    status, pk = api("GET", f"https://api.github.com/repos/{REPO}/actions/secrets/public-key")
    raw_key = base64.b64decode(pk["key"])
    key = nacl.public.PublicKey(raw_key, encoder=nacl.encoding.RawEncoder)
    sealed = nacl.public.SealedBox(key).encrypt(TOKEN.encode())
    status, _ = api(
        "PUT",
        f"https://api.github.com/repos/{REPO}/actions/secrets/DEMO_REINDEX_PAT",
        {
            "encrypted_value": base64.b64encode(sealed).decode(),
            "key_id": pk["key_id"],
        },
    )
    print(f"secret DEMO_REINDEX_PAT PUT: HTTP {status}")
    if status not in (201, 204):
        sys.exit(1)

    print("DONE")


if __name__ == "__main__":
    main()
