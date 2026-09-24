#!/usr/bin/env python3
"""T-KG-13 demo structural sync — content curriculum + corpus re-point.

1. Remove content SPEC_POINT nodes whose spine codes disappeared
   (accounting flattened-duplicate rows) and sync ALL family titles from
   the spine for the affected courses.
2. Re-point notes/questions spec-point anchors from removed codes to the
   clean-capture statements that now carry their content.
3. Verify: content SPEC_POINT code set == spine set; zero dangling corpus
   references remain.

Serialization-preserving (compact JSON, trailing newline as found).
"""
import json
from pathlib import Path

REPO = Path("/home/z/my-project/download/syllabai-demo")
SPINES = REPO / "spines"
CONTENT = REPO / "content"

AFFECTED = [
    "igcse-accounting-17-introduction-to-bookkeeping-and-accounting",
    "igcse-accounting-17-financial-statements",
    "igcse-geography-19",
]

REMOVED = set()
for lo, hi, pfx in [(35, 50, "S1"), (51, 68, "S2"), (69, 72, "S4"),
                    (73, 78, "S5")]:
    for i in range(lo, hi + 1):
        REMOVED.add(f"IGCSE_ACCOUNTING:{pfx}.{i:03d}")

REPOINT = {}
for i in range(35, 38): REPOINT[f"S1.{i:03d}"] = "S1.119"
REPOINT["S1.038"] = "S1.120"
for i in range(39, 45): REPOINT[f"S1.{i:03d}"] = "S1.121"
REPOINT["S1.045"] = "S1.123"
REPOINT["S1.048"] = "S1.124"
for i in range(49, 51): REPOINT[f"S1.{i:03d}"] = "S1.124"
REPOINT["S1.050"] = "S1.127"
for i in range(51, 58): REPOINT[f"S2.{i:03d}"] = "S2.129"
REPOINT["S2.057"] = "S2.132"
for i in range(58, 65): REPOINT[f"S2.{i:03d}"] = "S2.132"
REPOINT["S2.065"] = "S2.133"
REPOINT["S2.066"] = "S2.134"
REPOINT["S2.067"] = "S2.135"
REPOINT["S2.068"] = "S2.136"
REPOINT["S4.069"] = "S4.171"
for i in range(70, 73): REPOINT[f"S4.{i:03d}"] = "S4.172"
for i in range(73, 79): REPOINT[f"S5.{i:03d}"] = "S5.175"


def load_styled(path: Path):
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw), raw.endswith("\n")


def dumps_styled(obj, trailing_nl: bool) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")) \
        + ("\n" if trailing_nl else "")


def sync_curriculum(slug: str) -> dict:
    spine, _ = load_styled(SPINES / f"{slug}.json")
    cpath = CONTENT / slug / "curriculum.json"
    content, nl = load_styled(cpath)
    sp_codes = {n["code"] for n in spine["curriculum"]["nodes"]
                if n.get("family") == "SPEC_POINT"}
    removed_nodes, title_syncs = [], 0
    kept = []
    for n in content["nodes"]:
        if n.get("family") == "SPEC_POINT" and n["code"] not in sp_codes:
            removed_nodes.append(n["code"])
            continue
        kept.append(n)
    # title sync for all families (match by code — spine and content share ids)
    sp_titles = {n["code"]: n["title"] for n in spine["curriculum"]["nodes"]}
    for n in kept:
        t = sp_titles.get(n["code"])
        if t is not None and n.get("title") != t:
            n["title"] = t
            title_syncs += 1
    content["nodes"] = kept
    # edges: drop any edge whose source/target vanished (defensive — the
    # accounting edges are SUBJECT->TOPIC only, verified unaffected)
    codes = {n["code"] for n in kept} | {content.get("code") or ""}
    kept_edges = [e for e in content.get("edges", [])
                  if e.get("source") in codes and e.get("target") in codes]
    dropped_edges = len(content.get("edges", [])) - len(kept_edges)
    content["edges"] = kept_edges
    cpath.write_text(dumps_styled(content, nl), encoding="utf-8")
    return {"slug": slug, "removed_nodes": removed_nodes,
            "title_syncs": title_syncs, "dropped_edges": dropped_edges,
            "n_nodes": len(kept)}


def repoint_corpus(slug: str) -> dict:
    stats = {"notes": 0, "note_files": 0, "parts": 0, "deep": 0}

    def map_code(x: str) -> str:
        bare = x.split(":")[-1]
        tgt = REPOINT.get(bare)
        return x.split(":")[0] + ":" + tgt if tgt else x

    # deep token replacement for any remaining string field (smeSpecPointIds,
    # bodyMd citations, …) — exact-code tokens only
    import re
    tok = re.compile(r"IGCSE_[A-Z_]+:(?:S\d+\.\d+|SX\.\d+)")

    def deep(obj):
        n = 0
        if isinstance(obj, dict):
            for k, v in obj.items():
                n += deep(v)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                if isinstance(v, str):
                    def sub(m):
                        nonlocal n
                        t = map_code(m.group(0))
                        n += t != m.group(0)
                        return t
                    obj[i] = tok.sub(sub, v)
                else:
                    n += deep(v)
        elif isinstance(obj, str):
            def sub(m):
                nonlocal n
                t = map_code(m.group(0))
                n += t != m.group(0)
                return t
            return n  # caller handles strings via lists/dicts only
        return n

    def deep_walk(obj):
        n = 0
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(v, str):
                    def sub(m):
                        nonlocal n
                        t = map_code(m.group(0))
                        n += t != m.group(0)
                        return t
                    obj[k] = tok.sub(sub, v)
                else:
                    n += deep_walk(v)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                if isinstance(v, str):
                    def sub(m):
                        nonlocal n
                        t = map_code(m.group(0))
                        n += t != m.group(0)
                        return t
                    obj[i] = tok.sub(sub, v)
                else:
                    n += deep_walk(v)
        return n

    # notes
    np_ = CONTENT / slug / "notes.json"
    if np_.exists():
        notes, nl = load_styled(np_)
        changed = 0
        for r in notes:
            for key in ("specPointIds", "specPointCodes",
                        "smeSpecPointIds"):
                arr = r.get(key) or []
                new = [map_code(x) for x in arr]
                ded = list(dict.fromkeys(new))
                if ded != arr:
                    r[key] = ded
                    changed += 1
        d = deep_walk(notes)
        stats["deep"] += d
        if changed or d:
            np_.write_text(dumps_styled(notes, nl), encoding="utf-8")
        stats["notes"] = changed
    # questions (per-part anchors + any other fields)
    qp = CONTENT / slug / "questions.json"
    if qp.exists():
        qsets, nl = load_styled(qp)
        changed = 0
        for s in qsets:
            for qq in s.get("questions", []):
                for prt in qq.get("parts", []):
                    for key in ("specPointIds", "specPointCodes"):
                        arr = prt.get(key) or []
                        new = [map_code(x) for x in arr]
                        ded = list(dict.fromkeys(new))
                        if ded != arr:
                            prt[key] = ded
                            changed += 1
        d = deep_walk(qsets)
        stats["deep"] += d
        if changed or d:
            qp.write_text(dumps_styled(qsets, nl), encoding="utf-8")
        stats["parts"] = changed
    return stats


def verify(slug: str) -> list:
    problems = []
    spine, _ = load_styled(SPINES / f"{slug}.json")
    content, _ = load_styled(CONTENT / slug / "curriculum.json")
    sp = {n["code"] for n in spine["curriculum"]["nodes"]
          if n.get("family") == "SPEC_POINT"}
    co = {n["code"] for n in content["nodes"]
          if n.get("family") == "SPEC_POINT"}
    if sp != co:
        problems.append(f"{slug}: code set mismatch "
                        f"(only-spine {sorted(sp-co)[:5]}, "
                        f"only-content {sorted(co-sp)[:5]})")
    sp_t = {n["code"]: n["title"] for n in spine["curriculum"]["nodes"]}
    for n in content["nodes"]:
        if n["code"] in sp_t and n.get("title") != sp_t[n["code"]]:
            problems.append(f"{slug}: title mismatch {n['code']}")
            break
    # corpus: zero references to removed codes
    for f in ("notes.json", "questions.json", "flashcards.json",
              "learner-sim.json", "concept-graph.json", "manifest.json"):
        p = CONTENT / slug / f
        if not p.exists():
            continue
        raw = p.read_text(encoding="utf-8")
        for code in REMOVED:
            if code in raw:
                problems.append(f"{slug}/{f}: still references {code}")
                break
    # every kept SPEC_POINT keeps a PART_OF parent edge
    codes = {n["code"] for n in content["nodes"]
             if n.get("family") == "SPEC_POINT"}
    targeted = {e.get("target") for e in content.get("edges", [])}
    missing = codes - targeted
    if missing:
        problems.append(f"{slug}: {len(missing)} SPEC_POINT without edge: "
                        f"{sorted(missing)[:4]}")
    return problems


def main() -> int:
    all_problems = []
    for slug in AFFECTED:
        r = sync_curriculum(slug)
        print(f"sync  {slug}: removed={len(r['removed_nodes'])} "
              f"titles={r['title_syncs']} edges={r['dropped_edges']} "
              f"nodes={r['n_nodes']}")
        if r["removed_nodes"]:
            print(f"   removed: {r['removed_nodes'][:6]} …")
    for slug in AFFECTED:
        st = repoint_corpus(slug)
        print(f"repoint {slug}: notes={st['notes']} parts={st['parts']}")
    for slug in AFFECTED:
        pr = verify(slug)
        all_problems.extend(pr)
    if all_problems:
        print("\nPROBLEMS:")
        for p in all_problems:
            print("  ", p)
        return 1
    print("\nverify: all clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
