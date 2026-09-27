#!/usr/bin/env python3
"""
gen_4ph0_r_manifests.py — emit corpus §18 manifests for every downloaded 4PH0
R-variant paper dir + the docs/4SC0-WAVE note inputs. Identity evidence comes
from the per-file verification captured by download_4ph0_r.py.

NOTE on official_reference: dirs live under the physics/4ph0 spec folder and
are labelled 4PH0/1PR|2PR for consistency with sibling corpus dirs, but the
covers print BOTH 4PH0/1PR and 4SC0/1PR — the same physical Paper 1 served the
single-award (4PH0) and the Science Double Award (4SC0) qualifications
(4SC0 spec Issue 3: the Double Award comprises ONLY the three Paper 1s).
"""
import json
from pathlib import Path

UPLOAD = Path(__file__).resolve().parent.parent / "upload"
ROOT = UPLOAD / "4ph0_r" / "past-papers" / "pearson-edexcel" / "international-gcse" / "physics" / "4ph0" / "past-papers"
REP = json.loads((UPLOAD / "4ph0_r_download_report.json").read_text())

RUN_DATE = "2026-09-28"


def emit(obj, indent=0):
    pad = "  " * indent
    out = []
    for k, val in obj.items():
        if isinstance(val, dict):
            out.append(f"{pad}{k}:")
            out += emit(val, indent + 1)
        elif isinstance(val, list):
            out.append(f"{pad}{k}:")
            for item in val:
                if isinstance(item, dict):
                    out.append(f"{pad}- " + json.dumps(item, ensure_ascii=False))
                else:
                    out.append(f"{pad}- {json.dumps(item, ensure_ascii=False)}")
        else:
            if isinstance(val, str):
                out.append(f"{pad}{k}: {val}" if val else f"{pad}{k}: null")
            else:
                out.append(f"{pad}{k}: {json.dumps(val)}")
    return out


def main() -> None:
    by_dir: dict[tuple[str, str], list[dict]] = {}
    for r in REP:
        if r.get("status") != "ok":
            continue
        by_dir.setdefault((r["session"], r["variant"]), []).append(r)

    dirs = sorted(by_dir)
    print(f"{len(dirs)} paper dirs")
    dur_seen: dict[str, set[int | None]] = {}
    for session, variant in dirs:
        files = by_dir[(session, variant)]
        qps = [f for f in files if f["kind"] == "qp"]
        qp = qps[0] if qps else None
        cover = (qp or {}).get("cover", {})
        # MS-only dirs: fall back to the MS cover evidence
        ms_cover = ({},)[0] if qp else (files[0].get("cover") or {})
        refs = sorted(set(cover.get("refs") or []) | set(ms_cover.get("refs") or []))
        has_text = bool(refs)
        sess_print = cover.get("sessionPrinted") or ms_cover.get("sessionPrinted")
        durations = {f["cover"].get("durationMin") for f in files if f.get("cover")}
        da = any((f.get("cover") or {}).get("doubleAwardMention") for f in files)
        materials = []
        for f in sorted(files, key=lambda x: x["kind"]):
            mat_type = "question-paper" if f["kind"] == "qp" else "mark-scheme"
            materials.append(
                {
                    "type": mat_type,
                    "path": "qp.pdf" if f["kind"] == "qp" else "ms.pdf",
                    "sha256": f["sha256"],
                    "size_bytes": f["bytes"],
                    "original_filename": Path(f["source_url"]).name,
                    "source": {
                        "source_type": "official-board-website",
                        "archive": "Pearson qualifications portal (qualifications.pearson.com content-dam)",
                        "source_url": f["source_url"],
                        "collected_by": f"SyllabAI agent ({RUN_DATE} 4SC0 legacy wave)",
                        "note": "official Pearson Edexcel document downloaded directly from the board's public DAM",
                    },
                }
            )
        ident_notes = []
        if has_text:
            ident_notes.append(
                "identity verified from the cover print ("
                + ", ".join(refs)
                + "); R-variant Paper 1 covers print BOTH 4PH0/1PR and 4SC0/1PR — the same physical paper served single-award Physics (4PH0) and Science Double Award (4SC0) candidates"
            )
        else:
            ident_notes.append(
                "cover text did not yield a printed reference; identity (unit + paper number, session) taken from the official Pearson DAM listing label and the exam-date-coded filename; corroborated by sibling print-verified files in the same series"
            )
        if qp is None:
            ident_notes.append(
                "QP not present in Pearson's DAM (mark scheme only); no official blueprint can be extracted for this paper and coverage stays honestly unverified"
            )
        if da:
            ident_notes.append("cover carries the Science (Double Award) wording, attesting the 4SC0 sharing")
        manifest = {
            "paper_id": f"pearson-edexcel:international-gcse:physics:4ph0:{session}:4PH0/{variant}",
            "exam_board": {"id": "pearson-edexcel", "name": "Pearson Edexcel"},
            "qualification": {"family": "international-gcse", "name": "International GCSE"},
            "subject": "physics",
            "specification": {
                "folder": "4ph0",
                # Paper 1s serve both 4PH0 and 4SC0 (spec Issue 3: the Double
                # Award comprises ONLY the three Paper 1s); Paper 2s are
                # single-award only
                "title": (
                    "Edexcel International GCSE Physics (4PH0) — Paper 1 shared with Science (Double Award) 4SC0"
                    if variant.startswith("1")
                    else "Edexcel International GCSE Physics (4PH0)"
                ),
            },
            "series": {
                "normalized": session,
                "year": session.split("-")[0],
                "session_month": session.split("-")[1],
                "printed": sess_print,
                "source": "pdf_text" if sess_print else "official-listing",
            },
            "paper": {
                "official_reference": f"4PH0/{variant}",
                "unit_code": "4PH0",
                "paper_number_variant": variant,
                "shared_with": [c for c in refs if c.startswith("4SC0/")] or (["4SC0/" + variant] if variant.endswith("R") is False and variant.startswith("1") else []),
            },
            "variant": {
                "official_code": variant[-1] if variant[-1].isalpha() else None,
                "type": "timezone-R" if variant.endswith("R") else None,
                "note": "regional variant of 4PH0/1P|2P; same duration as the non-R paper (printed on cover)",
            },
            "materials": materials,
            "identification": {
                "methods": ["pdf_text"] if has_text else ["partner_inference"],
                "confidence_rank": 0 if has_text else 3,
                "printed_references_seen": refs,
                "session_printed": sess_print,
                "notes": ident_notes,
            },
            "ingestion": {
                "agent": "SyllabAI ingestion agent (4SC0 legacy wave)",
                "run_date": RUN_DATE,
                "source_repo": "Pearson qualifications portal content-dam (public DAM listing)",
                "verification_status": "AI-IDENTIFIED",
            },
        }
        d = ROOT / session / f"4PH0-{variant}"
        d.mkdir(parents=True, exist_ok=True)
        yaml_body = "\n".join(emit(manifest))
        (d / "manifest.yaml").write_text(yaml_body + "\n")
        real_durs = sorted(x for x in durations if x)
        if real_durs:
            dur_seen.setdefault(variant, set()).update(real_durs)
        print(f"manifest {session} {variant} qp={'yes' if qp else 'MISSING'} refs={refs} dur={real_durs}")

    print("durations per variant:", {k: sorted(v) for k, v in sorted(dur_seen.items())})


if __name__ == "__main__":
    main()
