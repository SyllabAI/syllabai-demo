#!/usr/bin/env python3
"""Master changeset builder — PP-FIX-2026-09-26.
Produces: upload/changeset.json (tree ops + metadata), upload/new_blobs/ (bytes to upload),
repair doc, updated ledger rows. Every op carries evidence."""
import hashlib, json, os, re, shutil, urllib.request
import yaml

UP = "/home/z/my-project/upload"
STAGING = f"{UP}/staging"
NEWBLOBS = f"{UP}/new_blobs"
os.makedirs(NEWBLOBS, exist_ok=True)

inv = json.load(open(f"{UP}/pp_inventory.json"))
pd = inv["paper_dirs"]


def sha_of(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git_blob(path):
    """git blob sha (sha1 of 'blob <len>\\0' + bytes)."""
    data = open(path, "rb").read()
    h = hashlib.sha1()
    h.update(b"blob %d\0" % len(data))
    h.update(data)
    return h.hexdigest()


# tree ops: path -> {"sha": <blob sha|None>, "why": str, "src": "staged"|"tree"|None}
OPS = {}
def op_set(path, sha, why, src=None):
    OPS[path] = {"sha": sha, "why": why, "src": src}
def op_del(path, why):
    OPS[path] = {"sha": None, "why": why, "src": None}
def op_from_tree(src_path, dst_path, why):
    """move existing blob to a new path (bytes unchanged)"""
    import re as _re
    # find sha from ls-tree text
    sha = SHA_BY_PATH.get(src_path)
    if not sha:
        raise SystemExit(f"src not in tree: {src_path}")
    op_set(dst_path, sha, why, "tree")
    op_del(src_path, why + " [moved]")

SHA_BY_PATH = {}
for line in open(f"{UP}/pp_ls_tree.txt"):
    meta, p = line.rstrip("\n").split("\t", 1)
    SHA_BY_PATH[p] = meta.split()[2]

def staged_blob(target):
    return git_blob(os.path.join(STAGING, target))

def quarantine_blob(fname):
    return SHA_BY_PATH[f"_quarantine/{fname}"]

manifest_patches = {}  # dirpath -> dict of fields to set + repair block

REPAIR_TAG = "PP-FIX-2026-09-26"

# ============================================================
# 1. 4PH1 base QP replacements (staged, verified)
# ============================================================
PH1 = [
    ("2019-06",), ("2020-01",), ("2021-01",), ("2022-01",), ("2023-01",),
    ("2022-06",), ("2023-06",), ("2024-06",),
]
for (sess,) in [(s,) for s in ["2019-06","2020-01","2021-01","2022-01","2023-01","2022-06","2023-06","2024-06"]]:
    for paper in ("1P", "2P"):
        target = f"past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/{sess}/4PH1-{paper}/qp.pdf"
        sha = staged_blob(target)
        op_set(target, sha, f"replace regional-variant QP bytes (printed 4PH1/{paper}R) with verified base QP (printed 4PH1/{paper}); PMT base file, print-verified")
        # displaced bytes -> quarantine duplicate-artifact
        old_sha = SHA_BY_PATH[target]
        qname = f"{REPAIR_TAG}__4PH1-{paper}__{sess}__qp (regional-variant bytes displaced by base repair).pdf"
        op_set(f"_quarantine/duplicate-artifact/{qname}", old_sha, "displaced R-generation scan preserved in quarantine")
        manifest_patches.setdefault(target.rsplit("/", 1)[0], {})["qp"] = {
            "sha256": None, "note": "replaced with genuine base QP (PMT, print-verified)", "repair": REPAIR_TAG}

# ============================================================
# 2. 4PH0 base QPs/MS (staged) + create 4PH0-1PR/2PR dirs
# ============================================================
for yr in (2014, 2015, 2016, 2017, 2018):
    for paper in ("1P", "2P"):
        target = f"past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/{yr}-06/4PH0-{paper}/qp.pdf"
        sha = staged_blob(target)
        op_set(target, sha, f"replace regional-variant QP (printed 4PH0/{paper}R) with verified base QP (printed 4PH0/{paper}); PMT legacy file, print-verified")
        old_sha = SHA_BY_PATH[target]
        rdir = f"past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/{yr}-06/4PH0-{paper}R"
        op_set(f"{rdir}/qp.pdf", old_sha, "regional-variant bytes preserved in new R dir (4CH0-repair precedent)")
        manifest_patches.setdefault(rdir, {"new_dir": True, "session": f"{yr}-06", "spec": "4ph0",
                                           "dir": f"4PH0-{paper}R", "materials": {}})
# 2014-06 2P MS
target = "past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/2014-06/4PH0-2P/ms.pdf"
op_set(target, staged_blob(target), "replace R-generation MS with base MS (prints 4PH0, Paper 2P, June 2014)")
old_sha = SHA_BY_PATH[target]
rdir = "past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/2014-06/4PH0-2PR"
op_set(f"{rdir}/ms.pdf", old_sha, "R-generation MS preserved in R dir")

# ============================================================
# 3. Physics 2020-06 phantom merge (P-code verified)
# ============================================================
ph1_2020 = {
    "4PH1-1P": {"qp": "dup", "ms": "dup"},   # qp = PR bytes dup of 1PR; ms near-dup of 2020-11 1P ms
    "4PH1-1PR": {"qp": "move", "ms": "dup"}, # qp -> 2020-11/1PR/qp (missing)
    "4PH1-2P": {"qp": "dup", "ms": "dup"},
    "4PH1-2PR": {"qp": "move", "ms": "dup"},
}
for dirn, mats in ph1_2020.items():
    jun = f"past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2020-06/{dirn}"
    adm = f"past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2020-11/{dirn}"
    for mat, disp in mats.items():
        matf = mat + ".pdf"
        if disp == "move":
            op_from_tree(f"{jun}/{matf}", f"{adm}/{matf}",
                         "November-2020 sitting administered the June-printed paper (P-codes P65065A/66A verified); fill missing administered-session QP")
        else:
            qname = f"{REPAIR_TAG}__4PH1-{dirn}__2020-06__{matf} (phantom-session duplicate of 2020-11 copy).pdf"
            op_set(f"_quarantine/duplicate-artifact/{qname}", SHA_BY_PATH[f"{jun}/{matf}"],
                   "2020-06 phantom-session copy; 2020-11 holds the administered-sitting generation")
    op_del(f"{jun}/manifest.yaml", "2020-06 phantom session removed (4CH1-repair precedent, P-code verified)")

# ============================================================
# 4. Other phantom 2020-06 merges (QP P-codes verified SAME; MS ratio 0.998)
# ============================================================
PHANTOM = []
# IGCSE
for spec_sub, dirs in {
    "international-gcse/mathematics-a/4ma1": ["4MA1-1F", "4MA1-1FR", "4MA1-1H", "4MA1-1HR", "4MA1-2F", "4MA1-2FR", "4MA1-2H", "4MA1-2HR"],
    "international-gcse/mathematics-b/4mb1": ["4MB1-01", "4MB1-01R", "4MB1-02", "4MB1-02R"],
    "international-gcse/further-pure-mathematics/4pm1": ["4PM1-01", "4PM1-01R", "4PM1-02", "4PM1-02R"],
}.items():
    for dirn in dirs:
        PHANTOM.append((spec_sub, dirn, "2020-11"))
# IAL (administered October 2020)
for spec_sub, dirn in [
    ("international-a-level/chemistry/wch11", "WCH11-01"),
    ("international-a-level/chemistry/wch12", "WCH12-01"),
    ("international-a-level/chemistry/wch13", "WCH13-01"),
    ("international-a-level/physics/wph11", "WPH11-01"),
    ("international-a-level/physics/wph12", "WPH12-01"),
    ("international-a-level/physics/wph13", "WPH13-01"),
    ("international-a-level/physics/wph14", "WPH14-01"),
] + [("international-a-level/mathematics/mathematics-2018", d) for d in
     ["WMA11-01", "WMA12-01", "WMA13-01", "WMA14-01", "WME01-01", "WME02-01", "WST01-01", "WST02-01"]]:
    PHANTOM.append((spec_sub, dirn, "2020-10"))

for spec_sub, dirn, admin_sess in PHANTOM:
    jun = f"past-papers/pearson-edexcel/{spec_sub}/past-papers/2020-06/{dirn}"
    adm = f"past-papers/pearson-edexcel/{spec_sub}/past-papers/{admin_sess}/{dirn}"
    jun_files = set(pd[jun]["files"]) - {"manifest.yaml"}
    for mat in sorted(jun_files):
        if mat in pd.get(adm, {}).get("files", {}):
            qname = f"{REPAIR_TAG}__{dirn}__2020-06__{mat} (phantom-session duplicate of {admin_sess} copy).pdf"
            op_set(f"_quarantine/duplicate-artifact/{qname}", SHA_BY_PATH[f"{jun}/{mat}"],
                   f"2020-06 phantom-session copy; {admin_sess} holds the administered-sitting generation (QP P-code verified; MS text-ratio 0.998)")
        else:
            # fill the administered session's gap (e.g. 2020-10 IAL ms missing)
            op_from_tree(f"{jun}/{mat}", f"{adm}/{mat}",
                         f"fill missing {admin_sess} material from the phantom 2020-06 dir (same sitting, June-printed papers)")
    op_del(f"{jun}/manifest.yaml", "2020-06 phantom session removed (P-code verified against administered sitting)")
    # any files intentionally left (none expected here) would keep dir; manifests deleted only when files all disposed

# 4cp0-01 + 4eb1: mixed dispositions
jun = "past-papers/pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2020-06/4CP0-01"
op_set(f"_quarantine/duplicate-artifact/{REPAIR_TAG}__4CP0-01__2020-06__qp (phantom-session duplicate of 2020-11 copy).pdf",
       SHA_BY_PATH[f"{jun}/qp.pdf"], "QP P61884R verified identical sitting as 2020-11; MS retained (different document generation)")
# jun dir keeps ms.pdf + manifest

# ============================================================
# 5. WCH14/15/16-1 -> -01 renames (2020-10)
# ============================================================
for u in ("wch14", "wch15", "wch16"):
    for mat in ("qp.pdf", "ms.pdf"):
        src = f"past-papers/pearson-edexcel/international-a-level/chemistry/{u}/past-papers/2020-10/{u.upper()}-1/{mat}"
        dst = src.replace("-1/", "-01/")
        op_from_tree(src, dst, "canonical dir naming; printed reference WCHxx/01 (single-digit suffix is corpus-unique)")
    op_del(f"past-papers/pearson-edexcel/international-a-level/chemistry/{u}/past-papers/2020-10/{u.upper()}-1/manifest.yaml",
           "renamed to -01; manifest re-created at canonical name")

# ============================================================
# 6. 4EC1-021 move: 2019-06 -> 2021-11 (Nov-2021 sitting)
# ============================================================
op_from_tree("past-papers/pearson-edexcel/international-gcse/economics/4ec1/past-papers/2019-06/4EC1-021/qp.pdf",
             "past-papers/pearson-edexcel/international-gcse/economics/4ec1/past-papers/2021-11/4EC1-021/qp.pdf",
             "November-2021 sitting paper (P65899RA, source filename 2021_Nov_P2) misplaced in June-2019 session")
op_del("past-papers/pearson-edexcel/international-gcse/economics/4ec1/past-papers/2019-06/4EC1-021/manifest.yaml",
       "dir dissolved; contents moved to 2021-11/4EC1-021")

json.dump({"ops": OPS, "manifest_patches_dirs": sorted(manifest_patches)},
          open(f"{UP}/changeset_part1.json", "w"), indent=1)
print(f"part 1 ops: {len(OPS)}")
print("manifest dirs needing patch/create:", len(manifest_patches))
