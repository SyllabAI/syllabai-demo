#!/usr/bin/env python3
"""T-KG-17 content sync — copy spine SPEC_POINT applicability into the live
content curriculum trees (the layer the app's zod contracts + UI read).

Rules:
  - spine SP node -> content SP node matched by code; igcse-chemistry-19 is
    the one display-prefixed course ('4CH1-1.1' vs spine '1.1') — strip the
    '<code>-' prefix there (same rule as T-KG-10 definitive apply)
  - the applicability object is copied VERBATIM; content SP nodes that have
    no canonical home (SX front matter) stay key-less
  - G1: every content SP node resolves to exactly one spine SP node
  - G2: titles byte-identical pre/post; node/edge counts unchanged
  - G3: only permitted diff = new 'applicability' key deep-equal to spine
  - serialization: compact + ensure_ascii=False + trailing newline
"""
import json
import sys
from pathlib import Path

REPO = Path("/home/z/my-project/download/syllabai-demo")

def dump(path: Path, doc) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

reg_raw = json.loads((REPO / "content" / "courses.json").read_text(encoding="utf-8"))
courses = reg_raw if isinstance(reg_raw, list) else reg_raw.get("courses", [])
problems: list[str] = []
report: dict = {"courses": {}, "failures": problems}

for e in courses:
    slug = e["slug"]
    spine = json.loads((REPO / "spines" / f"{slug}.json").read_text(encoding="utf-8"))
    cur_path = REPO / "content" / slug / "curriculum.json"
    cur = json.loads(cur_path.read_text(encoding="utf-8"))

    pre = (cur.get("code") or "") + "-"
    sp_app = {}
    for n in spine["curriculum"]["nodes"]:
        if n.get("family") == "SPEC_POINT":
            code = n["code"] if n["code"] in {x["code"] for x in cur["nodes"]} \
                else n["code"]
            sp_app[n["code"]] = n.get("applicability")
    if slug == "igcse-chemistry-19":
        strip = lambda c: c.removeprefix(pre) if c not in sp_app else c
    else:
        strip = lambda c: c

    before_nodes, before_edges = len(cur["nodes"]), len(cur["edges"])
    old_titles = {n["code"]: n.get("title") for n in cur["nodes"]}
    old_keys = {n["code"]: set(n) for n in cur["nodes"] if n.get("family") == "SPEC_POINT"}

    patched = 0
    for n in cur["nodes"]:
        if n.get("family") != "SPEC_POINT":
            continue
        spine_code = strip(n["code"])
        if spine_code not in sp_app:
            problems.append(f"{slug}: content SP {n['code']} has no spine match")
            continue
        app = sp_app[spine_code]
        if app is None:
            continue
        if "applicability" in n:
            if n["applicability"] == app:
                continue
            problems.append(f"{slug}: {n['code']} already carried different applicability")
            continue
        n["applicability"] = app
        patched += 1

    if (len(cur["nodes"]), len(cur["edges"])) != (before_nodes, before_edges):
        problems.append(f"{slug}: node/edge count changed")
    for n in cur["nodes"]:
        if old_titles.get(n["code"]) != n.get("title"):
            problems.append(f"{slug}: title changed on {n['code']}")
        if n.get("family") == "SPEC_POINT":
            dropped = old_keys.get(n["code"], set()) - set(n)
            if dropped:
                problems.append(f"{slug}: keys dropped on {n['code']}: {dropped}")
            newk = set(n) - old_keys.get(n["code"], set())
            if newk - {"applicability"}:
                problems.append(f"{slug}: unexpected new keys on {n['code']}: {newk}")

    if not problems:
        dump(cur_path, cur)
    report["courses"][slug] = {"patchedSpecPoints": patched,
                               "spineWithApp": sum(1 for v in sp_app.values() if v)}

print(json.dumps({"nCourses": len(report["courses"]),
                  "totalPatched": sum(c["patchedSpecPoints"] for c in report["courses"].values()),
                  "problemCount": len(problems), "problems": problems[:10]},
                 ensure_ascii=False, indent=1))
out = Path("/home/z/my-project/work/tkg17-applicability")
out.mkdir(parents=True, exist_ok=True)
(out / "content_sync_report.json").write_text(
    json.dumps(report, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
sys.exit(1 if problems else 0)
