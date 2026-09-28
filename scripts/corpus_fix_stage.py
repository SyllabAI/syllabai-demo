#!/usr/bin/env python3
"""
Corpus-fix wave stage 1 — verify + stage.

Fix set: 23 mis-filed corpus files (June 2013..2018 4PH0 1P/2P dirs holding
PMT '(R)' regional-variant PDFs) replaced by the genuine non-R Pearson DAM
files downloaded by the 4SC0 wave (dam_map URLs in 4ph0_repair_report.json).

For every fix entry:
  1. mis-filed side: pdftotext page 1 of the local as-in-corpus copy
     (corpus_<sess>_<var>_<mat>.pdf) MUST print the R code (1PR/2PR) —
     positive proof the corpus file really is the regional paper.
  2. replacement side: fresh DAM download (dam_map URL) MUST sha-match the
     local DAM copy; pdftotext page 1 MUST print the plain code (1P/2P),
     MUST NOT print the R code, and MUST print a 2016-style session date line.

Everything staged under upload/corpus_fix_staging/.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request

DAM = "/tmp/my-project/upload/4ph0_dam"
STAGE = "/home/z/my-project/upload/corpus_fix_staging"
SPEC = "past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers"
REPORT = json.load(open("/home/z/my-project/upload/4ph0_repair_report.json"))
TOKEN = open("/home/z/my-project/scripts/.gh_token").read().strip()

# (session, dir) -> materials to replace
FIX = {
    "2013-06/4PH0-1P": ["qp", "ms"],
    "2013-06/4PH0-2P": ["ms"],
    "2014-06/4PH0-1P": ["qp", "ms"],
    "2014-06/4PH0-2P": ["qp", "ms"],
    "2015-06/4PH0-1P": ["qp", "ms"],
    "2015-06/4PH0-2P": ["qp", "ms"],
    "2016-06/4PH0-1P": ["qp", "ms"],
    "2016-06/4PH0-2P": ["qp", "ms"],
    "2017-06/4PH0-1P": ["qp", "ms"],
    "2017-06/4PH0-2P": ["qp", "ms"],
    "2018-06/4PH0-1P": ["qp", "ms"],
    "2018-06/4PH0-2P": ["qp", "ms"],
}
# 2013-06/4PH0-2P qp verified GENUINE non-R (text-similarity 0.998 vs non-R,
# 0.035 vs R) — deliberately NOT in the fix set.

DAM_URLS = REPORT["dam_map"]


def sh(cmd, **kw):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, **kw)


def pdftext(pdf: str, first: bool = False) -> str:
    out = pdf + ".txt.tmp"
    r = sh(f'pdftotext {"-f 1 -l 1 " if first else ""}"{pdf}" "{out}"')
    if r.returncode != 0:
        return ""
    try:
        return open(out, encoding="utf-8", errors="replace").read()
    finally:
        os.remove(out)


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "corpus-fix-wave", "Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s)


fails = []
staged = []
print(f"{'entry':28s} {'side':5s} checks")
for sess_dir, mats in sorted(FIX.items()):
    sess, d = sess_dir.split("/")
    var = d.replace("4PH0-", "")          # 1P / 2P
    num, rcode = var[0], var + "R"        # 1, 1P -> 1PR
    urls = DAM_URLS[f"{sess}:{var}"]
    for mat in mats:
        entry = f"{sess_dir}/{mat}"
        # ---- side A: the mis-filed corpus copy must print the R code ----
        corpus_copy = f"{DAM}/corpus_{sess}_{var}_{mat}.pdf"
        if not os.path.exists(corpus_copy):
            fails.append(f"{entry}: corpus copy missing"); print(f"{entry:28s} corpus MISSING"); continue
        cov = norm(pdftext(corpus_copy, first=True))
        has_r = bool(re.search(rf"\b{num}PR\b|\bKPH0/{num}PR\b|\b4SC0/{num}PR\b", cov))
        if not has_r:
            fails.append(f"{entry}: corpus copy cover does not print {num}PR — check manually")
        rsha = hashlib.sha256(open(corpus_copy, "rb").read()).hexdigest()

        # ---- side B: fresh DAM download, sha vs local copy, plain cover ----
        url = urls[mat]
        try:
            fresh = fetch(url)
        except Exception as e:  # noqa: BLE001
            fails.append(f"{entry}: DAM fetch failed {e}"); print(f"{entry:28s} DAM FAIL"); continue
        fsha = hashlib.sha256(fresh).hexdigest()
        local = f"{DAM}/{sess}_{var}_{mat}.pdf"
        lsha = hashlib.sha256(open(local, "rb").read()).hexdigest()
        if not (fsha == lsha):
            fails.append(f"{entry}: fresh DAM sha != local DAM copy")
        # write fresh to temp for cover text
        tmp = f"/tmp/fresh_{sess}_{var}_{mat}.pdf"
        open(tmp, "wb").write(fresh)
        fcov = norm(pdftext(tmp, first=True))
        has_plain = bool(re.search(rf"Paper:\s*{var}\b|Paper Reference", fcov)) and bool(re.search(rf"\b{num}P\b", fcov))
        no_r = not re.search(rf"\b{num}PR\b", fcov.split("Paper Reference")[-1][:400]) if "Paper Reference" in fcov else not re.search(rf"\b{num}PR\b", fcov)
        date_ok = bool(re.search(r"(January|February|March|April|May|June|July)\s+\d{1,2},?\s+20\d\d|\d{1,2}\s+(January|February|March|April|May|June|July)\s+20\d\d", fcov))
        if not (has_plain and no_r and date_ok):
            fails.append(f"{entry}: replacement cover check plain={has_plain} no_r={no_r} date={date_ok}")
        status = "OK" if not any(f.startswith(entry) for f in fails) else "FAIL"
        print(f"{entry:28s} {status:5s} corpusR={has_r} plain={has_plain} noR={no_r} date={date_ok} sha={fsha[:10]}")

        os.makedirs(f"{STAGE}/{sess_dir}", exist_ok=True)
        open(f"{STAGE}/{sess_dir}/{mat}.pdf", "wb").write(fresh)
        staged.append({
            "session": sess, "dir": d, "var": var, "mat": mat,
            "corpus_sha256": rsha,
            "new_sha256": fsha, "new_size": len(fresh),
            "original_filename": os.path.basename(url.replace("%20", " ")) if False else url.rsplit("/", 1)[-1].replace("%20", " "),
            "source_url": url,
            "corpus_cover": cov[:150], "new_cover": fcov[:150],
        })

json.dump(staged, open(f"{STAGE}/staged.json", "w"), indent=1)
print()
print(f"staged {len(staged)} files; fails: {len(fails)}")
for f in fails:
    print("  FAIL:", f)
sys.exit(1 if fails else 0)
