#!/usr/bin/env python3
"""Changeset part 2: quarantine promotions (blob reuse), quarantine reclassifications,
manifest generation for new/changed dirs, ledger row updates, repair document."""
import hashlib, json, os, urllib.request
import yaml

UP = "/home/z/my-project/upload"
STAGING = f"{UP}/staging"
NEWBLOBS = f"{UP}/new_blobs"
os.makedirs(NEWBLOBS, exist_ok=True)

d1 = json.load(open(f"{UP}/changeset_part1.json"))
OPS = d1["ops"]

def git_blob(path):
    data = open(path, "rb").read()
    h = hashlib.sha1(); h.update(b"blob %d\0" % len(data)); h.update(data)
    return h.hexdigest()

SHA_BY_PATH = {}
for line in open(f"{UP}/pp_ls_tree.txt"):
    meta, p = line.rstrip("\n").split("\t", 1)
    SHA_BY_PATH[p] = meta.split()[2]

def op_set(path, sha, why):
    OPS[path] = {"sha": sha, "why": why, "src": None}
def op_del(path, why):
    OPS[path] = {"sha": None, "why": why, "src": None}
def op_from_tree(src_path, dst_path, why):
    op_set(dst_path, SHA_BY_PATH[src_path], why, "tree")
    op_del(src_path, why + " [moved]")

REPAIR_TAG = "PP-FIX-2026-09-26"

# ============================================================
# 7. Quarantine promotions (blob reuse — no re-upload)
# ============================================================
PROMOTE = [
    # (quarantine filename, live target, why)
    ("unresolved-identity/IAL__Edexcel__Pure Maths__M2__June 2018 QP_5.pdf",
     "past-papers/pearson-edexcel/gce-a-level/mathematics/mathematics-modular/past-papers/2018-06/6678-01/qp.pdf",
     "identity resolved: prints 6678/01 June 2018 (GCE M2); fills ledger-planned gap"),
    ("unresolved-identity/IAL__Edexcel__Pure Maths__S2__June 2018 QP_5.pdf",
     "past-papers/pearson-edexcel/gce-a-level/mathematics/mathematics-modular/past-papers/2018-06/6684-01/qp.pdf",
     "identity resolved: prints 6684/01 June 2018 (GCE S2); fills ledger-planned gap"),
    ("unresolved-identity/IAL__Edexcel__Pure Maths__M2__Specimen QP_3.pdf",
     "past-papers/pearson-edexcel/international-a-level/mathematics/wma01/specimen/WME02-01/qp.pdf",
     "identity resolved: prints WME02/01, specimen paper; new specimen dir"),
    ("unresolved-identity/IAL__Edexcel__Pure Maths__M2__Specimen MS_3.pdf",
     "past-papers/pearson-edexcel/international-a-level/mathematics/wma01/specimen/WME02-01/ms.pdf",
     "identity resolved: WME02/01 specimen mark scheme; new specimen dir"),
    ("unresolved-identity/IGCSE__Edexcel__Maths B__Paper 1__Specimen MS_2.pdf",
     "past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/specimen/4MB1-01/ms.pdf",
     "identity resolved: 4MB1 Paper 1 SAM MS; fills missing MS in existing specimen dir"),
    ("duplicate-artifact/IGCSE__Edexcel__Maths B__Paper 2__Specimen QP_2.pdf",
     "past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/specimen/4MB1-02/qp.pdf",
     "identity corrected: prints 4MB1/02 Paper 2 SAM (resolver had bucketed SAMs into the 01 slot); new specimen dir"),
    ("unresolved-identity/IGCSE__Edexcel__Maths B__Paper 2__Specimen MS_2.pdf",
     "past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/specimen/4MB1-02/ms.pdf",
     "identity resolved: 4MB1 Paper 2 SAM MS; new specimen dir"),
]
promoted_from = []
for qf, target, why in PROMOTE:
    op_set(target, SHA_BY_PATH[f"_quarantine/{qf}"], why + f" (promoted from _quarantine/{qf})")
    op_del(f"_quarantine/{qf}", "consumed by promotion to " + target)
    # consume the REASON sidecar too (it lives next to the pdf with .REASON.txt before .pdf)
    rside = f"_quarantine/{qf[:-4]}.REASON.txt"
    if rside in SHA_BY_PATH:
        op_del(rside, "sidecar consumed with promotion")
    promoted_from.append({"from": qf, "to": target})

# ============================================================
# 8. Quarantine reclassifications (moves within _quarantine, bytes unchanged)
# ============================================================
RECLASS_DUP = []
for y in (2014, 2015, 2016, 2017, 2018):
    RECLASS_DUP += [f"unresolved-identity/IAL__Edexcel__Pure Maths__M2__June {y} QP_3.pdf",
                    f"unresolved-identity/IAL__Edexcel__Pure Maths__S2__June {y} QP_3.pdf"]
RECLASS_DUP.append("unresolved-identity/IAL__Edexcel__Pure Maths__M2__January 2014 (IAL) MS.pdf")
for y in (2016, 2017):
    RECLASS_DUP += [f"unresolved-identity/IAL__Edexcel__Pure Maths__M2__June {y} QP_5.pdf",
                    f"unresolved-identity/IAL__Edexcel__Pure Maths__S2__June {y} QP_5.pdf"]
for qf in RECLASS_DUP:
    base = qf.split("/", 1)[1]
    newp = f"_quarantine/duplicate-artifact/{base}"
    op_set(newp, SHA_BY_PATH[f"_quarantine/{qf}"],
           "reclassified: deep text extraction resolved identity; byte-identical (sha256) to the live corpus copy verified this sweep")
    op_del(f"_quarantine/{qf}", "reclassified to duplicate-artifact")
    rside = f"_quarantine/{qf[:-4]}.REASON.txt"
    if rside in SHA_BY_PATH:
        op_del(rside, "sidecar reclassified")

RECLASS_GCE = [f"unresolved-identity/wch03--{s}--WCH03-01--{m}.pdf"
               for s in ("2009-06", "2010-01", "2010-06", "2011-01", "2011-06", "2012-01", "2012-06", "2013-01", "2013-06")
               for m in ("qp", "ms")] + [
               "unresolved-identity/wch01--2009-06--WCH01-01--ms.pdf"]
for qf in RECLASS_GCE:
    if f"_quarantine/{qf}" not in SHA_BY_PATH:
        continue
    base = qf.split("/", 1)[1]
    newp = f"_quarantine/out-of-scope-gce/{base}"
    op_set(newp, SHA_BY_PATH[f"_quarantine/{qf}"],
           "reclassified: covers print UK GCE chemistry branding (8CH01/6CH03 era, Summer 2009-2013); corpus scope carries WCH01-06 (2014+) only")
    op_del(f"_quarantine/{qf}", "reclassified to out-of-scope-gce")
    rside = f"_quarantine/{qf[:-4]}.REASON.txt"
    if rside in SHA_BY_PATH:
        op_del(rside, "sidecar reclassified")

json.dump({"promoted_from": promoted_from, "reclassified_dup": RECLASS_DUP,
           "reclassified_gce": RECLASS_GCE}, open(f"{UP}/changeset_part2.json", "w"), indent=1)

# merge part1+part2 ops for counting
json.dump(OPS, open(f"{UP}/changeset_ops.json", "w"), indent=1)
print(f"total ops now: {len(OPS)}")
print(f"promotions: {len(promoted_from)}, reclassified dup: {len(RECLASS_DUP)}, reclassified gce: {len(RECLASS_GCE)}")
