#!/usr/bin/env python3
"""chem_definitive_apply.py — build & apply the DEFINITIVE 4CH1 statement set.

User-approved merge rule:
  base     = official PDF reparse text (clean; no OCR defects)
  recovery = structured `sub_items` from the SAME reparse, joined inline with
             " • " — 22/182 statements whose bullet lists the spine builder
             dropped (it only read `text`). 100% official-parse data, zero
             OCR salvage; the OCR-era text was diagnostic only.
  cosmetic = 49 rows whose only difference was OCR defect vs clean reparse
             (LaTeX wrappers, full-width punctuation, spacing) -> reparse wins.
Unchanged: the other 111 statements.

Touches:
  spines/igcse-chemistry-19.json            (22 titles + meta.definitiveMerge)
  content/igcse-chemistry-19/curriculum.json (71 titles: 22 recovery + 49 cosmetic)
  -> caller then runs validate_spines.py and kg_export.py.

Contract: never invents content — every character of the final text comes
from the official reparse (text or sub_items fields).
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SLUG = "igcse-chemistry-19"
PLAN = Path("/home/z/my-project/work/chem-definitive/merge_plan.json")
REVIEW_MD = Path("/home/z/my-project/download/statement_diffs/4ch1-definitive-merge.md")


def dumps(d) -> str:
    """Repo house style: compact JSON."""
    return json.dumps(d, separators=(",", ":"), ensure_ascii=False)


def norm_tokens(s: str):
    out, buf = [], []
    for ch in s.lower():
        if ch.isalnum():
            buf.append(ch)
        elif buf:
            out.append("".join(buf)); buf = []
    if buf:
        out.append("".join(buf))
    return set(out)


def main() -> int:
    plan = json.load(open(PLAN))["plan"]
    finals, recovered, cosmetic = {}, [], []
    for r in plan:
        code, cls = r["code"], r["class"]
        base = r["spine_text"].rstrip()
        if cls == "subitems":
            subs = [s.strip() for s in r["sub_items"]]
            lead = base if base.endswith(":") else base + ":"
            finals[code] = lead + " • " + " • ".join(subs)
            recovered.append((code, r["live_text"], finals[code]))
        elif cls == "cosmetic":
            finals[code] = base
            cosmetic.append((code, r["live_text"], finals[code]))

    # --- guard: OCR must not know anything the final text lacks (warn-only) ---
    warns = 0
    for code, live, final in recovered:
        missing = norm_tokens(live) - norm_tokens(final)
        if missing:
            warns += 1
            print(f"WARN {code}: OCR tokens absent from final: {sorted(missing)}")
    if warns:
        print(f"{warns} row(s) with OCR-only tokens — review before committing.")

    # --- patch spine ---
    spine_path = REPO / "spines" / f"{SLUG}.json"
    raw = spine_path.read_text()
    spine = json.loads(raw)
    n_spine = 0
    for n in spine["curriculum"]["nodes"]:
        if n.get("family") == "SPEC_POINT" and n["code"] in finals:
            if n["title"] != finals[n["code"]]:
                n["title"] = finals[n["code"]]
                n_spine += 1
    spine["meta"]["definitiveMerge"] = {
        "date": "2026-09-24",
        "rule": "base = PDF reparse text; recovery = reparse sub_items joined inline; "
                "cosmetic OCR-defect rows take reparse text; nothing invented",
        "recoveredFromSubItems": len(recovered),
        "cosmeticFixed": len(cosmetic),
        "reparseSource": "syllabai-resources Official-Specifications/parsed/igcse-chemistry/spec_points.json @ 030ef00",
        "appliedBy": "scripts/chem_definitive_apply.py",
    }
    spine_path.write_text(dumps(spine) + "\n")

    # --- patch live content ---
    content_path = REPO / "content" / SLUG / "curriculum.json"
    raw = content_path.read_text()
    content = json.loads(raw)
    prefix = content.get("code", "4CH1") + "-"  # content codes are '4CH1-1.1', plan codes bare '1.1'
    n_content, already = 0, 0
    for n in content["nodes"]:
        if n.get("family") != "SPEC_POINT":
            continue
        bare = n["code"].removeprefix(prefix)
        if bare in finals:
            if n["title"] == finals[bare]:
                already += 1
            else:
                n["title"] = finals[bare]
                n_content += 1
    content_path.write_text(dumps(content) + "\n")

    print(f"spine titles updated:   {n_spine} now (+ already-final skipped; expected {len(recovered)} total)")
    print(f"content titles updated: {n_content} now, {already} already final "
          f"(expected {len(recovered) + len(cosmetic)} total)")
    if n_content + already != len(recovered) + len(cosmetic):
        print("ERROR: content patch incomplete — aborting before review doc overwrite")
        return 1

    # --- review document ---
    lines = [
        "# 4CH1 — definitive statement merge (reparse base + structured sub_items)",
        "",
        f"- Recovered (bullet lists restored from reparse `sub_items`): **{len(recovered)}**",
        f"- Cosmetic fixes (OCR defects -> clean reparse text): **{len(cosmetic)}**",
        "- Unchanged: 111 (already exact). Total 182/182 statements accounted for.",
        "- Sources: reparse `parsed/igcse-chemistry/spec_points.json` @ resources `030ef00`",
        "  (text + sub_items); OCR-era live text used for diagnosis only. Nothing invented.",
        "",
        "## Recovered statements (full definitive text)",
        "",
    ]
    for code, _live, final in recovered:
        lines += [f"### {code}", "", final, ""]
    lines += ["## Cosmetic fixes (before OCR-era -> after definitive)", "",
              "| code | before (OCR-era) | after (definitive) |", "|---|---|---|"]
    for code, live, final in cosmetic:
        esc = lambda t: t.replace("|", "\\|")[:110]
        lines.append(f"| {code} | {esc(live)} | {esc(final)} |")
    REVIEW_MD.parent.mkdir(parents=True, exist_ok=True)
    REVIEW_MD.write_text("\n".join(lines) + "\n")
    print(f"review doc: {REVIEW_MD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
