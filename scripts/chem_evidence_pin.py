#!/usr/bin/env python3
"""
Per-part phrase pinning inside the attested 4CH1 QPs (follow-up to
chem_evidence_fetch.py). Splits pdftotext output on "Total for Question N"
footers, maps each recon part's distinctive phrase to its question segment,
and prints the footer totals for the 2020-01 2C paper (whose blueprint is
missing from pastpapers-blueprints.json).
"""
import subprocess
import tempfile
from pathlib import Path
import re

RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/past-papers/pearson-edexcel/international-gcse/chemistry/4ch1/past-papers"

PAPERS = [
    ("2020-01", "4CH1-2C"),
    ("2020-01", "4CH1-2CR"),
    ("2020-01", "4CH1-1C"),
    ("2022-01", "4CH1-1C"),
    ("2020-11", "4CH1-1CR"),
]

# label -> (probe list of (part-tag, phrase))
PROBES = {
    "2020-01/4CH1-2C": [
        ("titration 4a", "reaction between sodium hydroxide solution and dilute sulfuric acid"),
        ("titration 4b", "changes that the student could make to improve his plan"),
        ("titration 4c", "16.70"),
        ("crude 2a", "separate crude oil into fractions"),
        ("crude 2a(ii)?", "use of the kerosene fraction"),
        ("crude 2b", "refinery gas fraction is an alkane"),
        ("crude 2d", "gasoline fraction has the displayed formula"),
        ("crude 2e", "Name the catalyst used in catalytic cracking"),
        ("crude 2f", "can undergo cracking to give pentane"),
        ("elements 1a", "burns with a lilac flame"),
        ("elements 1b", "separate the mixture of colours in black ink"),
        ("elements 1c", "sodium chloride"),
    ],
    "2020-01/4CH1-2CR": [
        ("crude 2a (NEG)", "separate crude oil into fractions"),
        ("crude 2f (NEG)", "can undergo cracking to give pentane"),
        ("elements 1a (NEG)", "burns with a lilac flame"),
    ],
    "2020-01/4CH1-1C": [
        ("reactivity 3c", "aluminium powder with iron(III) oxide"),
    ],
    "2022-01/4CH1-1C": [
        ("ionic 6e", "sodium peroxide"),
        ("ionic 6a", "sodium oxide is heated"),
    ],
    "2020-11/4CH1-1CR": [
        ("alkenes 3c", "chloromethane"),
    ],
}


def fetch(session: str, d: str) -> str:
    url = f"{RAW}/{session}/{d}/qp.pdf"
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        r = subprocess.run(["curl", "-fsSL", "--max-time", "60", url, "-o", tf.name], capture_output=True)
        assert r.returncode == 0, url
        t = subprocess.run(["pdftotext", "-q", tf.name, "-"], capture_output=True, text=True)
        Path(tf.name).unlink(missing_ok=True)
        return t.stdout


def segments(text: str):
    """Split on footers 'Total for Question N = M marks'; return [(N, M, seg_text)]."""
    marks = [(m.start(), int(m.group(1)), int(m.group(2))) for m in
             re.finditer(r"Total for Question (\d+) = (\d+) mark", text)]
    segs = []
    prev = 0
    for pos, n, m in marks:
        segs.append((n, m, text[prev:pos]))
        prev = pos
    return segs


def main() -> None:
    texts = {}
    for session, d in PAPERS:
        texts[f"{session}/{d}"] = fetch(session, d)

    for key, probes in PROBES.items():
        t = texts[key]
        segs = segments(t)
        print(f"== {key}  ({len(segs)} question footers)")
        for tag, phrase in probes:
            where = [n for n, m, s in segs if phrase in s]
            raw_n = t.count(phrase)
            print(f"   {tag:16s} {phrase[:52]!r:56s} -> Q{where if where else ('top-matter?' if raw_n else 'ABSENT')} (raw {raw_n})")
        print()

    # footer totals for 2020-01 2C (blueprint missing) — cross-check recon marks
    segs = segments(texts["2020-01/4CH1-2C"])
    print("2020-01/4CH1-2C footers:", {n: m for n, m, s in segs})


if __name__ == "__main__":
    main()
