#!/usr/bin/env python3
"""PP-FIX-2026-09-26 push orchestrator.
Uploads new blobs, then applies the validated changeset to main in <=200-entry
tree chunks with a commit per chunk and a fast-forward guard.
Auth: GITHUB_TOKEN env or scripts/.gh_token (repo write scope)."""
import hashlib, json, os, sys, time, urllib.request

UP = "/home/z/my-project/upload"
REPO = "SyllabAI/syllabai-pastpapers"
API = f"https://api.github.com/repos/{REPO}/"
TAG = "PP-FIX-2026-09-26"

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
        "User-Agent": "syllabai-repair-agent", "Content-Type": "application/json"})
    for a in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read() if not raw else r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:300]
            if e.code in (502, 504, 409) and a < tries - 1:
                time.sleep(4 * (a + 1)); continue
            raise SystemExit(f"{method} {path} -> {e.code}: {body}")
        except Exception as e:
            if a < tries - 1:
                time.sleep(4 * (a + 1)); continue
            raise SystemExit(f"{method} {path} -> {e}")

# ---- load validated ops
OPS = json.load(open(f"{UP}/changeset_ops.json"))
M = json.load(open(f"{UP}/manifest_ops.json"))
for p, sha in M.items():
    OPS[p] = {"sha": sha, "why": "manifest/doc blob", "src": "new_blobs"}
head = api("GET", "git/ref/heads/main")["object"]["sha"]
base_tree = api("GET", f"commits/{head}")["commit"]["tree"]["sha"]
print(f"HEAD {head[:12]} tree {base_tree[:12]}")

def blob_content(sha):
    for base in (f"{UP}/new_blobs", f"{UP}/staging"):
        for root, _, files in os.walk(base):
            for f in files:
                fp = os.path.join(root, f)
                data = open(fp, "rb").read()
                h = hashlib.sha1(); h.update(b"blob %d\0" % len(data)); h.update(data)
                if h.hexdigest() == sha:
                    return data
    return None

# ---- phase 1: upload new blobs
new_shas = {op["sha"] for op in OPS.values() if op["sha"]}
existing = set()
for line in open(f"{UP}/pp_ls_tree.txt"):
    existing.add(line.split()[2])
to_upload = [s for s in new_shas if s not in existing]
print(f"new blobs to upload: {len(to_upload)}")
for i, sha in enumerate(sorted(to_upload)):
    content = blob_content(sha)
    if content is None:
        raise SystemExit(f"content not found locally for sha {sha}")
    got = api("POST", "git/blobs", {"content": hashlib.sha1(content).hexdigest() and
              __import__("base64").b64encode(content).decode(), "encoding": "base64"})["sha"]
    if got != sha:
        raise SystemExit(f"blob sha mismatch: sent {sha[:10]} got {got[:10]}")
    if (i + 1) % 25 == 0:
        print(f"  uploaded {i+1}/{len(to_upload)}")

# ---- phase 2: chunked tree application + commits
sets = [{"path": p, "mode": "100644", "type": "blob", "sha": op["sha"]}
        for p, op in OPS.items() if op["sha"] is not None]
dels = [{"path": p, "mode": "100644", "type": "blob", "sha": None}
        for p, op in OPS.items() if op["sha"] is None]
chunks = [sets[i:i+200] + dels[i:i+200] for i in range(0, max(len(sets), len(dels)), 200)]
chunks = [c for c in chunks if c]
print(f"tree chunks: {len(chunks)} (sets={len(sets)}, dels={len(dels)})")

parent = head
cur_base = base_tree
for i, chunk in enumerate(chunks):
    tree = api("POST", "git/trees", {"base_tree": cur_base, "tree": chunk})
    cur_base = tree["sha"]
    commit = api("POST", "git/commits", {
        "message": f"fix: {TAG} — corpus identity repair wave ({i+1}/{len(chunks)}: physics base/R cure, "
                   f"phantom 2020-06 merges, quarantine resolution)",
        "tree": tree["sha"], "parents": [parent]})
    parent = commit["sha"]
    print(f"  chunk {i+1}/{len(chunks)}: tree {tree['sha'][:10]} commit {parent[:10]}")

# ---- phase 3: fast-forward ref update
cur = api("GET", "git/ref/heads/main")["object"]["sha"]
if cur != head:
    raise SystemExit(f"ref moved during push ({cur[:10]} != {head[:10]}); re-run to fast-forward")
api("PATCH", "git/refs/heads/main", {"sha": parent, "force": False})
print(f"PUSHED: main -> {parent[:12]}")
