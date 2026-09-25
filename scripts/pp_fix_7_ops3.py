#!/usr/bin/env python3
"""Changeset part 3: IAL/4EB1 fills, wch14-16 jun quarantines, 4cp0 jun quarantines."""
import json

UP = "/home/z/my-project/upload"
OPS = json.load(open(f"{UP}/changeset_ops.json"))
SHA_BY_PATH = {}
for line in open(f"{UP}/pp_ls_tree.txt"):
    meta, p = line.rstrip("\n").split("\t", 1)
    SHA_BY_PATH[p] = meta.split()[2]

def op_set(path, sha, why, src=None):
    OPS[path] = {"sha": sha, "why": why, "src": src}
def op_del(path, why):
    OPS[path] = {"sha": None, "why": why, "src": None}
def op_from_tree(src, dst, why):
    op_set(dst, SHA_BY_PATH[src], why, "tree")
    op_del(src, why + " [moved]")

TAG = "PP-FIX-2026-09-26"
COVID_WHY = ("November-2020/October-2020 COVID sitting administered the June-printed papers "
             "(audit-doc s.9 rule; QP P-code verified this sweep); fill administered-session gap "
             "from the phantom 2020-06 dir")

# --- IAL fills: jun qp -> 2020-10/qp ---
FILLS = [
    ("international-a-level/accounting/wac11", "WAC11-01"),
    ("international-a-level/accounting/wac12", "WAC12-01"),
    ("international-a-level/economics/wec11", "WEC11-01"),
    ("international-a-level/economics/wec12", "WEC12-01"),
    ("international-a-level/economics/wec13", "WEC13-01"),
    ("international-a-level/economics/wec14", "WEC14-01"),
    ("international-a-level/mathematics/mathematics-2018", "WFM01-01"),
    ("international-a-level/mathematics/mathematics-2018", "WFM02-01"),
    ("international-a-level/mathematics/mathematics-2018", "WFM03-01"),
    ("international-a-level/mathematics/mathematics-2018", "WST03-01"),
]
for spec, dirn in FILLS:
    jun = f"past-papers/pearson-edexcel/{spec}/past-papers/2020-06/{dirn}/qp.pdf"
    adm = f"past-papers/pearson-edexcel/{spec}/past-papers/2020-10/{dirn}/qp.pdf"
    op_from_tree(jun, adm, COVID_WHY)
    op_del(f"past-papers/pearson-edexcel/{spec}/past-papers/2020-06/{dirn}/manifest.yaml",
           "2020-06 phantom dir dissolved; QP moved to administered 2020-10 session")

# --- 4EB1 fills ---
op_from_tree("past-papers/pearson-edexcel/international-gcse/english-language-b/4eb1/past-papers/2020-06/4EB1-01/ms.pdf",
             "past-papers/pearson-edexcel/international-gcse/english-language-b/4eb1/past-papers/2020-11/4EB1-01/ms.pdf",
             COVID_WHY + " (QP P-code pair verified SAME)")
op_del("past-papers/pearson-edexcel/international-gcse/english-language-b/4eb1/past-papers/2020-06/4EB1-01/manifest.yaml",
       "2020-06 phantom dir dissolved")
op_from_tree("past-papers/pearson-edexcel/international-gcse/english-language-b/4eb1/past-papers/2020-06/4EB1-01R/qp.pdf",
             "past-papers/pearson-edexcel/international-gcse/english-language-b/4eb1/past-papers/2020-11/4EB1-01R/qp.pdf",
             COVID_WHY)
op_del("past-papers/pearson-edexcel/international-gcse/english-language-b/4eb1/past-papers/2020-06/4EB1-01R/manifest.yaml",
       "2020-06 phantom dir dissolved")

# --- wch14/15/16 jun qps -> quarantine (admin WCHxx-1 dirs hold same P-codes P64620-22A) ---
for u in ("wch14", "wch15", "wch16"):
    jun = f"past-papers/pearson-edexcel/international-a-level/chemistry/{u}/past-papers/2020-06/{u.upper()}-01/qp.pdf"
    op_set(f"_quarantine/duplicate-artifact/{TAG}__{u.upper()}-01__2020-06__qp (phantom-session duplicate of 2020-10 copy).pdf",
           SHA_BY_PATH[jun], "October-2020 IAL sitting administered the June-printed paper (P6462xA verified)")
    op_del(jun, "phantom copy quarantined")
    op_del(f"past-papers/pearson-edexcel/international-a-level/chemistry/{u}/past-papers/2020-06/{u.upper()}-01/manifest.yaml",
           "2020-06 phantom dir dissolved")

# --- 4cp0 jun quarantines ---
op_set(f"_quarantine/duplicate-artifact/{TAG}__4CP0-02__2020-06__qp (phantom-session duplicate of 2020-11 4CP0-2A copy).pdf",
       SHA_BY_PATH["past-papers/pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2020-06/4CP0-02/qp.pdf"],
       "P61885A identical to 2020-11/4CP0-2A QP (P-code verified)")
op_del("past-papers/pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2020-06/4CP0-02/qp.pdf", "phantom copy quarantined")
op_del("past-papers/pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2020-06/4CP0-02/manifest.yaml", "dir now empty (qp only held)")
op_set(f"_quarantine/duplicate-artifact/{TAG}__4CP0-01__2020-06__ms (phantom-session near-duplicate, ratio 0.998).pdf",
       SHA_BY_PATH["past-papers/pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2020-06/4CP0-01/ms.pdf"],
       "near-duplicate of 2020-11/4CP0-01 MS (text ratio 0.998)")
op_del("past-papers/pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2020-06/4CP0-01/ms.pdf", "phantom copy quarantined")
op_del("past-papers/pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2020-06/4CP0-01/manifest.yaml", "dir now empty (ms only held)")

json.dump(OPS, open(f"{UP}/changeset_ops.json", "w"), indent=1)
sets = sum(1 for v in OPS.values() if v["sha"])
dels = len(OPS) - sets
print(f"total ops: {len(OPS)} (set={sets}, del={dels})")
