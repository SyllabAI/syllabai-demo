#!/usr/bin/env python3
"""Download every _quarantine PDF + sidecar; deep-extract identity (full text
+ OCR page 1 fallback) to decide promote-vs-keep."""
import concurrent.futures as cf
import json, os, re, subprocess, threading, time, urllib.request, urllib.parse

LS = "/home/z/my-project/upload/pp_ls_tree.txt"
DST = "/home/z/my-project/upload/quarantine_dl"
RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/"
UA = {"User-Agent": "SyllabAI-corpus-audit/1.0"}

os.makedirs(DST, exist_ok=True)
paths = [l.rstrip("\n").split("\t", 1)[1] for l in open(LS) if "\t" in l]
pdfs = sorted(p for p in paths if p.startswith("_quarantine/") and p.endswith(".pdf"))
print("quarantine pdfs:", len(pdfs), flush=True)

def fetch(p):
    dest = os.path.join(DST, p.replace("_quarantine/", "").replace("/", "__"))
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    url = RAW + urllib.parse.quote(p)
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r, open(dest, "wb") as f:
                while True:
                    c = r.read(1 << 16)
                    if not c:
                        break
                    f.write(c)
            return dest
        except Exception as e:
            time.sleep(1.5 * (attempt + 1))
    return None

t0 = time.time()
ok = fail = 0
with cf.ThreadPoolExecutor(max_workers=12) as ex:
    for i, dest in enumerate(ex.map(fetch, pdfs)):
        if dest:
            ok += 1
        else:
            fail += 1
        if (i + 1) % 50 == 0:
            print(f"  {i+1}/{len(pdfs)} ok={ok} fail={fail} {time.time()-t0:.0f}s", flush=True)
print(f"downloaded ok={ok} fail={fail}")
