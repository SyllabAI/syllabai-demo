#!/usr/bin/env python3
"""
download_4ph0_r.py — bulk-download the missing 4PH0 R-variant (1PR/2PR) QP+MS
from Pearson content-dam into the canonical corpus layout, with sha256 +
cover-print verification (identity + duration attestation).

Input:  upload/4ph0_r_rows.json (from the Pearson DAM physics subject listing)
Layout: upload/4ph0_r/past-papers/pearson-edexcel/international-gcse/physics/4ph0/
          past-papers/<YYYY-MM>/<4PH0-1PR|4PH0-2PR>/{qp.pdf,ms.pdf}
Report: upload/4ph0_r_download_report.json
"""
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

UPLOAD = Path(__file__).resolve().parent.parent / "upload"
ROWS = UPLOAD / "4ph0_r_rows.json"
DEST = UPLOAD / "4ph0_r" / "past-papers" / "pearson-edexcel" / "international-gcse" / "physics" / "4ph0" / "past-papers"
REPORT = UPLOAD / "4ph0_r_download_report.json"

SESSION_MAP = {"january": "01", "june": "06", "november": "11", "mayjune": "06", "october": "10"}
TYPE_MAP = {"question-paper": ("qp.pdf", "qp"), "mark-scheme": ("ms.pdf", "ms")}

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"


def norm_session(s: str) -> str | None:
    m = re.match(r"([A-Za-z]+)-?(\d{4})", s)
    if not m:
        return None
    mm = SESSION_MAP.get(m.group(1).lower())
    return f"{m.group(2)}-{mm}" if mm else None


def fetch(url: str, dest: Path, retries: int = 3) -> tuple[bool, str]:
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
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
        refs = sorted(set(re.findall(r"4[SP]C0/\w+|4PH0/\w+", txt)))
        session = None
        ms = re.search(r"(January|June|November)\s+(20\d\d)", txt)
        if ms:
            session = f"{ms.group(1)} {ms.group(2)}"
        minutes = None
        dur = re.search(r"Time[:\s]+(\d+)\s*hour", txt, re.I)
        if dur:
            minutes = int(dur.group(1)) * 60
            m2 = re.search(r"Time[:\s]+(\d+)\s*hours?\s*(?:and\s*|,\s*)?(\d+)\s*min", txt, re.I)
            if m2:
                minutes = int(m2.group(1)) * 60 + int(m2.group(2))
        total = re.search(r"TOTAL FOR PAPER IS\s*(\d+)", txt, re.I)
        double = bool(re.search(r"double\s*award|science\s*\(double", txt, re.I))
        return {
            "pages": len(r.pages),
            "textChars": len(txt),
            "refs": refs,
            "sessionPrinted": session,
            "durationMin": minutes,
            "paperTotalPrint": int(total.group(1)) if total else None,
            "doubleAwardMention": double,
        }
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:200]}


def main() -> None:
    rows = json.loads(ROWS.read_text())
    report: list[dict] = []
    seen: set[tuple[str, str, str]] = set()

    for row in rows:
        series = row.get("series") or ""
        typ = (row.get("type") or "").lower()
        url = row.get("url") or ""
        if url.startswith("/"):
            url = "https://qualifications.pearson.com" + urllib.parse.quote(url)
        if typ not in TYPE_MAP or not url:
            report.append({"series": series, "type": typ, "url": url, "status": "skipped-row"})
            continue
        session = norm_session(series)
        if not session:
            report.append({"series": series, "type": typ, "status": "bad-series"})
            continue
        # paper variant from the DAM filename: 4PH0_1PR_que_20180523.pdf → 1PR
        # (2014 files use dash-style names: Question-paper-Paper-1PR-June-2014.pdf)
        fname = url.split("/")[-1]
        m = re.match(r"4PH0_(1PR|2PR)_(?:que|rms|msc)_", fname, re.I) or re.match(
            r"(?:Question-paper|Mark-scheme)-Paper-(1PR|2PR)-", fname, re.I
        )
        if not m:
            report.append({"series": series, "type": typ, "url": url, "status": "not-R-variant"})
            continue
        variant = m.group(1).upper()
        fname_out, kind = TYPE_MAP[typ]
        key = (session, variant, kind)
        if key in seen:
            continue
        seen.add(key)

        ddir = DEST / session / f"4PH0-{variant}"
        ddir.mkdir(parents=True, exist_ok=True)
        dest = ddir / fname_out
        ok, note = fetch(url, dest)
        entry = {
            "session": session,
            "variant": variant,
            "kind": kind,
            "source_url": url.split("?")[0],
            "dest": str(dest.relative_to(UPLOAD.parent)),
            "status": "ok" if ok else "fail",
            "note": note,
        }
        if ok:
            entry["sha256"] = hashlib.sha256(dest.read_bytes()).hexdigest()
            entry["bytes"] = dest.stat().st_size
            entry["cover"] = cover_print(dest)
        report.append(entry)
        print(f"[{entry['status']}] {session} {variant} {kind} — {note}")
        time.sleep(0.4)

    REPORT.write_text(json.dumps(report, indent=2))
    ok_n = sum(1 for r in report if r.get("status") == "ok")
    fail_n = sum(1 for r in report if r.get("status") == "fail")
    print(f"\nDONE ok={ok_n} fail={fail_n} report={REPORT}")


if __name__ == "__main__":
    main()
