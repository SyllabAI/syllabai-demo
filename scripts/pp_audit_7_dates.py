#!/usr/bin/env python3
"""Full-text date + ref extraction for the COVID-sitting cluster."""
import os, re, urllib.request, urllib.parse
import fitz

RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/"
UA = {"User-Agent": "SyllabAI-corpus-audit/1.0"}
TMP = "/home/z/my-project/upload/inspect"

FILES = [
    ("pearson-edexcel/international-gcse/economics/4ec1/past-papers/2019-06/4EC1-021/qp.pdf", "4EC1-021 in 2019-06"),
    ("pearson-edexcel/international-gcse/economics/4ec1/past-papers/2021-11/4EC1-011/qp.pdf", "4EC1-011 in 2021-11"),
    ("pearson-edexcel/international-gcse/accounting/4ac1/past-papers/2021-03/4AC1-021/qp.pdf", "4AC1-021 in 2021-03"),
    ("pearson-edexcel/international-gcse/accounting/4ac1/past-papers/2021-03/4AC1-02/qp.pdf", "4AC1-02 in 2021-03"),
    ("pearson-edexcel/international-gcse/business/4bs1/past-papers/2021-11/4BS1-011/qp.pdf", "4BS1-011 in 2021-11"),
    ("pearson-edexcel/international-gcse/business/4bs1/past-papers/2021-11/4BS1-021/qp.pdf", "4BS1-021 in 2021-11"),
    ("pearson-edexcel/international-gcse/commerce/4cm1/past-papers/2021-06/4CM1-021/qp.pdf", "4CM1-021 in 2021-06"),
    ("pearson-edexcel/international-gcse/commerce/4cm1/past-papers/2021-11/4CM1-021/qp.pdf", "4CM1-021 in 2021-11"),
    ("pearson-edexcel/international-gcse/human-biology/4hb1/past-papers/2021-11/4HB1-021/qp.pdf", "4HB1-021 in 2021-11"),
    ("pearson-edexcel/international-gcse/ict/4it1/past-papers/2021-06/4IT1-011/qp.pdf", "4IT1-011 in 2021-06"),
    ("pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2021-06/4CP0-012/qp.pdf", "4CP0-012 in 2021-06"),
    ("pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2022-06/4CP0-01C/qp.pdf", "4CP0-01C in 2022-06"),
]
RE_DATE = re.compile(r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?,?\s*\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d\d|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d\d")
RE_REF = re.compile(r"4[A-Z0-9]{3}\s*/\s*[0-9][0-9A-Z]{0,3}")

def get(p):
    dest = os.path.join(TMP, p.replace("/", "_"))
    if not os.path.exists(dest):
        req = urllib.request.Request(RAW + urllib.parse.quote("past-papers/" + p), headers=UA)
        with urllib.request.urlopen(req, timeout=90) as r, open(dest, "wb") as f:
            f.write(r.read())
    return dest

for p, label in FILES:
    try:
        d = get(p)
        doc = fitz.open(d)
        t = "".join(doc[i].get_text() for i in range(min(2, doc.page_count)))
        doc.close()
        dates = sorted(set(RE_DATE.findall(t)))
        refs = sorted(set(x.replace(" ", "") for x in RE_REF.findall(t)))
        print(f"{label:26s} refs={refs} dates={dates}")
    except Exception as e:
        print(f"{label:26s} ERROR {e}")
