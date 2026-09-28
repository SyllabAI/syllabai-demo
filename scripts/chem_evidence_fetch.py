#!/usr/bin/env python3
"""
External attestation for the double-award chemistry date-pass strays.

Downloads the candidate 4CH1 QPs from the corpus (raw.githubusercontent) and
pdftotext-searches distinctive phrases so every normalized value is pinned to
the paper that actually prints the question — no guessing (worklog protocol).

Strays to resolve:
  A titration Q4      Ja202C x3 (2+4+3=9)      -> 2C or 2CR (Jan 2020)?
  B crude-oil Q2-ish  Ja202R x4 + Ja202C x2    -> 2C, 2CR, or mixed?
  C elements Q1       Ja202C x2 + Ja202R x1    -> 1C/2C/1CR/2CR?
  D ionic Q6e         Ja42 (siblings Jan1C)    -> same paper as siblings?
  E reactivity 3c     bare 'Ja' (siblings Ja1C, image slug 2020-ja1c-q3c) -> confirm 1C
  F alkenes 3c        date '202' (siblings Nov1CR) -> confirm Nov 2020 1CR
"""
import subprocess
import sys
import tempfile
from pathlib import Path

RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/past-papers/pearson-edexcel/international-gcse/chemistry/4ch1/past-papers"

PAPERS = [
    ("2020-01", "4CH1-1C"),
    ("2020-01", "4CH1-1CR"),
    ("2020-01", "4CH1-2C"),
    ("2020-01", "4CH1-2CR"),
    ("2020-11", "4CH1-1CR"),
    ("2022-01", "4CH1-1C"),
    ("2022-01", "4CH1-1CR"),
    ("2022-01", "4CH1-2C"),
    ("2022-01", "4CH1-2CR"),
]

PROBES = {
    "A titration (Ja202C Q4)": ["16.70", "sulfuric acid neutralis"],
    "B crude oil (Ja202C/R)": ["kerosene", "refinery gas", "C11H24"],
    "C elements (Ja202C/R Q1)": ["lilac", "black ink"],
    "D ionic peroxide (Ja42 6e)": ["sodium peroxide"],
    "E reactivity 3c (Ja 1C?)": ["aluminium powder", "iron(III) oxide"],
    "F alkenes 3c (202->2020?)": ["chloromethane"],
}


def fetch(session: str, d: str) -> str | None:
    url = f"{RAW}/{session}/{d}/qp.pdf"
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        r = subprocess.run(
            ["curl", "-fsSL", "--max-time", "60", url, "-o", tf.name],
            capture_output=True,
        )
        if r.returncode != 0:
            return None
        t = subprocess.run(
            ["pdftotext", "-q", tf.name, "-"], capture_output=True, text=True
        )
        Path(tf.name).unlink(missing_ok=True)
        return t.stdout


def main() -> None:
    texts: dict[tuple[str, str], str] = {}
    for session, d in PAPERS:
        t = fetch(session, d)
        ok = t is not None and len(t) > 500
        print(f"fetch {session} {d}: {'OK' if ok else 'FAILED/thin'} ({0 if not t else len(t)} chars)")
        if ok:
            texts[(session, d)] = t

    print()
    for label, phrases in PROBES.items():
        print(f"== {label}")
        for phrase in phrases:
            hits = []
            for (session, d), t in sorted(texts.items()):
                n = t.count(phrase)
                if n:
                    hits.append(f"{session}/{d} x{n}")
            print(f"   {phrase!r}: {', '.join(hits) if hits else 'NO HITS'}")
    print()


if __name__ == "__main__":
    sys.exit(main())
