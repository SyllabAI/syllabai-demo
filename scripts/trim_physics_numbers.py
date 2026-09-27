#!/usr/bin/env python3
"""Trim whitespace in sourcePaper.number across the physics content file.
Parse-invariant (parseReconstruction trims) and slug-invariant (slugify strips),
purely display hygiene for attestation consistency. Idempotent."""
import json
import sys

PATH = "content/igcse-science-double-award-17-physics/questions.json"

raw = open(PATH, "rb").read()
data = json.loads(raw)
if json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode() != raw:
    sys.exit("ABORT: round-trip mismatch")

changed = 0
for block in data:
    for q in block.get("questions", []):
        for p in q.get("parts", []):
            sp = p.get("sourcePaper")
            if sp and isinstance(sp.get("number"), str) and sp["number"] != sp["number"].strip():
                changed += 1
                sp["number"] = sp["number"].strip()

out = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
with open(PATH, "wb") as f:
    f.write(out)
print(f"trimmed numbers: {changed}; written {len(out)} bytes")
