#!/usr/bin/env python3
"""Byte-compare resolvable quarantine PDFs against live corpus counterparts
to classify: duplicate / replacement-needed / gap-fill."""
import hashlib, json, urllib.request, urllib.parse

RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/"
UA = {"User-Agent": "SyllabAI-corpus-audit/1.0"}
QD = "/home/z/my-project/upload/quarantine_dl/"

def sha(b): return hashlib.sha256(b).hexdigest()

def fetch(p):
    req = urllib.request.Request(RAW + urllib.parse.quote(p), headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except Exception:
        return None

# candidate map: quarantine file -> candidate live paths
CAND = {
 "unresolved-identity__IAL__Edexcel__Pure Maths__M2__June 2014 QP_3.pdf":
   ["past-papers/pearson-edexcel/international-a-level/mathematics/wma01/past-papers/2014-06/WME02-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__M2__June 2015 QP_3.pdf":
   ["past-papers/pearson-edexcel/international-a-level/mathematics/wma01/past-papers/2015-06/WME02-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__M2__June 2016 QP_3.pdf":
   ["past-papers/pearson-edexcel/international-a-level/mathematics/wma01/past-papers/2016-06/WME02-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__M2__June 2017 QP_3.pdf":
   ["past-papers/pearson-edexcel/international-a-level/mathematics/wma01/past-papers/2017-06/WME02-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__M2__June 2018 QP_3.pdf":
   ["past-papers/pearson-edexcel/international-a-level/mathematics/wma01/past-papers/2018-06/WME02-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__M2__Specimen QP_3.pdf":
   ["past-papers/pearson-edexcel/international-a-level/mathematics/wma01/specimen/WME02-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__M2__Specimen MS_3.pdf":
   ["past-papers/pearson-edexcel/international-a-level/mathematics/wma01/specimen/WME02-01/ms.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__S2__June 2014 QP_3.pdf":
   ["past-papers/pearson-edexcel/international-a-level/mathematics/wma01/past-papers/2014-06/WST02-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__S2__June 2015 QP_3.pdf":
   ["past-papers/pearson-edexcel/international-a-level/mathematics/wma01/past-papers/2015-06/WST02-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__S2__June 2016 QP_3.pdf":
   ["past-papers/pearson-edexcel/international-a-level/mathematics/wma01/past-papers/2016-06/WST02-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__S2__June 2017 QP_3.pdf":
   ["past-papers/pearson-edexcel/international-a-level/mathematics/wma01/past-papers/2017-06/WST02-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__S2__June 2018 QP_3.pdf":
   ["past-papers/pearson-edexcel/international-a-level/mathematics/wma01/past-papers/2018-06/WST02-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__M2__June 2016 QP_5.pdf":
   ["past-papers/pearson-edexcel/gce-a-level/mathematics/mathematics-modular/past-papers/2016-06/6678-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__M2__June 2017 QP_5.pdf":
   ["past-papers/pearson-edexcel/gce-a-level/mathematics/mathematics-modular/past-papers/2017-06/6678-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__M2__June 2018 QP_5.pdf":
   ["past-papers/pearson-edexcel/gce-a-level/mathematics/mathematics-modular/past-papers/2018-06/6678-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__S2__June 2016 QP_5.pdf":
   ["past-papers/pearson-edexcel/gce-a-level/mathematics/mathematics-modular/past-papers/2016-06/6684-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__S2__June 2017 QP_5.pdf":
   ["past-papers/pearson-edexcel/gce-a-level/mathematics/mathematics-modular/past-papers/2017-06/6684-01/qp.pdf"],
 "unresolved-identity__IAL__Edexcel__Pure Maths__S2__June 2018 QP_5.pdf":
   ["past-papers/pearson-edexcel/gce-a-level/mathematics/mathematics-modular/past-papers/2018-06/6684-01/qp.pdf"],
 "unresolved-identity__IGCSE__Edexcel__Maths B__Paper 1__Specimen MS_2.pdf":
   ["past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb0/past-papers/2016-06/4MB0-01/ms.pdf"],
 "unresolved-identity__IGCSE__Edexcel__Maths B__Paper 2__Specimen MS_2.pdf":
   ["past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb0/past-papers/2016-06/4MB0-02/ms.pdf"],
}

qa = json.load(open("/home/z/my-project/upload/pp_quarantine_analysis.json"))
qsha = {r["file"]: r["sha256"] for r in qa}

out = {}
for qf, lives in CAND.items():
    path = QD + qf
    try:
        qbytes = open(path, "rb").read()
    except FileNotFoundError:
        out[qf] = "QUARANTINE_FILE_MISSING_LOCALLY"
        continue
    qs = sha(qbytes)
    res = {"quarantine_sha": qs, "quarantine_size": len(qbytes), "live": {}}
    for lp in lives:
        lb = fetch(lp)
        res["live"][lp] = sha(lb) if lb else "LIVE_404"
    out[qf] = res
    dup = any(v == qs for v in res["live"].values())
    print(f"{'DUP ' if dup else 'NEW '} {qf[:75]}")
    for lp, ls in res["live"].items():
        print(f"     live: {ls[:12] if isinstance(ls,str) else ls} {'same' if ls==qs else 'diff/404'}  ({lp[-58:]})")
json.dump(out, open("/home/z/my-project/upload/pp_quarantine_compare.json", "w"), indent=1)
