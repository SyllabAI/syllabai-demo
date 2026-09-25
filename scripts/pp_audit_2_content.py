#!/usr/bin/env python3
"""Content-level audit: download each qp.pdf/ms.pdf, extract printed paper refs
from the cover pages, compare vs the dir-derived identity.
Streaming + resumable. Output: upload/pp_content_report.jsonl + issues summary."""
import concurrent.futures as cf
import json, os, re, sys, threading, time, urllib.request, urllib.error

INV = "/home/z/my-project/upload/pp_inventory.json"
OUT = "/home/z/my-project/upload/pp_content_report.jsonl"
STATE = "/home/z/my-project/upload/pp_content_state.txt"
TMP = "/home/z/my-project/upload/tmp_pdf"
RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/"
UA = {"User-Agent": "SyllabAI-corpus-audit/1.0 (identity verification sweep)"}

os.makedirs(TMP, exist_ok=True)
inv = json.load(open(INV))

# ---- build work list (skip specimen; qp+ms only)
work = []
for dp, info in inv["paper_dirs"].items():
    if info["session"] == "specimen":
        continue
    for f in ("qp.pdf", "ms.pdf"):
        if f in info["files"]:
            work.append((dp, f, info))

print(f"work items: {len(work)}", flush=True)

# ---- expected identity from dir name
def expected_code(d: str):
    m = re.match(r"^([0-9A-Z]{4,6})-([0-9A-Z]{1,4})$", d)
    if not m:
        return None
    return f"{m.group(1)}/{m.group(2)}"

# dual-certification siblings: 4SD0 shares papers with the three sciences (2019+)
DUAL = {
    "4SD0": {"1B": "4BI1", "2B": "4BI1", "1C": "4CH1", "2C": "4CH1", "1P": "4PH1", "2P": "4PH1", "1F": None, "2F": None},
    "4CH1": "4SD0", "4PH1": "4SD0", "4BI1": "4SD0",
    "4SC0": None, "4CH0": None, "4PH0": None, "4BI0": None,
}

def accept_set(d: str):
    exp = expected_code(d)
    if not exp:
        return None
    fam, comp = exp.split("/", 1)
    acc = {exp}
    dual = DUAL.get(fam, None)
    if isinstance(dual, dict):  # 4SD0 dir
        alt = dual.get(comp)
        if alt:
            acc.add(f"{alt}/{comp}")
    elif isinstance(dual, str):
        acc.add(f"{dual}/{comp}")
    return acc

# ---- printed-ref extraction
RE_REF = re.compile(r"\b([0-9][A-Z0-9]{2,4}|W[A-Z]{2,4}[0-9]{2})\s*/\s*([0-9][0-9A-Z]{0,3})\b")
# families we treat as printable refs (corpus dirs + known legacy families)
KNOWN_FAMS = set()
for dp, info in inv["paper_dirs"].items():
    m = re.match(r"^([0-9A-Z]{4,6})-", info["dir"])
    if m:
        KNOWN_FAMS.add(m.group(1))
KNOWN_FAMS |= {"4SD0", "4SC0", "4CH0", "4CH1", "4PH0", "4PH1", "4BI0", "4BI1", "4MA0", "4MA1",
               "4EA0", "4EA1", "4EB0", "4EB1", "4ET0", "4ET1", "4FR0", "4SP0", "4GE0", "4GE1",
               "4HI0", "4HI1", "4RE0", "4RE1", "4IT0", "4IT1", "4CP0", "4CP1", "4BS0", "4BS1",
               "4EC0", "4EC1", "4AC0", "4AC1", "4CN0", "4CN1", "4AR0", "4PO0", "4PS0", "4PP0",
               "4PH0", "4AA0", "4AN0", "4AS0", "4ES0", "4SW0", "4GW0", "4GN0", "4ML0", "4MU0",
               "4PE0", "4PM0", "4PM1", "4XF0", "4XMA", "4WX0", "4DT0", "4DT1", "4AD0", "4AD1",
               "4PA0", "4PT0", "4PF0", "4PP1", "4HS0", "4HS1", "4GL0", "4GM0", "4UR0", "4US0",
               "4BE0", "4BE1", "4HB0", "4HB1", "4CO0", "4CO1", "4CO2", "4CO3", "4COM", "4CS0",
               "4OS0", "4OW0", "4WH0", "4WW0", "4DB0", "4NO0", "4EL0", "4ES1", "4SB0", "4SS0",
               "4BY0", "4BY1", "4CH1", "4PH1", "4BI1", "4MA1", "4SD0"}

def extract_refs(text: str):
    up = text.upper()
    out = set()
    for m in RE_REF.finditer(up):
        fam, comp = m.group(1), m.group(2)
        if fam in KNOWN_FAMS:
            out.add(f"{fam}/{comp}")
    return out

import fitz  # PyMuPDF

def page_text(path: str, max_pages=3):
    refs, npages = set(), 0
    try:
        doc = fitz.open(path)
        npages = doc.page_count
        for i in range(min(max_pages, npages)):
            refs |= extract_refs(doc[i].get_text())
        doc.close()
    except Exception as e:
        return None, npages, f"extract_fail: {type(e).__name__}"
    return refs, npages, None

# ---- download
def fetch(url: str, dest: str):
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
                while True:
                    chunk = r.read(1 << 16)
                    if not chunk:
                        break
                    f.write(chunk)
            return None
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return "404"
            time.sleep(1.5 * (attempt + 1))
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return "fetch_fail"

lock = threading.Lock()
done_ct = [0]
t0 = time.time()

def process(item):
    dp, f, info = item
    name = dp.replace("/", "_") + "__" + f
    dest = os.path.join(TMP, name)
    url = RAW + dp + "/" + f
    err = fetch(url, dest)
    rec = {
        "path": f"{dp}/{f}", "dir": info["dir"], "session": info["session"],
        "board": info["board"], "subject": info["subject"], "spec": info["spec"],
        "expected": expected_code(info["dir"]), "bytes": os.path.getsize(dest) if err is None and os.path.exists(dest) else None,
    }
    if err is None:
        refs, npages, xerr = page_text(dest)
        rec["n_pages"] = npages
        if xerr:
            rec["class"] = "EXTRACT_FAIL"; rec["detail"] = xerr
        elif not refs:
            rec["class"] = "NO_TEXT"
        else:
            rec["printed"] = sorted(refs)
            acc = accept_set(info["dir"])
            if acc is None:
                rec["class"] = "UNPARSED_DIR"
            elif acc & refs:
                rec["class"] = "OK"
            else:
                # same-family different-component = strongest misplacement signal
                fam = info["dir"].split("-")[0]
                others = {r for r in refs if r.split("/")[0] == fam or
                          (fam == "4SD0" and r.split("/")[0] in ("4CH1", "4PH1", "4BI1")) or
                          (fam in ("4CH1", "4PH1", "4BI1") and r.split("/")[0] == "4SD0")}
                rec["class"] = "MISPLACED_SAME_FAMILY" if others else "MISPLACED_OTHER"
    else:
        rec["class"] = "DOWNLOAD_FAIL"; rec["detail"] = err
    if os.path.exists(dest):
        os.remove(dest)
    with lock:
        done_ct[0] += 1
        c = done_ct[0]
        if c % 250 == 0:
            print(f"  {c}/{len(work)} elapsed={time.time()-t0:.0f}s", flush=True)
    return rec

# resume support
done = set()
if os.path.exists(STATE):
    done = {l.strip() for l in open(STATE) if l.strip()}
todo = [w for w in work if f"{w[0]}/{w[1]}" not in done]
print(f"resume: {len(done)} done, {len(todo)} todo", flush=True)

outf = open(OUT, "a")
statef = open(STATE, "a")
wlock = threading.Lock()

with cf.ThreadPoolExecutor(max_workers=14) as ex:
    futs = [ex.submit(process, w) for w in todo]
    for fu in cf.as_completed(futs):
        rec = fu.result()
        with wlock:
            outf.write(json.dumps(rec) + "\n")
            statef.write(rec["path"] + "\n")
            outf.flush(); statef.flush()

outf.close(); statef.close()

# summarize
import collections
summary = collections.Counter()
misp = []
for line in open(OUT):
    r = json.loads(line)
    summary[r["class"]] += 1
    if r["class"].startswith("MISPLACED"):
        misp.append(r)
print("SUMMARY:", dict(summary))
print(f"misplaced rows: {len(misp)}")
json.dump(misp, open("/home/z/my-project/upload/pp_misplaced.json", "w"), indent=1)
