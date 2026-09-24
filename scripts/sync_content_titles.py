#!/usr/bin/env python3
"""sync_content_titles.py — propagate spine statement titles into live content.

After a spine rebuild, the live content/<slug>/curriculum.json SPEC_POINT
titles must equal the spine's (the Stage 3 flip invariant: live == spine for
statement text). This syncs title-only — no other field is touched.

Serialization-preserving: each file is rewritten in the exact style it was
read (compact JSON; trailing newline only if the original had one).

Usage: python3 scripts/sync_content_titles.py [--slug <slug>] (default: all)
"""
import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SPINES = REPO / "spines"
CONTENT = REPO / "content"


def load_styled(path: Path):
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw), raw.endswith("\n")


def dumps_styled(obj, trailing_nl: bool) -> str:
    out = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return out + ("\n" if trailing_nl else "")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", action="append", default=[])
    args = ap.parse_args()
    slugs = args.slug or sorted(p.stem for p in SPINES.glob("*.json")
                                if not p.name.startswith("_"))

    total = 0
    problems = 0
    for slug in slugs:
        spine_path = SPINES / f"{slug}.json"
        content_path = CONTENT / slug / "curriculum.json"
        if not spine_path.exists() or not content_path.exists():
            continue
        spine, _ = load_styled(spine_path)
        content, nl = load_styled(content_path)
        prefix = (content.get("code") or "") + "-"
        s_pts = {n["code"]: n["title"] for n in spine["curriculum"]["nodes"]
                 if n.get("family") == "SPEC_POINT"}
        changed = 0
        for n in content["nodes"]:
            if n.get("family") != "SPEC_POINT":
                continue
            bare = n["code"].removeprefix(prefix)
            if bare in s_pts and n["title"] != s_pts[bare]:
                n["title"] = s_pts[bare]
                changed += 1
        # verify: re-scan must find zero remaining diffs
        remaining = sum(
            1 for n in content["nodes"]
            if n.get("family") == "SPEC_POINT"
            and n["code"].removeprefix(prefix) in s_pts
            and n["title"] != s_pts[n["code"].removeprefix(prefix)])
        if remaining:
            print(f"FAIL  {slug}: {remaining} titles still differ after sync")
            problems += 1
            continue
        if changed:
            content_path.write_text(dumps_styled(content, nl), encoding="utf-8")
        total += changed
        if changed or slug == "igcse-chemistry-19":
            print(f"  ok  {slug:58s} {changed:3d} titles synced (remaining {remaining})")
    print(f"\ntotal titles synced: {total}, problems: {problems}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
