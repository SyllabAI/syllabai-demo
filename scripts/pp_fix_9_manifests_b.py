#!/usr/bin/env python3
"""Part 4b: remaining manifest generation (fills, renames, new dirs, moved dirs)."""
import hashlib, json, os, urllib.request, urllib.parse
import yaml

UP = "/home/z/my-project/upload"
STAGING = f"{UP}/staging"
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

def sha256_of_tree_blob(tree_path):
    dest = os.path.join(UP, "inspect", "sha_" + tree_path.replace("/", "_"))
    if not os.path.exists(dest):
        req = urllib.request.Request(RAW + urllib.parse.quote(tree_path), headers=UA)
        try:
            with urllib.request.urlopen(req, timeout=90) as r, open(dest, "wb") as f:
                f.write(r.read())
        except Exception as e:
            raise SystemExit(f"FETCH FAIL {tree_path}: {e}")
    return hashlib.sha256(open(dest, "rb").read()).hexdigest()

def add_material(doc, mtype, path, sha, size, orig, src_dict):
    doc["materials"] = [m for m in doc.get("materials", []) if m.get("path") != path]
    doc["materials"].append({"type": mtype, "path": path, "sha256": sha, "size_bytes": size,
                             "original_filename": orig, "source": src_dict})
    doc["materials"].sort(key=lambda m: (0 if m["type"] == "mark-scheme" else 1))
    return doc

def add_repair(doc, action, prev=None, src=None, note=None):
    r = {"wave": TAG, "action": action}
    if prev: r["previous_sha256"] = prev
    if src: r["replacement_source"] = src
    if note: r["note"] = note
    doc.setdefault("repair", []).append(r)
    return doc

COVID = ("November-2020/October-2020 COVID sitting administered the June-printed papers; "
         "bytes moved unchanged from the phantom 2020-06 dir (P-code/ratio verified)")

# ---------- C. 4ph1 2020-11 dirs (1PR, 2PR qp moved-in; 2P qp new staged) ----------
d = "past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2020-11"
mp = f"{d}/4PH1-1PR/manifest.yaml"
doc = fetch_manifest(mp)
SRC1 = "past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2020-06/4PH1-1PR/qp.pdf"
sha = sha256_of_tree_blob(SRC1)
size = os.path.getsize(os.path.join(UP, "inspect", "sha_" + SRC1.replace("/", "_")))
add_material(doc, "question-paper", "qp.pdf", sha, size, "June 2020 (R) QP.pdf (P65065A)",
             {"source_type": "internal-move", "note": COVID})
add_repair(doc, "qp.pdf filled from phantom 2020-06/4PH1-1PR (same printed paper P65065A)")
manifest_ops[mp] = emit(mp, doc)

mp = f"{d}/4PH1-2PR/manifest.yaml"
doc = fetch_manifest(mp)
SRC2 = "past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2020-06/4PH1-2PR/qp.pdf"
sha = sha256_of_tree_blob(SRC2)
size = os.path.getsize(os.path.join(UP, "inspect", "sha_" + SRC2.replace("/", "_")))
add_material(doc, "question-paper", "qp.pdf", sha, size, "June 2020 (R) QP.pdf",
             {"source_type": "internal-move", "note": COVID})
add_repair(doc, "qp.pdf filled from phantom 2020-06/4PH1-2PR (same printed paper)")
manifest_ops[mp] = emit(mp, doc)

mp = f"{d}/4PH1-2P/manifest.yaml"
doc = fetch_manifest(mp)
staged = os.path.join(STAGING, f"{d}/4PH1-2P/qp.pdf")
add_material(doc, "question-paper", "qp.pdf", hashlib.sha256(open(staged, "rb").read()).hexdigest(),
             os.path.getsize(staged), "June 2020 QP.pdf (PMT base, no R)",
             {"source_type": "third-party-archive", "archive": "PhysicsAndMathsTutor.com",
              "note": "cover print-verified 4PH1/2P with 2PR absent"})
add_repair(doc, "qp.pdf filled from PMT June 2020 base file (November-2020 sitting administered June-printed papers)")
manifest_ops[mp] = emit(mp, doc)

# ---------- D. specimen / gce-maths fills ----------
# 4MB1-01 specimen: ms added
mp = "past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/specimen/4MB1-01/manifest.yaml"
doc = fetch_manifest(mp)
sha = sha256_of_tree_blob("_quarantine/unresolved-identity/IGCSE__Edexcel__Maths B__Paper 1__Specimen MS_2.pdf")
add_material(doc, "mark-scheme", "ms.pdf", sha, None, "Specimen MS_2.pdf (Paper 1 SAM mark scheme)",
             {"source_type": "quarantine-promotion",
              "note": "identity resolved this sweep: Paper 1 sample-assessment-material MS for first teaching Sept 2016"})
add_repair(doc, "ms.pdf promoted from _quarantine/unresolved-identity (identity resolved: 4MB1 Paper 1 SAM MS)")
manifest_ops[mp] = emit(mp, doc)

# 6678-01 / 6684-01 2018-06: qp added
for unit, qf, qname in [
    ("6678-01", "IAL__Edexcel__Pure Maths__M2__June 2018 QP_5.pdf", "M2 June 2018 QP_5.pdf (prints 6678/01)"),
    ("6684-01", "IAL__Edexcel__Pure Maths__S2__June 2018 QP_5.pdf", "S2 June 2018 QP_5.pdf (prints 6684/01)"),
]:
    mp = f"past-papers/pearson-edexcel/gce-a-level/mathematics/mathematics-modular/past-papers/2018-06/{unit}/manifest.yaml"
    doc = fetch_manifest(mp)
    sha = sha256_of_tree_blob(f"_quarantine/unresolved-identity/{qf}")
    add_material(doc, "question-paper", "qp.pdf", sha, None, qname,
                 {"source_type": "quarantine-promotion",
                  "note": "quarantined file's identity resolved by deep text extraction this sweep (prints June 2018 ref)"})
    add_repair(doc, f"qp.pdf promoted from quarantine (fills ledger-planned gap 2018-06 {unit.replace('-01','')}/01 qp)")
    manifest_ops[mp] = emit(mp, doc)

# ---------- E. fill-receiving administered-session dirs ----------
FILLS = [
    ("international-gcse/english-language-b/4eb1", "2020-11", "4EB1-01", "ms.pdf", "mark-scheme", "2020-06/4EB1-01/ms.pdf"),
    ("international-gcse/english-language-b/4eb1", "2020-11", "4EB1-01R", "qp.pdf", "question-paper", "2020-06/4EB1-01R/qp.pdf"),
    ("international-a-level/accounting/wac11", "2020-10", "WAC11-01", "qp.pdf", "question-paper", "2020-06/WAC11-01/qp.pdf"),
    ("international-a-level/accounting/wac12", "2020-10", "WAC12-01", "qp.pdf", "question-paper", "2020-06/WAC12-01/qp.pdf"),
    ("international-a-level/economics/wec11", "2020-10", "WEC11-01", "qp.pdf", "question-paper", "2020-06/WEC11-01/qp.pdf"),
    ("international-a-level/economics/wec12", "2020-10", "WEC12-01", "qp.pdf", "question-paper", "2020-06/WEC12-01/qp.pdf"),
    ("international-a-level/economics/wec13", "2020-10", "WEC13-01", "qp.pdf", "question-paper", "2020-06/WEC13-01/qp.pdf"),
    ("international-a-level/economics/wec14", "2020-10", "WEC14-01", "qp.pdf", "question-paper", "2020-06/WEC14-01/qp.pdf"),
    ("international-a-level/mathematics/mathematics-2018", "2020-10", "WFM01-01", "qp.pdf", "question-paper", "2020-06/WFM01-01/qp.pdf"),
    ("international-a-level/mathematics/mathematics-2018", "2020-10", "WFM02-01", "qp.pdf", "question-paper", "2020-06/WFM02-01/qp.pdf"),
    ("international-a-level/mathematics/mathematics-2018", "2020-10", "WFM03-01", "qp.pdf", "question-paper", "2020-06/WFM03-01/qp.pdf"),
    ("international-a-level/mathematics/mathematics-2018", "2020-10", "WST03-01", "qp.pdf", "question-paper", "2020-06/WST03-01/qp.pdf"),
]
for spec, sess, dirn, mat, mtype, src_rel in FILLS:
    d = f"past-papers/pearson-edexcel/{spec}/past-papers/{sess}/{dirn}"
    mp = f"{d}/manifest.yaml"
    doc = fetch_manifest(mp)
    if doc is None:
        print("NO MANIFEST for", mp, "- skipping (needs creation)")
        continue
    src_tree = f"past-papers/pearson-edexcel/{spec}/past-papers/{src_rel}"
    sha = sha256_of_tree_blob(src_tree)
    add_material(doc, mtype, mat, sha, None, f"2020-06 {dirn.split('-')[0]} {mat} (June-printed)",
                 {"source_type": "internal-move", "note": "bytes unchanged from the phantom 2020-06 dir; same sitting"})
    add_repair(doc, f"{mat} filled from phantom 2020-06 dir ({COVID})")
    manifest_ops[mp] = emit(mp, doc)

json.dump(manifest_ops, open(f"{UP}/manifest_ops.json", "w"), indent=1)
print(f"manifest ops now: {len(manifest_ops)}")
