#!/usr/bin/env python3
"""Fetch specific suspect files and print page-1 text to read actual cover prints."""
import os, re, sys, urllib.request, urllib.parse
import fitz

RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/"
UA = {"User-Agent": "SyllabAI-corpus-audit/1.0"}
TMP = "/home/z/my-project/upload/inspect"

FILES = [
    # physics 2020 phantom-session question
    "past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2020-06/4PH1-1P/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2020-06/4PH1-1PR/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2020-11/4PH1-1P/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2020-11/4PH1-1PR/ms.pdf",
    # 4CP0 variant cluster
    "past-papers/pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2020-11/4CP0-2A/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2020-11/4CP0-2B/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2021-11/4CP0-02/ms.pdf",
    "past-papers/pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2021-06/4CP0-012/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/computer-science/4cp0/past-papers/2022-06/4CP0-01C/qp.pdf",
    # digit-suffix dirs
    "past-papers/pearson-edexcel/international-gcse/accounting/4ac1/past-papers/2021-03/4AC1-02/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/accounting/4ac1/past-papers/2021-03/4AC1-021/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/economics/4ec1/past-papers/2019-06/4EC1-021/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/economics/4ec1/past-papers/2021-11/4EC1-011/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/business/4bs1/past-papers/2021-11/4BS1-011/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/business/4bs1/past-papers/2021-11/4BS1-021/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/commerce/4cm1/past-papers/2021-06/4CM1-021/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/human-biology/4hb1/past-papers/2021-11/4HB1-021/qp.pdf",
    "past-papers/pearson-edexcel/international-gcse/ict/4it1/past-papers/2021-06/4IT1-011/qp.pdf",
]

def get(p):
    dest = os.path.join(TMP, p.replace("/", "_"))
    if not os.path.exists(dest):
        req = urllib.request.Request(RAW + urllib.parse.quote(p), headers=UA)
        with urllib.request.urlopen(req, timeout=90) as r, open(dest, "wb") as f:
            f.write(r.read())
    return dest

for p in FILES:
    try:
        d = get(p)
        doc = fitz.open(d)
        t = doc[0].get_text()
        if len(t.strip()) < 60 and doc.page_count > 1:
            t += doc[1].get_text()
        doc.close()
        t = re.sub(r"\s+", " ", t)
        short = p.split("past-papers/")[-1]
        print(f"=== {short}")
        # show the interesting window: paper reference area + date lines
        m = re.search(r"(Paper Reference.{0,120})", t, re.I)
        print("   ref-window:", m.group(1) if m else "(none)")
        dates = re.findall(r"(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d\d", t)
        print("   dates:", sorted(set(dates)))
        print("   head:", t[:230])
        print()
    except Exception as e:
        print(f"=== {p}: ERROR {e}\n")
