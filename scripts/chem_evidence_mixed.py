#!/usr/bin/env python3
"""
Contradiction probes for the 5 mixed-paper questions found during the
chemistry date pass. A part's (date, number) is FALSIFIED when the question's
sibling paper provably contains that part's text (the recon reconstructs ONE
paper's question), or when the part contradicts its own artifacts (image slug).
Ambiguous/common-phrase outcomes -> leave the honest per-part claim untouched.
"""
import subprocess
import tempfile
from pathlib import Path
import re

RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/past-papers/pearson-edexcel/international-gcse"
CH1 = f"{RAW}/chemistry/4ch1"
CH0 = f"{RAW}/chemistry/4ch0"

PROBES = {
    # question, part, claim, probe target papers, phrases
    "3RY3 6b '2013 Ja1C' (slug says 2020-ja1c-q6b)": {
        "papers": [("2020-01", "4CH1-1C", CH1), ("2013-01", "4CH0-1C", CH0)],
        "phrases": ["thermometer readings for this reaction"],
    },
    "FSW 5b/5c '2015 Ju1CR' among 2019 Ju1CR": {
        "papers": [("2019-06", "4CH1-1CR", CH1), ("2015-06", "4CH0-1CR", CH0)],
        "phrases": ["equation for the reaction between marble chips", "large marble chips in the investigation"],
    },
    "HWg 1b '2018 Ju2CR' among 2019 Ju2CR": {
        "papers": [("2019-06", "4CH1-2CR", CH1), ("2018-06", "4CH0-2CR", CH0)],
        "phrases": ["Describe the test for oxygen"],
    },
    "Kdq4 5b '2011 Ja1CR' among 2021 Ja1CR": {
        "papers": [("2021-01", "4CH1-1CR", CH1), ("2011-01", "4CH0-1CR", CH0)],
        "phrases": ["State two variables that the student should control"],
    },
    "GKVQ 7c '2020 Ja1C' among 2013 Ja1C": {
        "papers": [("2020-01", "4CH1-1C", CH1), ("2013-01", "4CH0-1C", CH0)],
        "phrases": ["unlabelled bottle containing a liquid"],
    },
}


def fetch(spec_base: str, session: str, d: str) -> str | None:
    infix = "specimen" if session == "specimen" else f"past-papers/{session}"
    url = f"{spec_base}/{infix}/{d}/qp.pdf"
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        r = subprocess.run(["curl", "-fsSL", "--max-time", "60", url, "-o", tf.name], capture_output=True)
        if r.returncode != 0:
            Path(tf.name).unlink(missing_ok=True)
            return None
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
    cache: dict[tuple[str, str], str | None] = {}
    for label, spec in PROBES.items():
        print(f"== {label}")
        for session, d, base in spec["papers"]:
            key = (session, d)
            if key not in cache:
                cache[key] = fetch(base, session, d)
            t = cache[key]
            if not t or len(t) < 500:
                print(f"   {session}/{d}: FETCH FAILED or missing")
                continue
            segs = segments(t)
            for phrase in spec["phrases"]:
                where = [n for n, m, s in segs if phrase in s]
                raw = t.count(phrase)
                print(f"   {session}/{d}: {phrase[:48]!r:52s} raw={raw} Q{where if where else '-'}")
        print()


if __name__ == "__main__":
    main()
