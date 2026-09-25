#!/usr/bin/env python3
"""Compare printed P-codes between 2020-06 and 2020-11/2020-10 files
to establish whether the Edexcel June-2020 dirs duplicate the administered sitting."""
import os, re, urllib.request, urllib.parse
import fitz

RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/"
UA = {"User-Agent": "SyllabAI-corpus-audit/1.0"}
TMP = "/home/z/my-project/upload/inspect"
RE_P = re.compile(r"\*?(P[0-9]{5}[A-Z]?)\*?")

def fetch(p):
    dest = os.path.join(TMP, "pc_" + p.replace("/", "_"))
    if not os.path.exists(dest):
        req = urllib.request.Request(RAW + urllib.parse.quote(p), headers=UA)
        try:
            with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
                f.write(r.read())
        except Exception:
            return None
    return dest

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
        return "ERR"

PAIRS = [
    # IGCSE: 2020-06 vs 2020-11 (same paper dir)
    ("international-gcse/biology/4bi1/past-papers/2020-06/4BI1-1B/qp.pdf",
     "international-gcse/biology/4bi1/past-papers/2020-11/4BI1-1B/qp.pdf"),
    ("international-gcse/mathematics-a/4ma1/past-papers/2020-06/4MA1-1H/qp.pdf",
     "international-gcse/mathematics-a/4ma1/past-papers/2020-11/4MA1-1H/qp.pdf"),
    ("international-gcse/economics/4ec1/past-papers/2020-06/4EC1-02/qp.pdf",
     "international-gcse/economics/4ec1/past-papers/2020-11/4EC1-02/qp.pdf"),
    ("international-gcse/computer-science/4cp0/past-papers/2020-06/4CP0-01/qp.pdf",
     "international-gcse/computer-science/4cp0/past-papers/2020-11/4CP0-01/qp.pdf"),
    # IAL: 2020-06 vs 2020-10
    ("international-a-level/mathematics/mathematics-2018/past-papers/2020-06/WMA11-01/qp.pdf",
     "international-a-level/mathematics/mathematics-2018/past-papers/2020-10/WMA11-01/qp.pdf"),
    ("international-a-level/chemistry/wch11/past-papers/2020-06/WCH11-01/qp.pdf",
     "international-a-level/chemistry/wch11/past-papers/2020-10/WCH11-01/qp.pdf"),
    ("international-a-level/physics/wph11/past-papers/2020-06/WPH11-01/qp.pdf",
     "international-a-level/physics/wph11/past-papers/2020-10/WPH11-01/qp.pdf"),
    # control: cambridge 2020-06 vs 2020-11 (expect DIFFERENT papers)
    ("../../cambridge-international/ial/mathematics/9709/past-papers/2020-06/9709-S20-QP-11/qp.pdf",
     "../../cambridge-international/ial/mathematics/9709/past-papers/2020-11/9709-W20-QP-11/qp.pdf"),
]

for a, b in PAIRS:
    pa = "past-papers/pearson-edexcel/" + a if a.startswith("international") else "past-papers/" + a.replace("../", "")
    pb = "past-papers/pearson-edexcel/" + b if b.startswith("international") else "past-papers/" + b.replace("../", "")
    ca, cb = pcodes(pa), pcodes(pb)
    same = ca and cb and bool(set(ca) & set(cb))
    print(f"{'SAME ' if same else 'DIFF '} {a.split('/')[-3]}/{a.split('/')[-2]}")
    print(f"   jun2020: {ca}")
    print(f"   administered: {cb}")
