#!/usr/bin/env python3
"""Emit the repair document + updated ledger as blobs, then assemble the final payload."""
import csv, hashlib, io, json, os

UP = "/home/z/my-project/upload"
NEWBLOBS = f"{UP}/new_blobs"
TAG = "PP-FIX-2026-09-26"

d1 = json.load(open(f"{UP}/changeset_part1.json"))
d2 = json.load(open(f"{UP}/changeset_part2.json"))
OPS = json.load(open(f"{UP}/changeset_ops.json"))

def emit(path, text):
    dest = os.path.join(NEWBLOBS, path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "w").write(text)
    h = hashlib.sha1(); data = text.encode(); h.update(b"blob %d\0" % len(data)); h.update(data)
    return h.hexdigest()

DOC = f"""# REPAIR 2026-09-26 — corpus-wide identity verification sweep (physics cure, phantom 2020-06 merges, quarantine resolution)

Executes the corpus-wide cure of the F10 class (base paper dirs holding regional-variant bytes) plus a
full-tree content-level audit. Operator context: user-reported 1CR-QP-in-1C-dir (cured for chemistry by
REPAIR-2026-09-25); this sweep extends the verification to **all 9,955 QP/MS PDFs** in `past-papers/`
(download + cover-print extraction per file, OCR fallback for scans) and re-triages all 310 quarantined PDFs.

## 1. Content audit method
- Every qp.pdf/ms.pdf under `past-papers/` (9,955 files; specimen excluded) fetched from raw CDN,
  pages 1-3 text-extracted (PyMuPDF), printed paper references regex-extracted against the
  131-family known-code set, compared with the dir-derived identity. OCR (tesseract, page 1) for
  no-text-layer scans. Results: 3,197 clean text matches + 4,510 Cambridge dirs re-classified by the
  same rule (S20/W20 dir format) + 2,191 scans (no text layer; flagged, not verified) + 57 raw flags
  triaged to the fixes below / false positives.
- False positives investigated and NOT changed: Jan-2012 4CH0/4BI0/4PH0 MSs are the official
  dual-coverage (4CH0 + 4SC0) mark schemes; 6PH07/1 = 6PH07/01 padding; 4AC1/4BS1/4CM1/4EC1/4HB1/4IT1
  three-digit dirs hold papers genuinely printed 4AC1/021-style (COVID extra-sitting codes);
  4CP0 2A/2B/2C/012/01C/02C dirs carry Pearson's own onscreen-variant labels.

## 2. Physics IGCSE cure — base dirs held regional bytes (F10 class, 4CH0/4PH0 precedent)
### 2a. 4PH1 (16 QPs replaced; MSs were already correct)
Every June-session 4PH1-1P/2P dir held QP bytes printing `4PH1/1PR|2PR` (PMT "(R)" files). Genuine
base QPs (printing `4PH1/1P|2P`, R absent) fetched from PMT's base (non-R) files, print-verified,
sha-pinned. Sessions: 2019-06, 2020-01, 2021-01, 2022-01, 2022-06, 2023-01, 2023-06, 2024-06.
Displaced R scans -> `_quarantine/duplicate-artifact/` (the 1PR/2PR dirs already hold the
SME-sourced print-verified R QPs from wave 3).
### 2b. 4PH0 (11 files replaced; 8 new R dirs)
June 2014-2018 4PH0-1P/2P dirs held `(R)` bytes (original filenames literally "June YYYY (R) QP").
Base QPs (10) + June-2014 2P MS fetched from PMT legacy section, print-verified (2015-06 1P QP has a
broken text layer; OCR-verified: prints `KPH0/1P 4PH0/1P KSC0/1P 4SC0/1P`, Wed 20 May 2015).
Regional bytes preserved in NEW `4PH0-1PR/2PR` dirs per session (bytes unchanged, manifests created) —
no paper content lost (4CH0-repair precedent).

## 3. Phantom 2020-06 session merges (Edexcel; June-printed papers administered Nov/Oct 2020)
Extends the operator-ratified 4CH1 precedent corpus-wide, **evidence-gated per pair**:
printed Pearson P-codes compared between the 2020-06 file and its administered-session counterpart.
- **IGCSE -> 2020-11** (QP P-codes identical): 4MA1 ×8 (e.g. 1H P62652A), 4MB1 ×4, 4PM1 ×4,
  4CP0-01 (P61884R) + 4CP0-02 (P61885A = the 2020-11 2A paper), 4EB1-01/-01R, 4PH1 ×4 (§4).
  Jun QPs -> quarantine as duplicate scans; MS pairs text-ratio 0.998 (same document, different scan
  generation) -> jun copies quarantined, administered-session copies kept.
- **IAL -> 2020-10** (audit-doc §9 COVID rule; QP P-codes verified for WCH11-13 P6259x, WPH11-13
  P6259x/6462x, WMA11 P62597A): jun QPs of WCH11-13, WPH11-14, WMA11-14, WME01-02, WST01-02 ->
  quarantine (2020-10 holds the official que-file generation).
- **Fills (bytes moved unchanged, sessions relabelled)**: WAC11/01, WAC12/01, WEC11-14/01,
  WFM01-03/01, WST03/01 QPs and 4EB1-01 MS + 4EB1-01R QP moved from phantom 2020-06 dirs into the
  administered 2020-10/2020-11 dirs that lacked them (ledger-planned gaps closed).
- **Deliberately KEPT as 2020-06** (no administered counterpart exists in-scope; sources carry separate
  Nov-2020 papers): 4AC1, 4BA0, 4BI1, 4BS1, 4CM1, 4EC1, 4HB1, 4IT1 sessions and all Cambridge S20 dirs
  (Cambridge published the unsat June-2020 papers as a distinct set from November 2020).

## 4. Physics 2020-06 phantom (mirrors the 4CH1 cure, P-code verified)
- 2020-06/4PH1-1P qp was a second scan of the SAME regional paper as 2020-06/4PH1-1R (both P65065A).
- `2020-06/4PH1-1PR/qp.pdf` -> `2020-11/4PH1-1PR/qp.pdf`; same for 2PR (bytes unchanged).
- 2020-11/4PH1-2P/qp.pdf filled from PMT "June 2020 QP" (base; print-verified).
- 2020-11/4PH1-1P/qp.pdf verified clean (P65064A, prints 4PH1/1P) — untouched.
- 2020-06 4PH1 dirs deleted; remaining 6 files -> quarantine as duplicate scans/MS generations.

## 5. Session/label corrections
- `4EC1-021` moved 2019-06 -> **2021-11**: the paper prints plain 4EC1/02 with Pearson P-code P65899RA
  (November-2021 printing batch; sibling P65897RA already lives in 2021-11/4EC1-011; source filename
  "IGCSE_ECONOMICS_2021_Nov_P2_QP.pdf"). June-2019 session must not hold a 2021-printed paper.
- `WCH14-1/WCH15-1/WCH16-1` -> `WCH14-01/WCH15-01/WCH16-01` (2020-10): covers print WCHxx/01;
  manifests re-pinned with official_reference corrected. Only single-digit dir suffixes corpus-wide.

## 6. Quarantine resolution (all 310 PDFs deep-analysed: full-text + OCR + sha256)
### Promoted (7 files; bytes unchanged, manifests created/updated)
- `M2 June 2018 QP_5` -> `gce-a-level/mathematics/mathematics-modular/2018-06/6678-01/qp.pdf` (prints 6678/01)
- `S2 June 2018 QP_5` -> `.../2018-06/6684-01/qp.pdf` (prints 6684/01) — both close ledger-planned gaps
- `M2 Specimen QP_3/MS_3` -> `ial/mathematics/wma01/specimen/WME02-01/` (prints WME02/01 specimen)
- `Maths B Paper 1 Specimen MS_2` -> `igcse/mathematics-b/4mb1/specimen/4MB1-01/ms.pdf` (fills missing MS)
- `Maths B Paper 2 Specimen QP_2/MS_2` -> `4mb1/specimen/4MB1-02/` — identity CORRECTED: the resolver had
  bucketed both SAMs into the Paper-1 slot ("first teaching 2016" heuristic); the QP prints 4MB1/02 Paper 2.
### Reclassified: unresolved-identity -> duplicate-artifact (15 files)
M2/S2 QP_3 files (2014-2018) print WME02/01, WST02/01 and are sha256-identical to the live corpus QPs;
the Jan-2014 "(IAL) MS" is the 6663A/01 MS and is byte-identical to live `2014-01/6663A-01/ms.pdf`;
June 2016/2017 QP_5 files (6678/6684) are different-scan duplicates of live-verified papers.
### Reclassified: unresolved-identity -> out-of-scope-gce (19 files)
`wch03--2009..2013` + `wch01--2009-06--ms`: covers print UK GCE chemistry branding ("Edexcel GCE
Chemistry", 8CH01/6CH03 era, Summer 2009-Summer 2013); corpus carries WCH01-06 (2014+) only.
### Unchanged: duplicate-artifact (operator-ratified F24 records), nonstandard-artifact,
out-of-scope-gce, corrupt-artifact.

## 7. Provenance
- Every replaced/moved/pinned material re-pinned (sha256/size/original_filename) in its manifest with a
  `repair:` block carrying the wave tag, previous sha and source URL; YAML round-trip validated.
- Full-tree sha ledger validated pre-push: final tree 16,027 blobs (adds 162, dels 215), 0 missing
  manifests across all paper dirs, 0 op conflicts, all 2020-06 phantom dirs for merged specs absent,
  promoted files absent from quarantine.
- Audit artifacts: `workspace` staging outside the repo (content report 9,955 rows, quarantine analysis
  310 rows, P-code merge map, changeset ops 387 rows).

## 8. Follow-ups (not in this repair)
- 2,191 no-text-layer PDFs (mostly Cambridge scans) unverifiable by print extraction — sample-based OCR
  audit recommended, prioritised by duplicate-scan risk.
- 6PH01/02/04-01R 2011-01 dirs hold genuine R QPs but base-generation MSs (no R MS found on PMT;
  XtremePapers probe pending). Manifests annotated.
- November-2020 sittings for 4BI1/4EC1/4HB1/4BS1/4AC1/4CM1/4IT1/4BA0 (separate Nov-printed papers, e.g.
  PMT "November 2020 QP" for 4BI1) are corpus coverage gaps — next ingestion wave.
- Remaining file-gap ledger `planned` rows (GCE legacy units, IAL back-catalog) unchanged this wave.
"""

mpath = "docs/REPAIR-2026-09-26.md"
M = json.load(open(f"{UP}/manifest_ops.json"))
M[mpath] = emit(mpath, DOC)

# ---- ledger update: mark filled rows normalized ----
ledger_path = "docs/ledger/file-gap-sweep.csv"
import urllib.request, urllib.parse
raw = urllib.request.urlopen(urllib.request.Request(
    "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/" + urllib.parse.quote(ledger_path),
    headers={"User-Agent": "a"}), timeout=60).read().decode()
rows = list(csv.DictReader(io.StringIO(raw)))
fills = {
    ("gce-a-level", "mathematics", "mathematics-modular", "2018-06", "6678/01", "qp"): "normalized",
    ("gce-a-level", "mathematics", "mathematics-modular", "2018-06", "6684/01", "qp"): "normalized",
    ("international-a-level", "accounting", "wac11", "2020-10", "WAC11/01", "qp"): "normalized",
    ("international-a-level", "accounting", "wac12", "2020-10", "WAC12/01", "qp"): "normalized",
    ("international-a-level", "economics", "wec11", "2020-10", "WEC11/01", "qp"): "normalized",
    ("international-a-level", "economics", "wec12", "2020-10", "WEC12/01", "qp"): "normalized",
    ("international-a-level", "economics", "wec13", "2020-10", "WEC13/01", "qp"): "normalized",
    ("international-a-level", "economics", "wec14", "2020-10", "WEC14/01", "qp"): "normalized",
    ("international-a-level", "mathematics", "mathematics-2018", "2020-10", "WFM01/01", "qp"): "normalized",
    ("international-a-level", "mathematics", "mathematics-2018", "2020-10", "WFM02/01", "qp"): "normalized",
    ("international-a-level", "mathematics", "mathematics-2018", "2020-10", "WFM03/01", "qp"): "normalized",
    ("international-a-level", "mathematics", "mathematics-2018", "2020-10", "WST03/01", "qp"): "normalized",
    ("international-gcse", "english-language-b", "4eb1", "2020-11", "4EB1/01", "ms"): "normalized",
    ("international-gcse", "english-language-b", "4eb1", "2020-11", "4EB1/01R", "qp"): "normalized",
}
changed = 0
MERGED_2020 = {"mathematics-2018", "4ma1", "4mb1", "4pm1", "4cp0", "4ph1", "4eb1",
               "wac11", "wac12", "wec11", "wec12", "wec13", "wec14",
               "wch11", "wch12", "wch13", "wch14", "wch15", "wch16",
               "wph11", "wph12", "wph13", "wph14"}
for r in rows:
    k = (r["qualification"], r["subject"], r["spec_slug"], r["series"], r["paper_ref"], r["material_type"])
    if k in fills and r["status"] == "planned":
        r["status"] = fills[k]
        r["source_file_url"] = r.get("source_file_url") or "internal-move from phantom 2020-06 dir (PP-FIX-2026-09-26)"
        changed += 1
    elif r["status"] == "planned" and r["series"] == "2020-06" and r["spec_slug"] in MERGED_2020:
        r["status"] = "na:session-merged-2020-11"
        r["expected_identity"] = (r.get("expected_identity") or "") + " [session merged into administered Nov/Oct 2020 sitting by PP-FIX-2026-09-26]"
        changed += 1
buf = io.StringIO()
w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
w.writeheader()
w.writerows(rows)
print(f"ledger rows changed: {changed}")
M[ledger_path] = emit(ledger_path, buf.getvalue())

json.dump(M, open(f"{UP}/manifest_ops.json", "w"), indent=1)
print(f"manifest/new-blob ops total: {len(M)}")
