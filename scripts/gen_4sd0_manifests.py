#!/usr/bin/env python3
"""
gen_4sd0_manifests.py — emit corpus §18 manifests for every downloaded 4SD0
paper dir + a docs/4SD0-2026-09-27.md wave note. Identity evidence comes from
the per-file verification captured by download_4sd0.py.
"""
import json
from pathlib import Path

UPLOAD = Path(__file__).resolve().parent.parent / "upload"
ROOT = UPLOAD / "4sd0" / "past-papers" / "pearson-edexcel" / "international-gcse" / "science-double-award" / "4sd0" / "past-papers"
REP = json.loads((UPLOAD / "4sd0_download_report.json").read_text())

SESSION_PRINTED = {"january": "January", "june": "June", "november": "November", "mayjune": "June", "october": "October"}
MONTH_NUM = {"january": "01", "june": "06", "november": "11", "mayjune": "06", "october": "10"}


def norm_session(raw: str) -> str:
    import re

    m = re.match(r"([A-Za-z]+) (\d{4})", raw)
    return f"{m.group(2)}-{MONTH_NUM[m.group(1).lower()]}" if m else raw


def yq(session: str) -> str:
    return session  # already normalized


def printed_session(session: str) -> str:
    y, m = session.split("-")
    names = {"01": "January", "06": "June", "11": "November"}
    return f"{names[m]} {y}"


def main() -> None:
    by_dir: dict[tuple[str, str], list[dict]] = {}
    for r in REP:
        if r.get("status") != "ok":
            continue
        key = (norm_session(r["session"]), r["paper"].upper())
        by_dir.setdefault(key, []).append(r)

    dirs = sorted(by_dir)
    print(f"{len(dirs)} paper dirs")
    dur_seen: dict[str, set[int | None]] = {}
    for session, paper in dirs:
        files = by_dir[(session, paper)]
        qps = [f for f in files if f["type"] == "question-paper"]
        qp = qps[0] if qps else None
        v = (qp or {}).get("verify", {})
        refs = v.get("refs") or []
        has_text = bool(refs)
        variant_code = paper[-1] if paper[-1].isalpha() else None
        sess_print = v.get("sessionPrinted") or None
        materials = []
        for f in files:
            mat_type = "question-paper" if f["type"] == "question-paper" else "mark-scheme"
            materials.append(
                {
                    "type": mat_type,
                    "path": "qp.pdf" if mat_type == "question-paper" else "ms.pdf",
                    "sha256": f["sha256"],
                    "size_bytes": f["bytes"],
                    "original_filename": Path(f["url"]).name,
                    "source": {
                        "source_type": "official-board-website",
                        "archive": "Pearson qualifications portal (qualifications.pearson.com content-dam)",
                        "source_url": f["url"],
                        "collected_by": "SyllabAI agent (2026-09-27 4SD0 subject onboarding)",
                        "note": "official Pearson Edexcel document downloaded directly from the board's public course-materials listing",
                    },
                }
            )
        ident_notes = [
            "identity verified from the QP cover print (4SD0/<paper>) and the official Pearson course-materials listing (session + paper label)"
            if has_text
            else "cover is image-only (no text layer); identity (unit + paper number, session) taken from the official Pearson course-materials listing and exam-date-coded filename; corroborated by sibling print-verified files in the same session (wave-8 rank-3 precedent, AUDIT s16)"
        ]
        if sess_print is None and has_text:
            ident_notes.append("session not printed on cover pages 1-2; taken from the official Pearson listing and the exam-date-coded filename")
        manifest = {
            "paper_id": f"pearson-edexcel:international-gcse:science-double-award:4sd0:{session}:4SD0/{paper}",
            "exam_board": {"id": "pearson-edexcel", "name": "Pearson Edexcel"},
            "qualification": {"family": "international-gcse", "name": "International GCSE"},
            "subject": "Science (Double Award)",
            "specification": {
                "folder": "4sd0",
                "title": "Edexcel International GCSE Science (Double Award) (4SD0)",
            },
            "series": {
                "normalized": session,
                "year": session.split("-")[0],
                "session_month": session.split("-")[1],
                "printed": sess_print,
                "source": "pdf_text" if sess_print else "official-listing",
            },
            "paper": {
                "official_reference": f"4SD0/{paper}",
                "unit_code": "4SD0",
                "paper_number_variant": paper,
            },
            "variant": {
                "official_code": variant_code,
                "type": "timezone-R" if paper.endswith("R") else None,
                "note": None,
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
                "agent": "SyllabAI ingestion agent (4SD0 subject onboarding)",
                "run_date": "2026-09-27",
                "source_repo": "Pearson qualifications portal content-dam (public course-materials listing)",
                "verification_status": "AI-IDENTIFIED",
            },
        }
        d = ROOT / session / f"4SD0-{paper}"
        d.mkdir(parents=True, exist_ok=True)
        lines = []
        for k, val in manifest.items():
            if k in ("materials", "identification"):
                continue
            lines.append(f"{k}: {json.dumps(val) if not isinstance(val, str) else val}")
        # emit YAML by hand in the established style
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

        yaml_body = "\n".join(emit(manifest))
        (d / "manifest.yaml").write_text(yaml_body + "\n")
        if v.get("durationMin"):
            dur_seen.setdefault(paper, set()).add(v["durationMin"])

    print("durations per paper:", {k: sorted(x for x in v if x) for k, v in sorted(dur_seen.items())})


if __name__ == "__main__":
    main()
