#!/usr/bin/env python3
"""T-KG-14 demo structural sync — content curriculum for the affected courses.

The T-KG-14 upstream repairs (resources ffeb53eb) changed the geography and
accounting-financial-statements spec-point sets:

  REMOVED  igcse-accounting S5.079-118 (40 admin/appendix over-captures)
           igcse-geography  S9.084-096 (13 same-class) + S3.059/S3.060
                            (folded into the rebuilt S3.058)
  ADDED    igcse-geography  S9.243-S9.253 (AO1/AO4 + 9 transferable skills)
  RETITLED geo AO2/AO3 rows, transferable-skills rows (5 sub_items freed),
           fieldwork rows S3.056-058 + S6.081 (rebuilt text + sub_items)

Since content/curriculum.json is the official spine verbatim (Stage-3 flip
contract), this script re-materializes the curriculum for the two affected
courses directly from the rebuilt spines, after proving zero corpus
references to any removed/changed code. It also re-checks every
notes/questions/flashcards spec-point anchor against the new code set.

Serialization: compact JSON + trailing newline (demo house style).
"""
import json
import re
from pathlib import Path

REPO = Path("/home/z/my-project/download/syllabai-demo")

AFFECTED = [
    "igcse-geography-19",
    "igcse-accounting-17-financial-statements",
]

REMOVED = set()
for i in range(79, 119):
    REMOVED.add(f"IGCSE_ACCOUNTING:S5.{i:03d}")
for i in range(84, 97):
    REMOVED.add(f"IGCSE_GEOGRAPHY:S9.{i:03d}")
REMOVED.add("IGCSE_GEOGRAPHY:S3.059")
REMOVED.add("IGCSE_GEOGRAPHY:S3.060")

ADDED = {f"IGCSE_GEOGRAPHY:S9.{i:03d}" for i in range(243, 254)}


def dump(path, doc):
    with open(path, "w") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")


def corpus_refs(slug):
    """All spec-point codes referenced by the course's corpus files."""
    refs = set()
    d = REPO / "content" / slug
    for fn in ("notes.json", "questions.json", "flashcards.json",
               "learner-sim.json", "concept-graph.json"):
        s = (d / fn).read_text()
        refs |= set(re.findall(r"(?:IGCSE|IAL)_[A-Z_]+:S[A-Z]?\d+\.\d+[A-Z]?", s))
    return refs


def main():
    report = {"courses": [], "abort": []}
    for slug in AFFECTED:
        spine = json.loads((REPO / "spines" / f"{slug}.json").read_text())
        cur_path = REPO / "content" / slug / "curriculum.json"
        cur = json.loads(cur_path.read_text())
        old_sp = {n["code"] for n in cur["nodes"] if n.get("family") == "SPEC_POINT"}
        new_sp = {n["code"] for n in spine["curriculum"]["nodes"]
                  if n.get("family") == "SPEC_POINT"}

        dead = old_sp - new_sp
        added = new_sp - old_sp
        if dead & new_sp or not (dead <= REMOVED | set()) or not (added <= ADDED):
            report["abort"].append(f"{slug}: unexpected set change dead={len(dead)} added={len(added)}")

        # zero corpus references to removed codes
        refs = corpus_refs(slug)
        dangling = refs & (REMOVED | dead)
        if dangling:
            report["abort"].append(f"{slug}: corpus references to removed codes: {sorted(dangling)[:5]}")
            continue

        # re-materialize curriculum from the spine (flip contract)
        cur["nodes"] = spine["curriculum"]["nodes"]
        cur["edges"] = spine["curriculum"]["edges"]
        dump(cur_path, cur)

        n_nodes = len(cur["nodes"])
        n_edges = len(cur["edges"])
        report["courses"].append({
            "slug": slug, "removed": sorted(dead), "added": sorted(added),
            "spec_points": f"{len(old_sp)} -> {len(new_sp)}",
            "nodes": n_nodes, "edges": n_edges,
        })
        print(f"{slug}: SPEC_POINTs {len(old_sp)} -> {len(new_sp)} "
              f"(removed {len(dead)}, added {len(added)}); nodes {n_nodes}, edges {n_edges}")

    if report["abort"]:
        print("ABORTED:", report["abort"])
        return 1

    # final resolution check across the two courses
    ok = True
    for slug in AFFECTED:
        cur = json.loads((REPO / "content" / slug / "curriculum.json").read_text())
        live = {n["code"] for n in cur["nodes"]}
        refs = corpus_refs(slug)
        missing = refs - live
        if missing:
            ok = False
            print(f"{slug}: DANGLING corpus refs: {sorted(missing)[:8]}")
    print("corpus anchors all resolve" if ok else "DANGLING REFS PRESENT")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
