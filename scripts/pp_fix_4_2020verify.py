#!/usr/bin/env python3
"""P-code verification for every Edexcel 2020-06 dir vs its administered-session
counterpart (2020-11 IGCSE / 2020-10 IAL). Output: upload/pp_2020_merge_map.json"""
import json, os, re, urllib.request, urllib.parse
import fitz

RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/"
UA = {"User-Agent": "SyllabAI-corpus-audit/1.0"}
TMP = "/home/z/my-project/upload/inspect/pc"
os.makedirs(TMP, exist_ok=True)
RE_P = re.compile(r"\*?(P[0-9]{5}[A-Z]{0,2})\*?")
inv = json.load(open("/home/z/my-project/upload/pp_inventory.json"))
pd = inv["paper_dirs"]

june_dirs = sorted(dp for dp, i in pd.items()
                   if i["session"] == "2020-06" and i["board"] == "pearson-edexcel")

def fetch(p):
    dest = os.path.join(TMP, p.replace("/", "_"))
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    req = urllib.request.Request(RAW + urllib.parse.quote(p), headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
            f.write(r.read())
        return dest
    except Exception:
        return None

def pcodes(p):
    d = fetch(p)
    if not d:
        return None
    try:
        doc = fitz.open(d)
        t = "".join(doc[i].get_text() for i in range(min(3, doc.page_count)))
        doc.close()
        return sorted(set(RE_P.findall(t)))
    except Exception:
        return []

map_out = []
for dp in june_dirs:
    i = pd[dp]
    spec = "/".join(dp.split("/")[1:5])
    qual = i["qual"]
    admin_session = "2020-11" if qual == "international-gcse" else "2020-10"
    admin_dp = dp.replace("/2020-06/", f"/{admin_session}/")
    rec = {"jun_dir": dp, "admin_dir": admin_dp, "admin_exists": admin_dp in pd, "pairs": []}
    for mat in ("qp.pdf", "ms.pdf"):
        if mat not in i["files"]:
            continue
        jp = dp + "/" + mat
        jpc = pcodes(jp)
        apc = pcodes(admin_dp + "/" + mat) if admin_dp in pd and mat in pd[admin_dp]["files"] else "ABSENT"
        same = bool(jpc and apc and set(jpc) & set(apc)) if isinstance(apc, list) else False
        rec["pairs"].append({"mat": mat, "jun_p": jpc, "admin_p": apc,
                             "same": same, "admin_has": apc != "ABSENT"})
    map_out.append(rec)
    s = " ".join(f"{p['mat'][:2]}:{'SAME' if p['same'] else ('DIFF' if p['admin_has'] else 'no-admin')}" for p in rec["pairs"])
    print(f"{dp.split('/',3)[-1]:70s} admin_exists={rec['admin_exists']} | {s}", flush=True)

json.dump(map_out, open("/home/z/my-project/upload/pp_2020_merge_map.json", "w"), indent=1)
print("wrote merge map")
