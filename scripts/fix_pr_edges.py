#!/usr/bin/env python3
"""
Task 20 add-on: retarget the 12 dangling REQUIRES_PREREQUISITE edges in
content/igcse-chemistry-19/concept-graph.json.

Root cause (Task 19 audit + investigation): the upstream extractor numbered
the Edexcel 4CH1 core practicals with ad-hoc codes 4CH1-PR-01..11 for edge
sources, but never emitted corresponding nodes. The curriculum DOES contain
these practicals as real spec statements (titled "practical: ..."), so the
correct fix is to point each edge source at the real spec code. Targets
(CON-* nodes) were always valid and are left untouched.

Mapping (verified 1:1 in spec order against curriculum.json):
  4CH1-PR-01 -> 4CH1-1.7C   (solubility of a solid at a set temperature)
  4CH1-PR-02 -> 4CH1-1.13   (paper chromatography, inks/food colourings)
  4CH1-PR-03 -> 4CH1-1.36   (formula of a metal oxide by combustion)
  4CH1-PR-04 -> 4CH1-1.60C  (electrolysis of aqueous solutions)
  4CH1-PR-09 -> 4CH1-3.8    (temperature changes: HCl + NaOH calorimetry)
  4CH1-PR-10 -> 4CH1-3.15   (marble chips surface area / concentration rate)
  4CH1-PR-11 -> 4CH1-3.16   (catalytic decomposition of hydrogen peroxide)

PR-05..08 and PR-12 have no edges, so nothing to do for them.
"""
import json
import re
import sys
from pathlib import Path

CONTENT = Path("content/igcse-chemistry-19")
GRAPH = CONTENT / "concept-graph.json"
CURRICULUM = CONTENT / "curriculum.json"

MAPPING = {
    "4CH1-PR-01": "4CH1-1.7C",
    "4CH1-PR-02": "4CH1-1.13",
    "4CH1-PR-03": "4CH1-1.36",
    "4CH1-PR-04": "4CH1-1.60C",
    "4CH1-PR-09": "4CH1-3.8",
    "4CH1-PR-10": "4CH1-3.15",
    "4CH1-PR-11": "4CH1-3.16",
}


def collect_codes(cur: dict) -> set:
    codes = set()

    def walk(o):
        if isinstance(o, dict):
            c = o.get("code") or o.get("id")
            if isinstance(c, str):
                codes.add(c)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(cur)
    return codes


def main() -> int:
    raw = GRAPH.read_text(encoding="utf-8")
    graph = json.loads(raw)
    cur_codes = collect_codes(json.loads(CURRICULUM.read_text(encoding="utf-8")))
    node_codes = {n["code"] for n in graph["nodes"]}
    resolvable = node_codes | cur_codes

    before = [e for e in graph["edges"] if e["source"] in MAPPING]
    print(f"edges carrying a PR-xx source: {len(before)} (expect 12)")
    if len(before) != 12:
        print("ABORT: unexpected edge count")
        return 1

    for e in graph["edges"]:
        if e["source"] in MAPPING:
            e["source"] = MAPPING[e["source"]]

    # post-conditions
    dangling = [
        e
        for e in graph["edges"]
        if e["source"] not in resolvable or e["target"] not in resolvable
    ]
    leftover = [e for e in graph["edges"] if re.search(r"-PR-\d", e["source"] + e["target"])]
    targets_ok = all(
        any(e["source"] == real for e in graph["edges"]) for real in MAPPING.values()
    )

    print(f"dangling edges after fix: {len(dangling)} (expect 0)")
    print(f"leftover PR-xx references: {len(leftover)} (expect 0)")
    print(f"all 7 real spec codes present as edge sources: {targets_ok}")
    counts = graph.get("counts", {})
    print(f"counts untouched: {json.dumps(counts)}")

    if dangling or leftover or not targets_ok:
        print("ABORT: post-conditions failed, not writing")
        return 1

    # preserve upstream minified formatting (compact separators, no trailing NL)
    out = json.dumps(graph, ensure_ascii=False, separators=(",", ":"))
    if out == raw:
        print("ABORT: serialized output identical to input — nothing changed?")
        return 1
    GRAPH.write_text(out, encoding="utf-8")
    print(f"written: {GRAPH} ({len(raw)} -> {len(out)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
