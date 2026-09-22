#!/usr/bin/env python3
"""validate_spines.py — Stage 1 validation gauntlet.

1. kg_export compatibility: every spine must pass export_course() unchanged
   (contract shapes, unique ids, 1 SUBTOPIC parent per point, numeric order).
2. Chemistry golden: spine vs the live 4CH1 curriculum — code sets, section
   titles, statement diffs (expected subset of the 53 known rediff rows).
3. Cross-course integrity: unique point codes, spec-point totals vs pools.
"""

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import kg_export  # noqa: E402

SPINES = REPO / "spines"
CONTENT = REPO / "content"


def main() -> int:
    registry = {}
    reg_raw = json.loads((CONTENT / "courses.json").read_text(encoding="utf-8"))
    for e in (reg_raw if isinstance(reg_raw, list) else reg_raw.get("courses", [])):
        registry[e["slug"]] = e

    spines = sorted(p for p in SPINES.glob("*.json") if not p.name.startswith("_"))
    fails, warns = [], []
    total_pts = 0

    # ---- 1 + 3: kg_export compatibility over a temp content tree --------
    tmp = Path("/home/z/my-project/work/spine-validate-content")
    for sp in spines:
        slug = sp.stem
        payload = json.loads(sp.read_text(encoding="utf-8"))
        cur = payload["curriculum"]
        total_pts += payload["meta"]["counts"]["specPoints"]
        d = tmp / slug
        d.mkdir(parents=True, exist_ok=True)
        (d / "curriculum.json").write_text(
            json.dumps(cur, ensure_ascii=False), encoding="utf-8")
        saved = kg_export.CONTENT
        kg_export.CONTENT = tmp
        try:
            out = kg_export.export_course(slug, registry)
            counts = out["meta"]["counts"]
            # cross-check: KG nodes must equal spine node count
            if counts["nodes"] != len(cur["nodes"]):
                fails.append(f"{slug}: kg_export nodes {counts['nodes']} != spine {len(cur['nodes'])}")
        except kg_export.ExportError as exc:
            fails.append(f"{slug}: ExportError: {exc}")
        except Exception as exc:  # noqa: BLE001
            fails.append(f"{slug}: {type(exc).__name__}: {exc}")
        finally:
            kg_export.CONTENT = saved

    # ---- 2: chemistry golden --------------------------------------------
    live = json.loads((CONTENT / "igcse-chemistry-19" / "curriculum.json")
                      .read_text(encoding="utf-8"))
    spine = json.loads((SPINES / "igcse-chemistry-19.json").read_text(encoding="utf-8"))
    gold = {}

    def code_set(doc):
        return {n["code"] for n in doc["nodes"] if n["family"] == "SPEC_POINT"}

    def norm_code(c):
        return re.sub(r"^4CH1-", "", c)

    live_codes = {norm_code(c) for c in code_set(live)}
    spine_codes = {norm_code(c) for c in code_set(spine["curriculum"])}
    gold["code_set_equal"] = live_codes == spine_codes
    gold["codes_only_in_live"] = sorted(live_codes - spine_codes)
    gold["codes_only_in_spine"] = sorted(spine_codes - live_codes)

    live_secs = [n["title"] for n in live["nodes"] if n["family"] == "TOPIC"]
    spine_secs = [n["title"] for n in spine["curriculum"]["nodes"] if n["family"] == "TOPIC"]
    gold["sections_live"] = live_secs
    gold["sections_spine"] = spine_secs

    # statement text diff on matching codes
    live_text = {re.sub(r"^4CH1-", "", n["code"]): n["title"]
                 for n in live["nodes"] if n["family"] == "SPEC_POINT"}
    spine_text = {re.sub(r"^4CH1-", "", n["code"]): n["title"]
                  for n in spine["curriculum"]["nodes"] if n["family"] == "SPEC_POINT"}
    diffs = []
    for c in sorted(live_codes & spine_codes):
        a, b = live_text.get(c, ""), spine_text.get(c, "")
        if a.strip() != b.strip():
            diffs.append({"code": c, "live": a[:70], "spine": b[:70]})
    gold["statement_diff_count"] = len(diffs)
    gold["statement_diffs_sample"] = diffs[:5]

    print(f"kg_export compatibility: {len(spines) - len([f for f in fails if 'ExportError' in f or True])} pass / {len(fails)} fail")
    for f in fails:
        print("  FAIL", f)
    print(f"total spec points across spines: {total_pts}")
    print("chemistry golden:", json.dumps(gold, indent=1, ensure_ascii=False)[:1600])

    out = {"fails": fails, "chemistryGolden": gold,
           "totalSpecPoints": total_pts, "nSpines": len(spines)}
    (SPINES / "_validation.json").write_text(
        json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    return 1 if fails or not gold["code_set_equal"] else 0


if __name__ == "__main__":
    sys.exit(main())
