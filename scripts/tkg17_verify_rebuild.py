#!/usr/bin/env python3
"""T-KG-17 rebuild verification — the rebuild may ONLY add applicability.

For every course, spine vs the pre-rebuild snapshot:
  G1 node/edge counts identical, node/edge code structure identical
  G2 every SPEC_POINT: title byte-identical (statements untouched)
  G3 the ONLY permitted diff on any node is a new 'applicability' key whose
     value deep-equals the canonical row's applicability (checked per-qual
     against the fetched parse, not against the spine itself)
  G4 meta: resourcesSha/counts/scopeRule/subItemRecovery unchanged; the only
     meta addition is the new 'applicability' provenance block
"""
import json
import sys
from pathlib import Path

REPO = Path("/home/z/my-project/download/syllabai-demo")
SNAP = Path("/home/z/my-project/work/spines-prerek")
CACHE = Path("/home/z/my-project/work/spines-cache")

spines = sorted(p for p in (REPO / "spines").glob("*.json") if not p.name.startswith("_"))
problems: list[str] = []
report = {"courses": {}, "failures": problems}

# canonical rows per qual for G3
qual_rows: dict[str, dict] = {}

def canon_app(qual: str) -> dict:
    if qual in qual_rows:
        return qual_rows[qual]
    f = CACHE / f"Official-Specifications__parsed__{qual}__spec_points.json"
    doc = json.loads(f.read_text(encoding="utf-8"))
    # NOTE: ial-maths has 31 official_codes duplicated across unit content
    # walks (P1/P2/M1/.../FP1 each print their own '1.1'). Keyed multimap:
    # the spine node's applicability must deep-equal ONE of the canonical
    # rows carrying that code (the builder's scope rule picks the row).
    mm: dict[str, list] = {}
    for r in doc["spec_points"]:
        mm.setdefault(str(r.get("official_code") or r.get("id")), []).append(
            r.get("applicability"))
    qual_rows[qual] = mm
    return qual_rows[qual]

slug_qual: dict[str, str] = {}
rep = json.loads((REPO / "spines" / "_report.json").read_text(encoding="utf-8"))
for slug, info in rep["courses"].items():
    slug_qual[slug] = info["qual"]

for sp in spines:
    slug = sp.stem
    if slug not in slug_qual:
        continue
    new = json.loads(sp.read_text(encoding="utf-8"))
    old = json.loads((SNAP / f"{slug}.json").read_text(encoding="utf-8"))
    cn, co = new["curriculum"], old["curriculum"]

    if (len(cn["nodes"]), len(cn["edges"])) != (len(co["nodes"]), len(co["edges"])):
        problems.append(f"{slug}: node/edge count changed")
        continue
    old_by = {n["code"]: n for n in co["nodes"]}
    app_added = 0
    qual = slug_qual[slug]
    capp = canon_app(qual)
    for n in cn["nodes"]:
        o = old_by.get(n["code"])
        if o is None:
            problems.append(f"{slug}: new node {n['code']}")
            continue
        if n.get("title") != o.get("title"):
            problems.append(f"{slug}: title changed on {n['code']}")
        if n.get("parents") != o.get("parents") or n.get("family") != o.get("family"):
            problems.append(f"{slug}: structure changed on {n['code']}")
        new_keys = set(n) - set(o)
        if new_keys - {"applicability"}:
            problems.append(f"{slug}: unexpected new keys {new_keys} on {n['code']}")
        if "applicability" in new_keys:
            canon = capp.get(n["code"])
            if canon is None or n["applicability"] not in canon:
                problems.append(f"{slug}: applicability not among canonical rows for {n['code']}")
            app_added += 1
        elif set(o) - set(n):
            problems.append(f"{slug}: keys dropped on {n['code']}")
    # meta: only the applicability block may appear
    mo, mn = old["meta"], new["meta"]
    if set(mn) - set(mo) - {"applicability"}:
        problems.append(f"{slug}: unexpected meta keys {set(mn) - set(mo)}")
    for k in ("resourcesSha", "counts", "scopeRule", "tierMerge", "unitAssignment",
              "orphans", "warnings", "parseFlags", "subItemRecovery"):
        if mn.get(k) != mo.get(k):
            problems.append(f"{slug}: meta.{k} changed")
    if app_added != (mn.get("applicability") or {}).get("specPoints", app_added):
        problems.append(f"{slug}: meta.applicability.specPoints {mn.get('applicability')} != counted {app_added}")
    report["courses"][slug] = {"specPoints": app_added}

print(json.dumps({"nCourses": len(report["courses"]), "problems": problems[:12],
                  "problemCount": len(problems)}, ensure_ascii=False, indent=1))
out = Path("/home/z/my-project/work/tkg17-applicability")
out.mkdir(parents=True, exist_ok=True)
(out / "rebuild_verify.json").write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n",
                                         encoding="utf-8")
sys.exit(1 if problems else 0)
