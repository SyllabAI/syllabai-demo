#!/usr/bin/env python3
"""
download_4sd0.py — bulk-download 4SD0 QP+MS from Pearson qualifications content-dam
into the canonical corpus layout, with sha256 + cover-print verification.

Input:  upload/4sd0_rows.json (from the Pearson course-materials listing)
Layout: upload/4sd0/past-papers/pearson-edexcel/international-gcse/science-double-award/4sd0/
          past-papers/<YYYY-MM>/<4SD0-1C>/{qp.pdf,ms.pdf}
Report: upload/4sd0_download_report.json
"""
import hashlib
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

UPLOAD = Path(__file__).resolve().parent.parent / "upload"
ROWS = UPLOAD / "4sd0_rows.json"
DEST = UPLOAD / "4sd0" / "past-papers" / "pearson-edexcel" / "international-gcse" / "science-double-award" / "4sd0" / "past-papers"
REPORT = UPLOAD / "4sd0_download_report.json"

SESSION_MAP = {"january": "01", "june": "06", "november": "11", "mayjune": "06", "october": "10"}
TYPE_MAP = {"question-paper": "qp.pdf", "mark-scheme": "ms.pdf"}

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"


def norm_session(s: str) -> str | None:
    m = re.match(r"([A-Za-z]+) (\d{4})", s)
    if not m:
        return None
    mm = SESSION_MAP.get(m.group(1).lower())
    return f"{m.group(2)}-{mm}" if mm else None


def fetch(url: str, dest: Path, retries: int = 3) -> tuple[bool, str]:
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                data = r.read()
            if not data.startswith(b"%PDF"):
                return False, f"not-PDF ({data[:20]!r})"
            dest.write_bytes(data)
            return True, f"{len(data)}b"
        except Exception as e:  # noqa: BLE001
            if attempt == retries:
                return False, f"error after {retries}: {e}"
            time.sleep(1.5 * attempt)
    return False, "unreachable"


def cover_print(path: Path) -> dict:
    """Extract identity evidence from page 1-2 text."""
    try:
        from pypdf import PdfReader

        r = PdfReader(str(path))
        txt = "\n".join((r.pages[i].extract_text() or "") for i in range(min(2, len(r.pages))))
        refs = sorted(set(re.findall(r"4SD0/\w+", txt)))
        session = None
        ms = re.search(r"(January|June|November)\s+(20\d\d)", txt)
        if ms:
            session = f"{ms.group(1)} {ms.group(2)}"
        dur = re.search(r"Time[:\s]+(\d+)\s*hour", txt, re.I)
        minutes = None
        if dur:
            minutes = int(dur.group(1)) * 60
            m2 = re.search(r"Time[:\s]+(\d+)\s*hours?\s*(?:and\s*|,\s*)?(\d+)\s*min", txt, re.I)
            if m2:
                minutes = int(m2.group(1)) * 60 + int(m2.group(2))
        total = re.search(r"TOTAL FOR PAPER IS\s*(\d+)", txt, re.I)
        return {
            "pages": len(r.pages),
            "textChars": len(txt),
            "refs": refs,
            "sessionPrinted": session,
            "durationMin": minutes,
            "paperTotalPrinted": int(total.group(1)) if total else None,
        }
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


def main() -> None:
    rows = json.loads(ROWS.read_text())
    wanted = [r for r in rows if r["type"] in TYPE_MAP]
    print(f"{len(wanted)} QP/MS rows to fetch (of {len(rows)})")
    report = []
    ok = fail = 0
    for i, r in enumerate(wanted):
        session = norm_session(r["session"])
        if not session:
            report.append({**r, "status": "bad-session"})
            fail += 1
            continue
        d = DEST / session / f"4SD0-{r['paper'].upper()}"
        d.mkdir(parents=True, exist_ok=True)
        dest = d / TYPE_MAP[r["type"]]
        if dest.exists() and dest.stat().st_size > 10000:
            status, info = True, f"cached {dest.stat().st_size}b"
        else:
            status, info = fetch(r["url"], dest)
        if status:
            ok += 1
            h = hashlib.sha256(dest.read_bytes()).hexdigest()
            vp = cover_print(dest) if r["type"] == "question-paper" else {}
            report.append(
                {
                    **r,
                    "status": "ok",
                    "path": str(dest.relative_to(UPLOAD.parent)),
                    "sha256": h,
                    "bytes": dest.stat().st_size,
                    "verify": vp,
                }
            )
            v = vp.get("refs"), vp.get("sessionPrinted")
            print(f"[{i+1}/{len(wanted)}] {session} {r['paper']} {r['type']} {info} print={v}")
        else:
            fail += 1
            report.append({**r, "status": info})
            print(f"[{i+1}/{len(wanted)}] FAIL {session} {r['paper']} {r['type']}: {info}")
        time.sleep(0.25)

    REPORT.write_text(json.dumps(report, indent=1))
    print(f"\nDONE ok={ok} fail={fail} → {REPORT}")
    # summary of verification gaps
    no_text = [r for r in report if r.get("status") == "ok" and r["type"] == "question-paper" and (r.get("verify", {}).get("textChars", 0) or 0) < 50]
    ref_mismatch = [r for r in report if r.get("status") == "ok" and r["type"] == "question-paper" and r.get("verify", {}).get("refs") and f"4SD0/{r['paper'].upper()}" not in r["verify"]["refs"]]
    print(f"image-only QPs (no text): {len(no_text)}")
    print(f"ref mismatches: {len(ref_mismatch)}")
    for r in ref_mismatch:
        print("  !!", r["session"], r["paper"], r["verify"]["refs"])
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
