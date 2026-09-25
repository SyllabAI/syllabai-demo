#!/usr/bin/env python3
"""Part 4: generate/patch manifest.yaml for every touched dir.
Output: upload/new_blobs/<tree-path> for every manifest to create/update +
upload/manifest_ops.json mapping path -> blob sha."""
import hashlib, json, os, urllib.request, urllib.parse
import yaml

UP = "/home/z/my-project/upload"
STAGING = f"{UP}/staging"
NEWBLOBS = f"{UP}/new_blobs"
os.makedirs(NEWBLOBS, exist_ok=True)
OPS = json.load(open(f"{UP}/changeset_ops.json"))
RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/"
UA = {"User-Agent": "SyllabAI-corpus-audit/1.0"}
TAG = "PP-FIX-2026-09-26"

_sha_cache = {}
def sha256_of_tree_blob(tree_path):
    """sha256 of current blob content (for moved/preserved bytes)."""
    if tree_path in _sha_cache:
        return _sha_cache[tree_path]
    dest = os.path.join(UP, "inspect", "sha_" + tree_path.replace("/", "_"))
    if not os.path.exists(dest):
        req = urllib.request.Request(RAW + urllib.parse.quote(tree_path), headers=UA)
        with urllib.request.urlopen(req, timeout=90) as r, open(dest, "wb") as f:
            f.write(r.read())
    h = hashlib.sha256(open(dest, "rb").read()).hexdigest()
    _sha_cache[tree_path] = h
    return h

def sha256_local(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()

def emit(path, doc):
    text = yaml.dump(doc, sort_keys=False, allow_unicode=True, default_flow_style=False, width=100)
    dest = os.path.join(NEWBLOBS, path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "w").write(text)
    return git_sha(path)

def git_sha(path):
    data = open(os.path.join(NEWBLOBS, path), "rb").read()
    h = hashlib.sha1(); h.update(b"blob %d\0" % len(data)); h.update(data)
    return h.hexdigest()

def fetch_manifest(tree_path):
    req = urllib.request.Request(RAW + urllib.parse.quote(tree_path), headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return yaml.safe_load(r.read())
    except Exception:
        return None

manifest_ops = {}

def repin(doc, mat_path, new_sha, new_size, orig_name=None, src_note=None):
    for m in doc.get("materials", []):
        if m.get("path") == mat_path:
            m["sha256"] = new_sha
            m["size_bytes"] = new_size
            if orig_name:
                m["original_filename"] = orig_name
            if src_note:
                m.setdefault("source", {})["note"] = src_note
    return doc

def add_repair(doc, action, prev=None, src=None, note=None):
    r = {"wave": TAG, "action": action}
    if prev: r["previous_sha256"] = prev
    if src: r["replacement_source"] = src
    if note: r["note"] = note
    doc.setdefault("repair", []).append(r)
    return doc

PMT_PHYS = "https://pmt.physicsandmathstutor.com/download/Physics/GCSE/Past-Papers/Edexcel-IGCSE/"

# ---------- A. 4PH1 P dirs: qp replaced ----------
for sess in ["2019-06","2020-01","2021-01","2022-01","2023-01","2022-06","2023-06","2024-06"]:
    for paper in ("1P", "2P"):
        d = f"past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/{sess}/4PH1-{paper}"
        mp = f"{d}/manifest.yaml"
        doc = fetch_manifest(mp)
        staged = os.path.join(STAGING, d, "qp.pdf")
        prev = None
        for m in doc.get("materials", []):
            if m.get("path") == "qp.pdf":
                prev = m.get("sha256")
        repin(doc, "qp.pdf", sha256_local(staged), os.path.getsize(staged),
              orig_name=f"{sess.replace('-',' ')} QP.pdf (PMT base, no R)",
              src_note="replacement fetched from PMT base (non-R) file; cover print-verified 4PH1/%s with R absent" % paper)
        add_repair(doc, "qp.pdf replaced: dir held regional-variant bytes printing 4PH1/%sR; genuine base QP placed (F10 class, physics cure)" % paper,
                   prev=prev, src=PMT_PHYS + f"New-Spec-Paper-{paper[0]}/QP/")
        manifest_ops[mp] = emit(mp, doc)

# ---------- B. 4PH0 P dirs + new R dirs ----------
for yr in (2014, 2015, 2016, 2017, 2018):
    for paper in ("1P", "2P"):
        d = f"past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/{yr}-06/4PH0-{paper}"
        mp = f"{d}/manifest.yaml"
        doc = fetch_manifest(mp)
        staged = os.path.join(STAGING, d, "qp.pdf")
        prev = None
        for m in doc.get("materials", []):
            if m.get("path") == "qp.pdf":
                prev = m.get("sha256")
        repin(doc, "qp.pdf", sha256_local(staged), os.path.getsize(staged),
              orig_name=f"June {yr} QP - Paper {paper} Edexcel Physics IGCSE.pdf",
              src_note="replacement fetched from PMT legacy base (non-R) file; cover print-verified 4PH0/%s with R absent" % paper)
        add_repair(doc, "qp.pdf replaced: dir held regional-variant bytes printing 4PH0/%sR; R bytes preserved in new 4PH0-%sR dir" % (paper, paper),
                   prev=prev, src=PMT_PHYS + f"Paper-{paper[0]}/")
        manifest_ops[mp] = emit(mp, doc)
        # R dir manifest
        rdir = f"past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/{yr}-06/4PH0-{paper}R"
        rmp = f"{rdir}/manifest.yaml"
        rdoc = {
            "paper_id": f"pearson-edexcel:international-gcse:physics:4ph0:{yr}-06:4PH0/{paper}R",
            "exam_board": {"id": "pearson-edexcel", "name": "Pearson Edexcel"},
            "qualification": {"family": "international-gcse", "name": "International GCSE"},
            "subject": "physics",
            "specification": {"folder": "4ph0", "title": "Edexcel International GCSE Physics (4PH0)"},
            "series": {"normalized": f"{yr}-06", "year": str(yr), "session_month": "06",
                       "printed": f"June {yr}", "source": "cover-print-verified at repair"},
            "paper": {"official_reference": f"4PH0/{paper}R", "unit_code": "4PH0", "paper_number_variant": f"{paper}R"},
            "materials": [{
                "type": "question-paper", "path": "qp.pdf",
                "sha256": sha256_of_tree_blob(f"past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/{yr}-06/4PH0-{paper}/qp.pdf"),
                "size_bytes": None,
                "original_filename": f"June {yr} (R) QP - Paper {paper} Edexcel Physics IGCSE.pdf",
                "source": {"source_type": "third-party-archive", "archive": "PhysicsAndMathsTutor.com",
                            "note": "bytes unchanged; regional-variant scan previously occupying the 4PH0-%s dir" % paper},
            }],
            "identification": {"methods": ["pdf_text"], "confidence_rank": 0,
                                "printed_references_seen": [f"4PH0/{paper}R"],
                                "session_printed": f"June {yr}",
                                "notes": [f"R bytes moved out of 4PH0-{paper} dir by {TAG} (4CH0-repair precedent)"]},
            "ingestion": {"agent": "SyllabAI ingestion agent", "run_date": "2026-09-26",
                           "source_repo": "SyllabAI/syllabai-pastpapers (internal move)",
                           "verification_status": "AI-IDENTIFIED"},
        }
        # fill size from the moved blob (downloaded during sweep)
        local = os.path.join(UP, "inspect", "sha_" + f"past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/{yr}-06/4PH0-{paper}/qp.pdf".replace("/", "_"))
        if os.path.exists(local):
            rdoc["materials"][0]["size_bytes"] = os.path.getsize(local)
        if paper == "2P" and yr == 2014:
            ms_local_tree = f"past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/2014-06/4PH0-2P/ms.pdf"
            ms_blob = os.path.join(UP, "inspect", "sha_" + ms_local_tree.replace("/", "_"))
            rdoc["materials"].append({
                "type": "mark-scheme", "path": "ms.pdf",
                "sha256": sha256_of_tree_blob(ms_local_tree),
                "size_bytes": os.path.getsize(ms_blob) if os.path.exists(ms_blob) else None,
                "original_filename": "June 2014 (R) MS - Paper 2P Edexcel Physics IGCSE.pdf",
                "source": {"source_type": "third-party-archive", "archive": "PhysicsAndMathsTutor.com",
                            "note": "bytes unchanged; regional-variant MS previously occupying the 4PH0-2P dir"},
            })
        manifest_ops[rmp] = emit(rmp, rdoc)

# 2014-06/4PH0-2P ms re-pin (in main dir manifest — already re-fetched above; repin ms too)
mp = "past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/2014-06/4PH0-2P/manifest.yaml"
dest = os.path.join(NEWBLOBS, mp)
doc = yaml.safe_load(open(dest))
staged_ms = os.path.join(STAGING, "past-papers/pearson-edexcel/international-gcse/physics/4ph0/past-papers/2014-06/4PH0-2P/ms.pdf")
prev = None
for m in doc.get("materials", []):
    if m.get("path") == "ms.pdf":
        prev = m.get("sha256")
repin(doc, "ms.pdf", sha256_local(staged_ms), os.path.getsize(staged_ms),
      orig_name="June 2014 MS - Paper 2P Edexcel Physics IGCSE.pdf",
      src_note="replacement from PMT legacy base file; prints June 2014 (4PH0) Paper 2P")
add_repair(doc, "ms.pdf replaced: held R-generation MS; base MS placed", prev=prev, src=PMT_PHYS + "Paper-2/")
manifest_ops[mp] = emit(mp, doc)

json.dump(manifest_ops, open(f"{UP}/manifest_ops.json", "w"), indent=1)
print(f"manifest ops so far: {len(manifest_ops)}")
