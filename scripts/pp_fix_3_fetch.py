#!/usr/bin/env python3
"""Stage A: download & verify all replacement/new files needed for the fix.
Saves to upload/staging/<target-path> with a verification sidecar.
Sources: PMT (direct PDF host), SME CDN. Politeness delay ~1.2s."""
import json, os, re, subprocess, time, urllib.request, urllib.parse
import fitz

OUT = "/home/z/my-project/upload/staging"
os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (SyllabAI corpus repair; educational)", "Accept": "application/pdf,*/*"}
LOG = []

PMT = "https://pmt.physicsandmathstutor.com/download/"
PHY = PMT + "Physics/GCSE/Past-Papers/Edexcel-IGCSE/"
CHEM = PMT + "Chemistry/GCSE/Past-Papers/Edexcel-IGCSE/"
BIO = PMT + "Biology/GCSE/Past-Papers/Edexcel-IGCSE/"

def fetch(url, dest, tries=3):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return True
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r, open(dest, "wb") as f:
                while True:
                    c = r.read(1 << 16)
                    if not c:
                        break
                    f.write(c)
            time.sleep(1.2)
            return True
        except Exception as e:
            time.sleep(2 * (a + 1))
    return False

def verify(path, expect_ref, forbid_ref=None, is_ms=False):
    """Text-extract pages 1-3; OCR fallback. expect_ref like '4PH1/1P'.
    forbid_ref: the R twin that must NOT appear (e.g. '4PH1/1PR')."""
    try:
        doc = fitz.open(path)
        t = "".join(doc[i].get_text() for i in range(min(3, doc.page_count)))
        doc.close()
    except Exception as e:
        return False, f"open-fail {e}"
    if len(t.strip()) < 60:
        try:
            doc = fitz.open(path)
            pix = doc[0].get_pixmap(dpi=180)
            png = path + ".ocr.png"
            pix.save(png)
            doc.close()
            t = subprocess.run(["tesseract", png, "stdout", "--psm", "3"],
                               capture_output=True, text=True, timeout=120).stdout
            os.remove(png)
        except Exception as e:
            return False, f"ocr-fail {e}"
    up = t.upper().replace(" ", "")
    exp = expect_ref.replace(" ", "").upper()
    ok = exp in up
    bad = None
    if forbid_ref and not is_ms:
        f_ = forbid_ref.replace(" ", "").upper()
        # forbid only if appears as a clean token (avoid '4PH1/1P' inside '4PH1/1PR' false hit)
        if re.search(re.escape(f_) + r"(?![0-9A-Z])", up):
            bad = forbid_ref
    return (ok and not bad), f"expect={'Y' if ok else 'N'} forbid_hit={bad}"

PLAN = []  # (url, target_path, expect_ref, forbid_ref)

# --- 4PH1 base QPs (replace poisoned R bytes in P dirs) ---
SESS4PH1 = {
    "June 2019": "2019-06", "January 2020": "2020-01", "January 2021": "2021-01",
    "January 2022": "2022-01", "January 2023": "2023-01", "June 2022": "2022-06",
    "June 2023": "2023-06", "June 2024": "2024-06",
}
for pno, paper in ((1, "1P"), (2, "2P")):
    for sess_name, sess in SESS4PH1.items():
        fn = f"{sess_name} QP.pdf"
        url = f"{PHY}New-Spec-Paper-{pno}/QP/{urllib.parse.quote(fn)}"
        target = f"past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/{sess}/4PH1-{paper}/qp.pdf"
        PLAN.append((url, target, f"4PH1/{paper}", f"4PH1/{paper}R"))

# --- 4PH1 June 2020 base P2 QP (missing at 2020-11/4PH1-2P) ---
PLAN.append((f"{PHY}New-Spec-Paper-2/QP/{urllib.parse.quote('June 2020 QP.pdf')}",
             "past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2020-11/4PH1-2P/qp.pdf",
             "4PH1/2P", "4PH1/2PR"))

# --- 4PH0 legacy base QPs + one MS ---
for pno, paper in ((1, "1P"), (2, "2P")):
    for yr in (2014, 2015, 2016, 2017, 2018):
        fn = f"June {yr} QP - Paper {paper} Edexcel Physics IGCSE.pdf"
        url = f"{PHY}Paper-{pno}/{urllib.parse.quote(fn)}"
        target = f"past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/{yr}-06/4PH0-{paper}/qp.pdf"
        PLAN.append((url, target, f"4PH0/{paper}", f"4PH0/{paper}R"))
PLAN.append((f"{PHY}Paper-2/{urllib.parse.quote("June 2014 MS - Paper 2P Edexcel Physics IGCSE.pdf")}",
             "past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/2014-06/4PH0-2P/ms.pdf",
             "4PH0/2P", "4PH0/2PR"))

# --- January 2012 genuine MSs (4PH0/1P, 4CH0/1C, 4BI0/1B) ---
PLAN.append((f"{PHY}Paper-1/{urllib.parse.quote("January 2012 MS - Paper 1P Edexcel Physics IGCSE.pdf")}",
             "past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/2012-01/4PH0-1P/ms.pdf",
             "4PH0/1P", "4SC0/1P"))
PLAN.append((f"{CHEM}Paper-1/{urllib.parse.quote("January 2012 MS - Paper 1C Edexcel Chemistry IGCSE.pdf")}",
             "past-papers/pearson-edexcel/international-gcse/chemistry/4ch0/past-papers/2012-01/4CH0-1C/ms.pdf",
             "4CH0/1C", "4SC0/1C"))
PLAN.append((f"{BIO}Paper-1/{urllib.parse.quote("January 2012 MS - Paper 1B Edexcel Biology IGCSE.pdf")}",
             "past-papers/pearson-edexcel/international-gcse/biology/4bi0/past-papers/2012-01/4BI0-1B/ms.pdf",
             "4BI0/1B", "4SC0/1B"))

ok = bad = 0
for url, target, exp, forb in PLAN:
    dest = os.path.join(OUT, target)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    good = fetch(url, dest)
    if not good:
        print(f"FETCH-FAIL {target}")
        LOG.append({"target": target, "url": url, "status": "FETCH_FAIL"})
        bad += 1
        continue
    v, detail = verify(dest, exp, forb)
    tag = "OK " if v else "BAD"
    print(f"{tag} {target} [{detail}]")
    LOG.append({"target": target, "url": url, "status": "OK" if v else f"VERIFY_FAIL: {detail}"})
    ok += v
    bad += (not v)

json.dump(LOG, open("/home/z/my-project/upload/staging_log.json", "w"), indent=1)
print(f"\nstaged ok={ok} bad={bad} of {len(PLAN)}")
