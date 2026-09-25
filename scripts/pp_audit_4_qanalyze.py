#!/usr/bin/env python3
"""Deep-analyze all 310 quarantine PDFs: full-doc text extraction (PyMuPDF),
ref extraction, session detection, OCR fallback for page 1 (tesseract).
Output: upload/pp_quarantine_analysis.json"""
import concurrent.futures as cf
import hashlib, json, os, re, subprocess, sys

DST = "/home/z/my-project/upload/quarantine_dl"
OUT = "/home/z/my-project/upload/pp_quarantine_analysis.json"

sys.path.insert(0, "/home/z/my-project/scripts")
import fitz

RE_REF = re.compile(r"\b([0-9][A-Z0-9]{2,4}|W[A-Z]{2,4}[0-9]{2})\s*/\s*([0-9][0-9A-Z]{0,3})\b")
KNOWN_FAMS = set(re.findall(r"[0-9][A-Z0-9]{2,4}|W[A-Z]{2,4}[0-9]{2}",
    open("/home/z/my-project/upload/known_fams.txt").read())) if os.path.exists(
    "/home/z/my-project/upload/known_fams.txt") else set()

SESS = re.compile(r"\b(January|June|October|November|March|May|Summer|Autumn|Winter)\s+(\d{4})\b", re.I)
SESS2 = re.compile(r"\b(Jan|Jun|Nov|Oct|Mar)\s*['’]?(\d{2})\b", re.I)

def ocr_page1(path):
    try:
        doc = fitz.open(path)
        pix = doc[0].get_pixmap(dpi=200)
        png = path + ".p1.png"
        pix.save(png)
        doc.close()
        out = subprocess.run(["tesseract", png, "stdout", "--psm", "3"],
                             capture_output=True, text=True, timeout=120)
        os.remove(png)
        return out.stdout
    except Exception:
        return ""

def analyze(path):
    name = os.path.basename(path)
    rec = {"file": name, "bytes": os.path.getsize(path)}
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    rec["sha256"] = h.hexdigest()
    text, ntext = "", ""
    try:
        doc = fitz.open(path)
        rec["n_pages"] = doc.page_count
        for i in range(min(4, doc.page_count)):
            text += doc[i].get_text()
        doc.close()
    except Exception as e:
        rec["error"] = f"{type(e).__name__}: {e}"
        return rec
    rec["text_chars_first4"] = len(text.strip())
    refs = set()
    for m in RE_REF.finditer(text.upper()):
        if m.group(1) in KNOWN_FAMS:
            refs.add(f"{m.group(1)}/{m.group(2)}")
    sess = [f"{m.group(1)} {m.group(2)}" for m in SESS.finditer(text)]
    if not refs and len(text.strip()) < 60:
        otext = ocr_page1(path)
        rec["ocr_chars"] = len(otext.strip())
        for m in RE_REF.finditer(otext.upper()):
            if m.group(1) in KNOWN_FAMS:
                refs.add(f"{m.group(1)}/{m.group(2)}")
        sess_ocr = [f"{m.group(1)} {m.group(2)}" for m in SESS.finditer(otext)]
        if sess_ocr:
            sess = sess_ocr
        rec["text_excerpt_ocr"] = otext[:400]
    rec["refs"] = sorted(refs)
    rec["sessions"] = list(dict.fromkeys(sess))[:6]
    rec["text_excerpt"] = re.sub(r"\s+", " ", text.strip())[:400]
    return rec

files = sorted(os.path.join(DST, f) for f in os.listdir(DST) if f.endswith(".pdf"))
print("files:", len(files), flush=True)
out = []
with cf.ProcessPoolExecutor(max_workers=8) as ex:
    for i, rec in enumerate(ex.map(analyze, files, chunksize=2)):
        out.append(rec)
        if (i + 1) % 40 == 0:
            print(f"  {i+1}/{len(files)}", flush=True)
json.dump(out, open(OUT, "w"), indent=1)
print("wrote", OUT)
