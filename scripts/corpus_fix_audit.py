#!/usr/bin/env python3
"""
Corpus-fix audit (Task: approved corpus fix wave, follow-up to 4SC0 wave).

For EVERY paper dir under pearson-edexcel/international-gcse/physics/4ph0:
  1. fetch manifest.yaml from SyllabAI/syllabai-pastpapers
  2. for each material (qp.pdf / ms.pdf):
       - sha256 from manifest vs local DAM set (/tmp/my-project/upload/4ph0_dam)
         -> EXACT-R  (corpus file byte-identical to a DAM R-variant file)
       - manifest original_filename containing '(R)' -> PMT-R-NAME
       - local as-in-corpus copy (corpus_<session>_<var>_<mat>.pdf) sha match
         -> confirms manifest sha is what's really in the corpus
  3. emit a verdict table: dir, material, verdict, evidence

Verdicts:
  MISFILED-R   corpus file is (provably or by PMT naming) the R-variant
  OK-NONR      corpus file matches the DAM non-R file, or filename has no (R)
  UNKNOWN      no evidence either way (needs cover-text check)
"""
import hashlib
import json
import os
import sys
import urllib.request

REPO = "SyllabAI/syllabai-pastpapers"
SPEC = "past-papers/pearson-edexcel/international-gcse/physics/4ph0"
DAM = "/tmp/my-project/upload/4ph0_dam"
TOKEN = open("/home/z/my-project/scripts/.gh_token").read().strip()

tree = json.load(open("/home/z/my-project/upload/pp_tree_now.json"))
paths = [t["path"] for t in tree["tree"]]
prefix = SPEC + "/past-papers/"
dirs = sorted({p[len(prefix):].split("/")[0] for p in paths if p.startswith(prefix) and p[len(prefix):].count("/") >= 1 and "/" in p[len(prefix):]})
# dirs like '2013-06/4PH0-1P' — take session/var pairs
pairs = sorted({"|".join(p[len(prefix):].split("/")[:2]) for p in paths if p.startswith(prefix) and p[len(prefix):].count("/") >= 1})
sessions = sorted({pair.split("|")[0] for pair in pairs})
print(f"corpus 4ph0: {len(sessions)} sessions, {len(pairs)} paper dirs")

# local DAM sha map
dam_shas = {}
for fn in os.listdir(DAM):
    if not fn.endswith(".pdf"):
        continue
    h = hashlib.sha256(open(os.path.join(DAM, fn), "rb").read()).hexdigest()
    dam_shas.setdefault(h, []).append(fn)

def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}", "User-Agent": "corpus-fix-audit"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

rows = []
manifests = {}
for pair in pairs:
    sess, d = pair.split("|")
    murl = f"https://raw.githubusercontent.com/{REPO}/main/{prefix}{sess}/{d}/manifest.yaml"
    try:
        mtext = fetch(murl).decode("utf-8")
    except Exception as e:  # noqa: BLE001
        print(f"  !! {sess}/{d}: manifest fetch failed {e}")
        continue
    manifests[pair] = mtext
    # crude yaml walk for the two materials
    for mat in ("ms.pdf", "qp.pdf"):
        block = [ln for ln in mtext.splitlines()]
        # find '- type: ...' block containing 'path: <mat>'
        idx = None
        for i, ln in enumerate(block):
            if ln.strip() == f"path: {mat}" or ln.strip() == f"- type: question-paper" and f"path: {mat}" in block[i:i+2]:
                idx = i
        # simpler: regex
        import re
        m = re.search(r"- type:\s*\S+\n\s*path:\s*" + re.escape(mat) + r"\n\s*sha256:\s*([0-9a-f]{64})\n\s*size_bytes:\s*(\d+)\n\s*original_filename:\s*(.+)", mtext)
        if not m:
            rows.append((sess, d, mat, "NO-MATERIAL", "", "", ""))
            continue
        sha, size, orig = m.group(1), int(m.group(2)), m.group(3).strip()
        dam_hits = dam_shas.get(sha, [])
        is_r_name = "(R)" in orig
        # buckets: DAM R-variant files / DAM non-R files / local as-in-corpus copies
        dam_r = [h for h in dam_hits if ("_1PR_" in h or "_2PR_" in h) and not h.startswith("corpus_")]
        dam_nonr = [h for h in dam_hits if not h.startswith("corpus_") and h not in dam_r]
        corpus_copies = [h for h in dam_hits if h.startswith("corpus_")]
        if dam_r:
            verdict, ev = "MISFILED-R(EXACT)", ";".join(dam_r)
        elif is_r_name:
            verdict, ev = "MISFILED-R(NAME)", orig
        elif dam_nonr:
            verdict, ev = "OK-NONR(EXACT)", ";".join(dam_nonr)
        elif corpus_copies:
            verdict, ev = "UNKNOWN(SHA=CORPUS)", orig
        else:
            verdict, ev = "UNKNOWN", orig
        rows.append((sess, d, mat, verdict, ev, f"{size}B", orig))

print()
print(f"{'session':10s} {'dir':12s} {'mat':6s} {'verdict':18s} evidence")
for sess, d, mat, verdict, ev, size, orig in rows:
    print(f"{sess:10s} {d:12s} {mat:6s} {verdict:18s} {ev[:70]} {size}")

mis = [(s, d, m, v, e) for s, d, m, v, e, _, _ in rows if v.startswith("MISFILED")]
print()
print(f"MISFILED count: {len(mis)}")

json.dump({"rows": rows, "manifests": {k: v for k, v in manifests.items()}},
          open("/home/z/my-project/upload/corpus_fix_audit.json", "w"), indent=1)
print("saved -> upload/corpus_fix_audit.json")
