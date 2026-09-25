#!/usr/bin/env python3
"""Part 4c: manifests for renames (WCHxx-01), new specimen dirs, moved 4EC1-021."""
import hashlib, json, os, urllib.request, urllib.parse
import yaml

UP = "/home/z/my-project/upload"
NEWBLOBS = f"{UP}/new_blobs"
RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/"
UA = {"User-Agent": "SyllabAI-corpus-audit/1.0"}
TAG = "PP-FIX-2026-09-26"
manifest_ops = json.load(open(f"{UP}/manifest_ops.json"))

def git_sha(path):
    data = open(os.path.join(NEWBLOBS, path), "rb").read()
    h = hashlib.sha1(); h.update(b"blob %d\0" % len(data)); h.update(data)
    return h.hexdigest()

def emit(path, doc):
    text = yaml.dump(doc, sort_keys=False, allow_unicode=True, default_flow_style=False, width=100)
    dest = os.path.join(NEWBLOBS, path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "w").write(text)
    return git_sha(path)

def fetch_manifest(tree_path):
    req = urllib.request.Request(RAW + urllib.parse.quote(tree_path), headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return yaml.safe_load(r.read())
    except Exception:
        return None

# ---------- F. wch14/15/16 2020-10 renames ----------
for u in ("wch14", "wch15", "wch16"):
    code = u.upper()
    old_mp = f"past-papers/pearson-edexcel/international-a-level/chemistry/{u}/past-papers/2020-10/{code}-1/manifest.yaml"
    doc = fetch_manifest(old_mp)
    doc["paper_id"] = doc["paper_id"].replace(f"{code}/1", f"{code}/01")
    doc["paper"]["official_reference"] = f"{code}/01"
    doc["paper"]["paper_number_variant"] = "01"
    doc.setdefault("repair", []).append({
        "wave": TAG,
        "action": "dir renamed from {c}-1 to {c}-01 (canonical); printed reference on covers is {c}/01; P-codes P64620-22A verified".format(c=code),
    })
    new_mp = old_mp.replace("-1/", "-01/")
    manifest_ops[new_mp] = emit(new_mp, doc)

# ---------- G. new specimen dirs ----------
base = {
    "exam_board": {"id": "pearson-edexcel", "name": "Pearson Edexcel"},
    "ingestion": {"agent": "SyllabAI ingestion agent", "run_date": "2026-09-26",
                  "source_repo": "SyllabAI/syllabai-pastpapers (_quarantine promotion)",
                  "verification_status": "AI-IDENTIFIED"},
}
def mat(mtype, sha, orig, note):
    return {"type": mtype, "path": None, "sha256": sha, "size_bytes": None,
            "original_filename": orig, "source": {"source_type": "quarantine-promotion", "note": note}}

# WME02-01 specimen
qp_sha = None; ms_sha = None
import subprocess
def raw_sha(tree_path):
    dest = os.path.join(UP, "inspect", "sha_" + tree_path.replace("/", "_"))
    if not os.path.exists(dest):
        req = urllib.request.Request(RAW + urllib.parse.quote(tree_path), headers=UA)
        with urllib.request.urlopen(req, timeout=90) as r, open(dest, "wb") as f:
            f.write(r.read())
    return hashlib.sha256(open(dest, "rb").read()).hexdigest(), os.path.getsize(dest)

qp_sha, qp_size = raw_sha("_quarantine/unresolved-identity/IAL__Edexcel__Pure Maths__M2__Specimen QP_3.pdf")
ms_sha, ms_size = raw_sha("_quarantine/unresolved-identity/IAL__Edexcel__Pure Maths__M2__Specimen MS_3.pdf")
doc = dict(base)
doc["paper_id"] = "pearson-edexcel:international-a-level:mathematics:wma01:specimen:WME02/01"
doc["qualification"] = {"family": "international-a-level", "name": "International A Level"}
doc["subject"] = "mathematics"
doc["specification"] = {"folder": "wma01", "title": "Edexcel International Advanced Level Mathematics (WMA01)"}
doc["series"] = {"normalized": "specimen", "year": None, "session_month": None,
                 "printed": "Specimen", "source": "quarantine identity resolution"}
doc["paper"] = {"official_reference": "WME02/01", "unit_code": "WME02", "paper_number_variant": "01"}
m_qp = mat("question-paper", qp_sha, "IAL__Edexcel__Pure Maths__M2__Specimen QP_3.pdf",
           "prints WME02/01 specimen; identity resolved by deep text extraction")
m_qp["path"] = "qp.pdf"; m_qp["size_bytes"] = qp_size
m_ms = mat("mark-scheme", ms_sha, "IAL__Edexcel__Pure Maths__M2__Specimen MS_3.pdf",
           "prints WME02/01 specimen mark scheme; identity resolved by deep text extraction")
m_ms["path"] = "ms.pdf"; m_ms["size_bytes"] = ms_size
doc["materials"] = [m_ms, m_qp]
doc["identification"] = {"methods": ["pdf_text"], "confidence_rank": 0,
                          "printed_references_seen": ["WME02/01"],
                          "session_printed": None,
                          "notes": [f"promoted from _quarantine/unresolved-identity by {TAG}; "
                                    "June 2014-2018 siblings of this scan family verified byte-identical to live corpus copies"]}
mp = "past-papers/pearson-edexcel/international-a-level/mathematics/wma01/specimen/WME02-01/manifest.yaml"
manifest_ops[mp] = emit(mp, doc)

# 4MB1-02 specimen
qp_sha, qp_size = raw_sha("_quarantine/duplicate-artifact/IGCSE__Edexcel__Maths B__Paper 2__Specimen QP_2.pdf")
ms_sha, ms_size = raw_sha("_quarantine/unresolved-identity/IGCSE__Edexcel__Maths B__Paper 2__Specimen MS_2.pdf")
doc = dict(base)
doc["paper_id"] = "pearson-edexcel:international-gcse:mathematics-b:4mb1:specimen:4MB1/02"
doc["qualification"] = {"family": "international-gcse", "name": "International GCSE"}
doc["subject"] = "mathematics-b"
doc["specification"] = {"folder": "4mb1", "title": "Edexcel International GCSE Mathematics B (4MB1)"}
doc["series"] = {"normalized": "specimen", "year": None, "session_month": None,
                 "printed": "Sample assessment material (first teaching September 2016)", "source": "cover print"}
doc["paper"] = {"official_reference": "4MB1/02", "unit_code": "4MB1", "paper_number_variant": "02"}
m_qp = mat("question-paper", qp_sha, "IGCSE__Edexcel__Maths B__Paper 2__Specimen QP_2.pdf",
           "prints 4MB1/02 'Sample assessment material for first teaching September 2016'; "
           "resolver had bucketed SAMs into the Paper 1 slot — identity corrected")
m_qp["path"] = "qp.pdf"; m_qp["size_bytes"] = qp_size
m_ms = mat("mark-scheme", ms_sha, "IGCSE__Edexcel__Maths B__Paper 2__Specimen MS_2.pdf",
           "Paper 2 SAM mark scheme (International GCSE Mathematics B - Paper 2)")
m_ms["path"] = "ms.pdf"; m_ms["size_bytes"] = ms_size
doc["materials"] = [m_ms, m_qp]
doc["identification"] = {"methods": ["pdf_text"], "confidence_rank": 0,
                          "printed_references_seen": ["4MB1/02"],
                          "session_printed": None,
                          "notes": [f"promoted from _quarantine by {TAG}; creates the missing Paper 2 specimen dir"]}
mp = "past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/specimen/4MB1-02/manifest.yaml"
manifest_ops[mp] = emit(mp, doc)

# ---------- H. 4EC1-021 moved manifest ----------
old_mp = "past-papers/pearson-edexcel/international-gcse/economics/4ec1/past-papers/2019-06/4EC1-021/manifest.yaml"
doc = fetch_manifest(old_mp)
doc["paper_id"] = "pearson-edexcel:international-gcse:economics:4ec1:2021-11:4EC1/021"
doc["series"] = {"normalized": "2021-11", "year": "2021", "session_month": "11",
                 "printed": "November 2021", "source": "cover P-code batch P658xx (Nov-2021 printing); source filename 2021_Nov"}
doc.setdefault("repair", []).append({
    "wave": TAG,
    "action": "dir moved from 2019-06/4EC1-021 to 2021-11/4EC1-021: the paper is a November-2021 sitting "
              "(printed P65899RA, copyright 2021, sibling P65897RA of 2021-11/4EC1-011); it was misplaced in the June-2019 session",
})
new_mp = "past-papers/pearson-edexcel/international-gcse/economics/4ec1/past-papers/2021-11/4EC1-021/manifest.yaml"
manifest_ops[new_mp] = emit(new_mp, doc)

json.dump(manifest_ops, open(f"{UP}/manifest_ops.json", "w"), indent=1)
print(f"manifest ops now: {len(manifest_ops)}")
