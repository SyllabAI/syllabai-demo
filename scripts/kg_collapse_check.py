#!/usr/bin/env python3
"""kg_collapse_check.py — preflight for the P14 passthrough subtopic collapse.

Simulates, in Python, exactly the rule the loader implements (build_kg_loader_fork.py
P14 block): collapse a section's single subtopic iff its label equals the
section label (case/space-insensitive). Prints per-course effect and the
expected rendered node/edge counts the loader will post to the host.

Zero mutation: read-only over public/kg/data/*.json.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "public" / "kg" / "data"


def collapse(sec_list: dict, subs: dict) -> tuple[list, dict]:
    """Returns (collapsed_sub_ids, sectionPoints map)."""
    sp: dict = {}
    for sec, arr in sec_list.items():
        lst = subs.get(sec, [])
        if len(lst) != 1:
            continue
        sec_label = str(arr.get("label", "")) if isinstance(arr, dict) else str(arr)
        if not sec_label or str(lst[0][1]).strip().lower() != sec_label.strip().lower():
            continue
        sp[sec] = lst[0][0]
    return sp


def main() -> int:
    total_collapsed = 0
    kept: list = []
    rows = []
    for f in sorted(DATA.glob("*.json")):
        if f.name == "index.json" or "canonicalKG" in f.name:
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        if not isinstance(d.get("sections"), dict):
            continue
        secs, subs, pts = d["sections"], d["subtopics"], d["points"]
        pst = d.get("pointSubtopics", {})
        sp = collapse(secs, subs)
        nsubs = sum(len(v) for v in subs.values())
        n_sub_pts = sum(len(pst.get(s[0], [])) for v in subs.values() for s in v if s[0] not in sp.values())
        n_att = sum(len(pst.get(sid, [])) for sid in sp.values())
        # rendered counts after collapse
        nodes = 1 + len(secs) + (nsubs - len(sp)) + len(pts)
        edges = len(secs) + (nsubs - len(sp)) + len(pts)
        rows.append((f.name, len(secs), nsubs, len(sp), len(pts), nodes, edges))
        total_collapsed += len(sp)
        # collect the kept single-sub sections (info-bearing)
        for sec, arr in secs.items():
            lst = subs.get(sec, [])
            if len(lst) == 1 and sec not in sp:
                kept.append((f.name, sec, lst[0][1]))
        if sp:
            print(f"{f.name[:44]:46s} secs={len(secs):3d} subs={nsubs:3d} "
                  f"collapsed={len(sp):3d} att_pts={n_att:3d} "
                  f"render {nodes}/{edges}/{len(pts)}")
    print(f"\ncourses touched: {sum(1 for r in rows if r[3])}")
    print(f"total collapsed subtopics: {total_collapsed}")
    print(f"kept single-sub (info-bearing) sections: {len(kept)}")
    for name, sec, label in kept:
        print(f"   KEEP {name[:40]} sec {sec} -> {label[:44]}")
    # spot expectation
    mb = [r for r in rows if r[0] == "igcse-maths-b-16.json"]
    if mb:
        name, nsec, nsub, ncol, npts, nodes, edges = mb[0]
        ok = ncol == 10 and nsub == 10 and nodes == 1 + nsec + npts and edges == nsec + npts
        print(f"\nMaths B expectation: 10/10 collapsed, render 109/108/98 -> "
              f"{'PASS' if ok else 'FAIL'} (computed {nodes}/{edges}/{npts})")
        return 0 if ok else 1
    print("\nMaths B file not found!")
    return 1


if __name__ == "__main__":
    sys.exit(main())
