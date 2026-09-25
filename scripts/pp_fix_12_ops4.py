#!/usr/bin/env python3
"""Part 3b: add missing op_del for every quarantined/moved-away jun file."""
import json

UP = "/home/z/my-project/upload"
OPS = json.load(open(f"{UP}/changeset_ops.json"))
TAG = "PP-FIX-2026-09-26"

def op_del(path, why="phantom-session copy quarantined; source removed"):
    OPS.setdefault(path, {"sha": None, "why": why, "src": None})

# physics 2020-06: files whose bytes were quarantined (moves already delete via op_from_tree)
for dirn in ("4PH1-1P", "4PH1-1PR", "4PH1-2P", "4PH1-2PR"):
    for mat in ("qp.pdf", "ms.pdf"):
        p = f"past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2020-06/{dirn}/{mat}"
        qname = f"{TAG}__4PH1-{dirn}__2020-06__{mat} (phantom-session duplicate of 2020-11 copy).pdf"
        if f"_quarantine/duplicate-artifact/{qname}" in OPS:
            op_del(p, "phantom copy quarantined (duplicate of 2020-11 generation)")

# PHANTOM loop dirs (IGCSE + IAL): delete every jun file whose bytes were quarantined
PHANTOM = []
for spec_sub, dirs in {
    "international-gcse/mathematics-a/4ma1": ["4MA1-1F", "4MA1-1FR", "4MA1-1H", "4MA1-1HR", "4MA1-2F", "4MA1-2FR", "4MA1-2H", "4MA1-2HR"],
    "international-gcse/mathematics-b/4mb1": ["4MB1-01", "4MB1-01R", "4MB1-02", "4MB1-02R"],
    "international-gcse/further-pure-mathematics/4pm1": ["4PM1-01", "4PM1-01R", "4PM1-02", "4PM1-02R"],
}.items():
    for dirn in dirs:
        PHANTOM.append((spec_sub, dirn, "2020-11"))
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
    jun_base = f"past-papers/pearson-edexcel/{spec_sub}/past-papers/2020-06/{dirn}"
    adm_base = f"past-papers/pearson-edexcel/{spec_sub}/past-papers/{admin_sess}/{dirn}"
    for mat in ("qp.pdf", "ms.pdf"):
        jun = f"{jun_base}/{mat}"
        if jun in OPS:  # already moved (op_from_tree records a del) or deleted
            continue
        # if admin has the material, the jun copy was quarantined -> delete source
        qkey = f"{TAG}__{dirn}__2020-06__{mat}"
        found = any(qkey in k for k in OPS)
        if found:
            op_del(jun, f"phantom copy quarantined ({admin_sess} holds the administered-sitting generation)")

# 4CP0-01: jun qp was quarantined in part 1 without del
op_del("past-papers/pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2020-06/4CP0-01/qp.pdf",
       "phantom copy quarantined (P61884R = 2020-11 sitting)")

json.dump(OPS, open(f"{UP}/changeset_ops.json", "w"), indent=1)
sets = sum(1 for v in OPS.values() if v["sha"] is not None)
print(f"ops now: {len(OPS)} (set={sets}, del={len(OPS)-sets})")
