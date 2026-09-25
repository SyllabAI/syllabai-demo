#!/usr/bin/env python3
"""Build the definitive fix map: for each 4PH0/4PH1 P-dir flag, decide
disposition of the displaced R bytes (existing PR dir? create dir?)."""
import json

inv = json.load(open("/home/z/my-project/upload/pp_inventory.json"))
pd = inv["paper_dirs"]
recs = [json.loads(l) for l in open("/home/z/my-project/upload/pp_content_report.jsonl")]
flags = [r for r in recs if r["class"].startswith("MISPLACED")]

def has_dir(spec_sub, session, dir_name):
    return f"past-papers/pearson-edexcel/{spec_sub}/past-papers/{session}/{dir_name}" in pd

print("=== 4PH1 displaced-R disposition ===")
for r in sorted(flags, key=lambda x: x["path"]):
    p = r["path"]
    if "/4ph1/" not in p or "2020-06" in p:
        continue
    parts = p.split("/")
    session, dirn, mat = parts[-3], parts[-2], parts[-1]
    # dir 4PH1-1P -> R sibling 4PH1-1PR
    rdir = dirn.replace("-1P", "-1PR").replace("-2P", "-2PR")
    rdir_exists = has_dir("international-gcse/physics/4ph1", session, rdir)
    if rdir_exists:
        rdir_files = sorted(set(pd[f"past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/{session}/{rdir}"]["files"]) - {"manifest.yaml"})
    else:
        rdir_files = []
    print(f"{session}/{dirn}/{mat} -> R dir {rdir} exists={rdir_exists} files={rdir_files}")

print("\n=== 4PH0 displaced-R disposition (no PR dirs corpus-wide for 4ph0) ===")
for r in sorted(flags, key=lambda x: x["path"]):
    p = r["path"]
    if "/4ph0/" not in p or "2012-01" in p:
        continue
    parts = p.split("/")
    session, dirn, mat = parts[-3], parts[-2], parts[-1]
    print(f"{session}/{dirn}/{mat}")

print("\n=== 4PH1 2020-06 phantom contents ===")
for dp, i in sorted(pd.items()):
    if "/4ph1/" in dp and i["session"] == "2020-06":
        print(dp.split("/")[-2:], sorted(set(i["files"]) - {"manifest.yaml"}))

print("\n=== 2020-11 current contents ===")
for dp, i in sorted(pd.items()):
    if "/4ph1/" in dp and i["session"] == "2020-11":
        print(dp.split("/")[-2:], sorted(set(i["files"]) - {"manifest.yaml"}))
