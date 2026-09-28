#!/usr/bin/env python3
"""
Final evidence batch:
  G. Specimen rows: confirm the 15 specimen recon questions live in the 4CH1
     specimen QPs (corpus specimen/4CH1-1C + 4CH1-2C), incl. footer totals.
  H. 2021-01 4CH1-1CR: confirm the sibling-only null-number part ("Name a
     mixture.", qn 1c between 1b and 1d) really sits in that paper's Q1.
"""
import subprocess
import tempfile
from pathlib import Path
import re

RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/past-papers/pearson-edexcel/international-gcse/chemistry/4ch1"

PROBES = {
    ("specimen", "4CH1-1C"): [
        ("Q4 rusting", "percentage by volume of oxygen in air"),
        ("Q4 rusting", "rusting of iron"),
        ("Q4c anomalous", "causes of anomalous results"),
        ("Q6 group1", "small piece of sodium is added to a large volume of water"),
        ("Q6d potassium", "piece of potassium is added to a large volume"),
        ("Q6e rubidium", "reaction of rubidium with water"),
        ("Q5 displacement", "added to copper(II) sulfate solution"),
        ("Q5b EFGH", "same method three times"),
        ("Q7 hydrocarbons", "Fuels used in cars often have sulfur compounds"),
    ],
    ("specimen", "4CH1-2C"): [
        ("Q4 white solid", "white solid in an unlabelled beaker"),
        ("Q3 halogens", "Astatine, bromine, chlorine, fluorine and iodine"),
        ("Q3b solid halogen", "halogen that is a solid at room temperature"),
        ("Q3c seawater", "bubbled into sea water"),
        ("Q3d BF3", "covalent compound that has the molecular formula BF"),
    ],
    ("2021-01", "4CH1-1CR"): [
        ("Q1c name a mixture", "Name a mixture"),
        ("Q1 elements", "This question is about elements"),
    ],
}


def fetch(session: str, d: str) -> str:
    infix = "specimen" if session == "specimen" else f"past-papers/{session}"
    url = f"{RAW}/{infix}/{d}/qp.pdf"
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        r = subprocess.run(["curl", "-fsSL", "--max-time", "60", url, "-o", tf.name], capture_output=True)
        assert r.returncode == 0, url
        t = subprocess.run(["pdftotext", "-q", tf.name, "-"], capture_output=True, text=True)
        Path(tf.name).unlink(missing_ok=True)
        return t.stdout


def segments(text: str):
    marks = [(m.start(), int(m.group(1)), int(m.group(2))) for m in
             re.finditer(r"Total for Question (\d+) = (\d+) mark", text)]
    segs, prev = [], 0
    for pos, n, m in marks:
        segs.append((n, m, text[prev:pos]))
        prev = pos
    return segs


def main() -> None:
    for (session, d), probes in PROBES.items():
        t = fetch(session, d)
        segs = segments(t)
        print(f"== {session}/{d}  footers: {dict((n, m) for n, m, s in segs)}")
        for tag, phrase in probes:
            where = [n for n, m, s in segs if phrase in s]
            print(f"   {tag:20s} {phrase[:52]!r:56s} -> Q{where if where else 'ABSENT'}")
        print()


if __name__ == "__main__":
    main()
