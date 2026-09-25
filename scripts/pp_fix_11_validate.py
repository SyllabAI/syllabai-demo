#!/usr/bin/env python3
"""Validate the changeset: replay ops on the current tree, check invariants."""
import json, hashlib, os

UP = "/home/z/my-project/upload"
OPS = json.load(open(f"{UP}/changeset_ops.json"))
MANIFEST_OPS = json.load(open(f"{UP}/manifest_ops.json"))

SHA_BY_PATH = {}
for line in open(f"{UP}/pp_ls_tree.txt"):
    meta, p = line.rstrip("\n").split("\t", 1)
    SHA_BY_PATH[p] = meta.split()[2]

# merge manifest ops into OPS (they're set-ops too)
for p, sha in MANIFEST_OPS.items():
    OPS[p] = {"sha": sha, "why": "manifest", "src": "new_blobs"}

final = dict(SHA_BY_PATH)
ops_applied = {}
errors, notes = [], []
# apply; detect only op-vs-op conflicts (initial tree values are expected to be overwritten)
seen_conflicts = []
for p, op in OPS.items():
    if op["sha"] is None:
        if ops_applied.get(p, "missing") is None:
            seen_conflicts.append(f"double-del {p}")
        final[p] = None
        ops_applied[p] = None
    else:
        pa = ops_applied.get(p)
        if pa is not None and pa != op["sha"]:
            seen_conflicts.append(f"conflict {p}: {pa[:10]} vs {op['sha'][:10]}")
        final[p] = op["sha"]
        ops_applied[p] = op["sha"]

# 1. no path both deleted and set (in final state all None-then-set fine; conflicts detected above)
errors += seen_conflicts

# 2. every set path's sha must exist in old tree OR be a new-blob sha (manifests) OR a staged blob
new_blob_shas = set()
NB = f"{UP}/new_blobs"
for root, _, files in os.walk(NB):
    for f in files:
        fp = os.path.join(root, f)
        rel = os.path.relpath(fp, NB)
        data = open(fp, "rb").read()
        h = hashlib.sha1(); h.update(b"blob %d\0" % len(data)); h.update(data)
        new_blob_shas.add(h.hexdigest())

staged_shas = set()
ST = f"{UP}/staging"
for root, _, files in os.walk(ST):
    for f in files:
        fp = os.path.join(root, f)
        data = open(fp, "rb").read()
        h = hashlib.sha1(); h.update(b"blob %d\0" % len(data)); h.update(data)
        staged_shas.add(h.hexdigest())

tree_shas = set(SHA_BY_PATH.values())
missing_src = 0
for p, op in OPS.items():
    if op["sha"] is None:
        continue
    if op["sha"] not in tree_shas and op["sha"] not in new_blob_shas and op["sha"] not in staged_shas:
        errors.append(f"unknown sha for {p}: {op['sha'][:12]}")
        missing_src += 1

# 3. dirs with files must have manifests
final_files = [p for p, s in final.items() if s is not None]
final_set = set(final_files)
dirs = {}
for p in final_files:
    if p.startswith("past-papers/") and p.endswith(".pdf"):
        d = p.rsplit("/", 1)[0]
        dirs.setdefault(d, []).append(p)
no_manifest = [d for d in dirs if f"{d}/manifest.yaml" not in final_set]
# exclude dirs that legitimately have no manifest: none expected
for d in no_manifest:
    errors.append(f"dir without manifest: {d}")

# 4. all 2020-06 phantom dirs for merged specs must be fully gone
merged_specs = ["physics/4ph1/", "mathematics-a/4ma1/", "mathematics-b/4mb1/",
                "further-pure-mathematics/4pm1/", "computer-science/4cp0/past-papers/2020-06/4CP0-01",
                "computer-science/4cp0/past-papers/2020-06/4CP0-02"]
leftover = [p for p in final_files if "/2020-06/" in p and any(m in p for m in
            ["physics/4ph1/", "mathematics-a/4ma1/", "mathematics-b/4mb1/", "further-pure-mathematics/4pm1/"])]
for p in leftover:
    errors.append(f"2020-06 leftover: {p}")
# 4cp0-02 dir must be fully gone; 4cp0-01 keeps only manifest+ms
cp02_left = [p for p in final_files if "4cp0/past-papers/2020-06/4CP0-02/" in p]
for p in cp02_left:
    errors.append(f"4CP0-02 leftover: {p}")
cp01_left = sorted(p.rsplit('/',1)[1] for p in final_files if "4cp0/past-papers/2020-06/4CP0-01/" in p)
print("4CP0-01 2020-06 keeps:", cp01_left)

# 5. wch14/15/16: -1 dirs gone, -01 present
for u in ("wch14", "wch15", "wch16"):
    if any(f"/{u}/past-papers/2020-10/{u.upper()}-1/" in p for p in final_files):
        errors.append(f"{u}-1 leftover")
    if not any(f"/{u}/past-papers/2020-10/{u.upper()}-01/manifest.yaml" in p for p in final_files):
        errors.append(f"{u}-01 manifest missing")

# 6. 4EC1-021 only at 2021-11
if any("2019-06/4EC1-021" in p for p in final_files):
    errors.append("4EC1-021 still in 2019-06")
if not any("2021-11/4EC1-021/qp.pdf" in p for p in final_files):
    errors.append("4EC1-021 qp missing at 2021-11")

# 7. promoted targets exist
for t in ["gce-a-level/mathematics/mathematics-modular/past-papers/2018-06/6678-01/qp.pdf",
          "gce-a-level/mathematics/mathematics-modular/past-papers/2018-06/6684-01/qp.pdf",
          "international-a-level/mathematics/wma01/specimen/WME02-01/qp.pdf",
          "international-a-level/mathematics/wma01/specimen/WME02-01/ms.pdf",
          "international-gcse/mathematics-b/4mb1/specimen/4MB1-01/ms.pdf",
          "international-gcse/mathematics-b/4mb1/specimen/4MB1-02/qp.pdf",
          "international-gcse/mathematics-b/4mb1/specimen/4MB1-02/ms.pdf"]:
    if not any(t in p for p in final_files):
        errors.append(f"promotion target missing: {t}")

# 8. quarantined promoted sources gone
for p in final_files:
    if p.startswith("_quarantine/") and (("Maths B__Paper 2__Specimen QP_2.pdf" in p) or ("Maths B__Paper 1__Specimen MS_2.pdf" in p) or ("Maths B__Paper 2__Specimen MS_2.pdf" in p) or ("M2__June 2018 QP_5" in p) or ("S2__June 2018 QP_5" in p) or ("M2__Specimen QP_3" in p) or ("M2__Specimen MS_3" in p)):
        errors.append(f"promoted source still in quarantine: {p}")

# stats
sets = sum(1 for v in final.items() if v[1] is not None)
adds = sum(1 for p, v in final.items() if v is not None and p not in SHA_BY_PATH)
dels = sum(1 for p, v in final.items() if v is None and p in SHA_BY_PATH)
print(f"\nfinal tree: {sets} blobs (adds={adds}, dels={dels})")
print(f"errors: {len(errors)}")
for e in errors[:20]:
    print("  ", e)
if not errors:
    print("\nALL INVARIANTS PASS")
json.dump({p: s for p, s in final.items()}, open(f"{UP}/final_tree_state.json", "w"), indent=0)
