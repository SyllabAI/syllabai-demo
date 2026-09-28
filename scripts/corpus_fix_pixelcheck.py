#!/usr/bin/env python3
"""
Corpus-fix wave stage 1b — pixel-level variant verification (2013-era PDFs
have broken ToUnicode maps; pdftotext is mojibake, so compare rendered pages).

For every fix entry, three renders (page 4 @100dpi grayscale, or last page):
  corpus copy (PMT mis-filed scan)  ~  DAM R paper   => small diff
  corpus copy                       ~  DAM non-R     => large diff
  fresh replacement (= DAM non-R)   vs DAM R         => large diff
Metric: mean abs grayscale diff on 200px-wide thumbnails.
"""
import json
import os
import subprocess
import sys

from PIL import Image

DAM = "/tmp/my-project/upload/4ph0_dam"
STAGE = "/home/z/my-project/upload/corpus_fix_staging"
staged = json.load(open(f"{STAGE}/staged.json"))


def render(pdf: str, page: int) -> Image.Image | None:
    out = "/tmp/pxrender"
    subprocess.run(f'pdftoppm -f {page} -l {page} -gray -scale-to 200 "{pdf}" "{out}"', shell=True, capture_output=True)
    files = sorted(f for f in os.listdir("/tmp") if f.startswith("pxrender"))
    if not files:
        return None
    img = Image.open(f"/tmp/{files[0]}").convert("L")
    for f in files:
        os.remove(f"/tmp/{f}")
    return img


def npages(pdf: str) -> int:
    r = subprocess.run(f'pdfinfo "{pdf}"', shell=True, capture_output=True, text=True)
    for ln in r.stdout.splitlines():
        if ln.startswith("Pages:"):
            return int(ln.split()[-1])
    return 0


def mad(a: Image.Image, b: Image.Image) -> float:
    if a.size != b.size:
        b = b.resize(a.size)
    pa, pb = a.getdata(), b.getdata()
    return sum(abs(x - y) for x, y in zip(pa, pb)) / len(pa)


def diff(pdf_a: str, pdf_b: str) -> float:
    n = min(npages(pdf_a), npages(pdf_b), 4) or 1
    img_a, img_b = render(pdf_a, n), render(pdf_b, n)
    if img_a is None or img_b is None:
        return -1.0
    return mad(img_a, img_b)


fails = 0
print(f"{'entry':26s} {'corpus~R':>9s} {'corpus~nonR':>11s} {'repl~R':>8s} verdict")
for st in staged:
    sess, var, mat = st["session"], st["var"], st["mat"]
    corpus = f"{DAM}/corpus_{sess}_{var}_{mat}.pdf"
    dam_r = f"{DAM}/{sess}_{var}R_{mat}.pdf"
    dam_n = f"{DAM}/{sess}_{var}_{mat}.pdf"
    repl = f"{STAGE}/{sess}/4PH0-{var}/{mat}.pdf"
    d_cr = diff(corpus, dam_r)
    d_cn = diff(corpus, dam_n)
    d_rr = diff(repl, dam_r)
    ok = (0 <= d_cr < 3) and d_cn > 8 and d_rr > 8
    if not ok:
        fails += 1
    print(f"{sess}/{var}/{mat:16s} {d_cr:9.2f} {d_cn:11.2f} {d_rr:8.2f} {'OK' if ok else 'FAIL'}")

print(f"\nfailures: {fails}")
sys.exit(1 if fails else 0)
