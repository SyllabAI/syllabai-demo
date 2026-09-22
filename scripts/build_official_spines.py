#!/usr/bin/env python3
"""build_official_spines.py — Stage 1: per-course OFFICIAL-SPEC spine builder.

Turns the ratified upstream parse (Official-Specifications/parsed/<qual>/ at a
pinned resources commit) into one official-spine curriculum.json per demo
course, using the same node contract the corpus bundles already carry
(SUBJECT / TOPIC / SUBTOPIC / SPEC_POINT with parents + codes), so
kg_export.py consumes the output unchanged and the /knowledge-graph files
become official-spec-backed end to end.

Provenance discipline:
  - every SPEC_POINT: verbatim statement text + official_code from the parse
  - every TOPIC/SUBTOPIC: canonical title from the parse (topics.json or the
    row's inline subsection dict) — nothing invented
  - scoping (which parts of a shared qualification spec belong to which
    course) is a small explicit table below, each rule citing the parsed
    field it filters on; every spine records its rule + counts in meta
  - rows that cannot be placed (degraded topic refs) are reported as
    orphans, never force-assigned

Usage:
    python3 scripts/build_official_spines.py                # build all
    python3 scripts/build_official_spines.py --qual <slug>  # one course
Outputs: spines/<slug>.json + spines/_report.json (staging; live content/
trees are NOT touched — the flip is Stage 3, gated).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# upstream parse this build is pinned to (resources main @ audit time)
RESOURCES_SHA = "ae6a5e40c63013bed69d7af1583fbb4a4d19b205"
RAW_BASE = f"https://raw.githubusercontent.com/SyllabAI/syllabai-resources/{RESOURCES_SHA}"
DEFAULT_CACHE = Path("/home/z/my-project/work/spines-cache")

BOARD = "Pearson Edexcel"


def fetch_json(rel: str, cache: Path) -> dict | list:
    dest = cache / rel.replace("/", "__")
    if dest.exists():
        return json.loads(dest.read_text(encoding="utf-8"))
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = f"{RAW_BASE}/{rel}"
    req = urllib.request.Request(url, headers={"User-Agent": "syllabai-spine-builder/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    dest.write_bytes(data)
    return json.loads(data.decode("utf-8"))


# --------------------------------------------------------------------------
# scoping table — which rows of a shared qual spec belong to which course
# --------------------------------------------------------------------------
def ial_maths_unit(slug: str) -> str:
    m = re.search(r"ial-maths-20-(pure|mechanics|statistics|decision)-(\d)", slug)
    if m:
        return {"pure": "P", "mechanics": "M", "statistics": "S", "decision": "D"}[m.group(1)] + m.group(2)
    if "further-pure-1" in slug:
        return "FP1"
    raise ValueError(f"cannot derive IAL maths unit from {slug}")


SDA_STRAND = {"biology": "Biology", "chemistry": "Chemistry", "physics": "Physics"}
MOD_SLUG = re.compile(r"modular-24-(biology|chemistry|physics)-unit-([12])$")
MOD_UNIT_TOPICS = {  # verified against the modular PDFs' ': Part 2' boundary
    "igcse-biology-modular": (1, 2),          # unit 1 topics, unit 2 topics
    "igcse-chemistry-modular": (1, 4),
    "igcse-physics-modular": (1, 5),
}
SDA_MOD_STRAND = {"Biology": (1, 3), "Chemistry": (1, 4), "Physics": (1, 5)}


def scope_rule_for(slug: str, qual: str) -> dict:
    """Return {kind, ...} describing the row filter for this course."""
    if qual == "ial-maths":
        return {"kind": "unit", "field": "scope", "value": ial_maths_unit(slug)}
    if qual == "igcse-science-double-award":
        strand = next(v for k, v in SDA_STRAND.items() if slug.endswith(k))
        return {"kind": "scope_eq", "value": strand}
    if qual == "igcse-science-double-award-modular":
        m = MOD_SLUG.search(slug)
        strand = SDA_STRAND[m.group(1)]
        unit = int(m.group(2))
        lo, hi = SDA_MOD_STRAND[strand]
        return {"kind": "strand_and_unit", "strand": strand,
                "unit_range": (lo, hi) if unit == 1 else (hi + 1, 99),
                "unit": unit}
    for base, (u1, u2) in MOD_UNIT_TOPICS.items():
        m = re.search(rf"{re.escape(base)}-24-unit-([12])$", slug)
        if m:
            unit = int(m.group(1))
            return {"kind": "unit_range", "unit_range": (u1, u2) if unit == 1 else (u2 + 1, 99),
                    "unit": unit}
    if qual == "igcse-maths-a":
        if slug.endswith("foundation"):
            return {"kind": "scope_not", "value": "H"}
        # Higher listing: Foundation rows minus codes the Higher listing
        # restates (PDF p11 vs p29 'See Foundation Tier'), + all H rows
        return {"kind": "higher_merge"}
    if qual == "igcse-maths-a-modular":
        m = re.search(r"(foundation|higher)-unit-([12])$", slug)
        unit = m.group(2)
        if m.group(1) == "foundation":
            return {"kind": "applicability_unit", "value": "U" + unit + "F"}
        # Higher units contain the Foundation content of the same unit
        return {"kind": "applicability_unit_in", "values": ["U" + unit + "F", "U" + unit + "H"]}
    if qual == "igcse-accounting":
        if "financial-statements" in slug:
            return {"kind": "topic_numbers", "values": ["4", "5"]}
        if "introduction-to-bookkeeping" in slug:
            return {"kind": "topic_numbers", "values": ["1", "2", "3"]}
        raise ValueError(f"cannot split accounting course {slug}")
    if qual == "igcse-english-language-a":
        if "paper-1" in slug:
            return {"kind": "topic_numbers", "values": ["1"]}
        if "paper-2" in slug:
            return {"kind": "topic_numbers", "values": ["2"]}
        if "paper-3" in slug:
            return {"kind": "topic_numbers", "values": ["3"]}
        raise ValueError(f"cannot split ELA course {slug}")
    return {"kind": "all"}


def row_in_scope(row: dict, rule: dict, topic_no: str | None) -> bool:
    k = rule["kind"]
    if k == "all":
        return True
    if k == "scope_eq":
        return str(row.get("scope")) == rule["value"]
    if k == "scope_not":
        return str(row.get("scope")) != rule["value"]
    if k == "unit":
        return str(row.get("scope")) == rule["value"]
    if k == "applicability_unit":
        app = row.get("applicability") or {}
        return str(app.get("unit_scope")) == rule["value"]
    if k == "strand_and_unit":
        if str(row.get("scope")) != rule["strand"]:
            return False
        lo, hi = rule["unit_range"]
        return topic_no is not None and lo <= int(topic_no) <= hi
    if k == "unit_range":
        lo, hi = rule["unit_range"]
        return topic_no is not None and lo <= int(topic_no) <= hi
    if k == "applicability_unit_in":
        app = row.get("applicability") or {}
        return str(app.get("unit_scope")) in set(rule["values"])
    if k == "topic_numbers":
        return topic_no in set(rule["values"])
    raise ValueError(f"unknown rule kind {k}")


# igcse-economics: the parse carries no topic layer (0 topics) and the PDF
# content overview organises points as <unit>.<theme>.<subsection>. Theme
# titles below are verbatim from the official PDF content overview
# (evidence: content-overview headings, extracted with pdftotext 2026-09-22).
ECON_THEMES = {
    "1.1": "The market system",
    "1.2": "Business economics",
    "2.1": "Government and the economy",
    "2.2": "The global economy",
}
ECON_UNIT_OF_THEME = {"1.1": 1, "1.2": 1, "2.1": 2, "2.2": 2}  # (documentation)


# --------------------------------------------------------------------------
def natural_key(s: str):
    """Type-safe natural sort: digits rank before letters, '_' sinks last."""
    if s == "_":
        return [(2, "")]
    return [(0, int(t)) if t.isdigit() else (1, t)
            for t in re.split(r"(\d+)", s) if t != ""]


ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7,
         "viii": 8, "ix": 9, "x": 10, "xi": 11, "xii": 12, "xiii": 13,
         "xiv": 14, "xv": 15}


def sub_key_order(k: str):
    if k in ROMAN:
        return [(0, ROMAN[k])]
    return natural_key(k)


def clean_title(t: str) -> str:
    """topics.json TOC rows sometimes carry a trailing page number."""
    return re.sub(r"\s+\d+$", "", t or "").strip()


def _ord_tuple(pid: str):
    """Ordering key for codes like '1.3A' / '1.1.1b' (mirrors kg_export)."""
    nums, letter = [], ""
    for comp in str(pid).split("."):
        m = re.match(r"^(\d+)([A-Za-z]*)$", comp)
        if m:
            nums.append(float(m.group(1)))
            if m.group(2):
                letter = m.group(2)
        else:
            nums.append(0.0)
    return tuple(nums) + (letter,)


def build_course(slug: str, qual: str, registry: dict, cache: Path,
                 topics_idx: dict) -> dict:
    reg = registry.get(slug, {})
    pts_doc = fetch_json(f"Official-Specifications/parsed/{qual}/spec_points.json", cache)
    rows_all = pts_doc["spec_points"]
    rule = scope_rule_for(slug, qual)

    # authoritative unit assignment where upstream validated one exists
    unit_map: dict[str, str] | None = None
    if qual in MOD_UNIT_TOPICS:
        st = fetch_json(f"Official-Specifications/parsed/{qual}/structure.json", cache)
        spu = st.get("spec_point_units") or {}
        if spu and st.get("validation", {}).get("points_assigned") == len(rows_all):
            unit_map = spu

    canon = topics_idx[qual]           # number -> [(clean_title, page, ordering)]

    def topic_ref(row: dict):
        """-> (number, title) resolved for this row, or (None, None)."""
        t = row.get("topic") or {}
        num = str(t.get("number")) if t.get("number") is not None else None
        title = t.get("title")
        if title:
            return num, clean_title(str(title))
        if num and num in canon:
            # degraded inline ref: resolve by nearest page when possible
            page = (row.get("provenance") or {}).get("page")
            titles = canon[num]
            if len(titles) == 1 or not page:
                return num, titles[0]
            best = min(titles, key=lambda tt: abs(tt[1] - page))
            return num, best[0]
        if num:
            return num, None
        # no topic ref at all: try subsection code prefix ('9.1' -> topic 9)
        sub = row.get("subsection") or {}
        code = str(sub.get("code") or "")
        m = re.match(r"^(\d+)\.", code)
        if m and m.group(1) in canon:
            return m.group(1), canon[m.group(1)][0][0]
        return None, None

    scoped, orphans = [], []
    merge_info = None
    tier_merge_codes = set()
    if rule["kind"] in ("higher_merge", "applicability_unit_in"):
        # Tier listings: the higher listing restates some codes with different
        # statements (4MA1: 'See Foundation Tier' + replacements, p11 vs p29;
        # same pattern in the modular unit walks).
        if rule["kind"] == "higher_merge":
            f_rows = [r for r in rows_all if str(r.get("scope")) != "H"]
            h_rows = [r for r in rows_all if str(r.get("scope")) == "H"]
        else:
            f_tag, h_tag = rule["values"]
            f_rows = [r for r in rows_all
                      if str((r.get("applicability") or {}).get("unit_scope")) == f_tag]
            h_rows = [r for r in rows_all
                      if str((r.get("applicability") or {}).get("unit_scope")) == h_tag]
        h_codes = {str(r.get("official_code")) for r in h_rows}
        replaced = []
        merged = []
        for r in f_rows:
            if str(r.get("official_code")) in h_codes:
                replaced.append(str(r.get("official_code")))
                continue
            merged.append(r)
        merged.extend(h_rows)
        tier_merge_codes = h_codes
        merge_info = {"replacedByHigher": sorted(set(replaced)),
                      "foundationRowsKept": len(f_rows) - len(replaced),
                      "higherRows": len(h_rows)}
        for r in merged:
            num, title = topic_ref(r)
            if num is None:
                orphans.append({"official_code": r.get("official_code"),
                                "text": (r.get("text") or "")[:80]})
            else:
                scoped.append((r, num, title))
    else:
        for r in rows_all:
            if qual == "igcse-economics":
                # no topic layer: everything flows to the theme-based regrouping
                scoped.append((r, None, None))
                continue
            # unit-assignment path (modular sciences with validated structure.json)
            if unit_map is not None:
                unit = unit_map.get(r.get("id") or "")
                want = f"Unit {rule['unit']}"
                if unit == want:
                    num, title = topic_ref(r)
                    if num is None:
                        orphans.append({"official_code": r.get("official_code"),
                                        "text": (r.get("text") or "")[:80]})
                    else:
                        scoped.append((r, num, title))
                continue
            num, title = topic_ref(r)
            if num is None:
                orphans.append({"official_code": r.get("official_code"),
                                "text": (r.get("text") or "")[:80]})
                continue
            if row_in_scope(r, rule, num):
                scoped.append((r, num, title))

    if not scoped:
        raise ValueError(f"{slug}: no rows in scope for rule {rule}")

    # the parse array is not strictly document-ordered; the `ordering` field
    # is the authoritative document sequence (verified against the PDFs)
    scoped.sort(key=lambda t: t[0]["ordering"] if isinstance(t[0].get("ordering"), int)
                else 10**9)

    # ---- group rows into ordered topics -> subtopics -> points ----------
    # economics special case: no topic layer in the parse — sections come
    # from the <unit>.<theme> code prefix with PDF-derived theme titles
    econ_mode = qual == "igcse-economics"
    topics: dict[str, dict] = {}       # number -> {"title","rows"[]}
    order_seen: list[str] = []
    for r, num, title in scoped:
        if econ_mode:
            sub_code = str((r.get("subsection") or {}).get("code") or "")
            theme = ".".join(sub_code.split(".")[:2])
            num, title = theme, ECON_THEMES.get(theme)
            if num not in ECON_THEMES:
                orphans.append({"official_code": r.get("official_code"),
                                "text": (r.get("text") or "")[:80]})
                continue
        if num not in topics:
            topics[num] = {"title": title, "rows": []}
            order_seen.append(num)
        elif title and not topics[num]["title"]:
            topics[num]["title"] = title
        topics[num]["rows"].append(r)

    # canonical ordering: official topic NUMBER first (specs order sections
    # by their number), topics.json ordering as fallback, then first-seen
    def topic_sort_key(num):
        if econ_mode:
            return natural_key(num.replace(".", "x"))
        nums = re.findall(r"\d+", num)
        if nums:
            return [(0, tuple(int(x) for x in nums))]
        cands = canon.get(num)
        return ([(1, cands[0][2])] if cands else [(2, order_seen.index(num))])

    warnings: list[str] = []

    # guarded re-parent: a row's own official code prefix identifies its true
    # topic; upstream page-boundary attribution occasionally misfiles a row
    # (e.g. ial-maths S1 '5.1' under topic 6) — fix + record, never guess
    # when the target topic's own codes disagree
    def _code_topic(code: str):
        m = re.match(r"^(\d+)[.\s]", code + " ")
        return m.group(1) if m else None

    moved = []
    for num in list(topics):
        rows = topics[num]["rows"]
        if not rows:
            continue
        kept = []
        for r in rows:
            p = _code_topic(str(r.get("official_code") or ""))
            if p and p != num and p in topics:
                target = topics[p]["rows"]
                t_hits = sum(1 for x in target
                             if _code_topic(str(x.get("official_code") or "")) == p)
                if target and t_hits / len(target) >= 0.8:
                    topics[p]["rows"].append(r)
                    moved.append({"code": str(r.get("official_code")),
                                  "fromTopic": num, "toTopic": p})
                    continue
            kept.append(r)
        topics[num]["rows"] = kept
    if moved:
        warnings.append(f"{len(moved)} row(s) re-parented by official code prefix: "
                        + ", ".join(f"{m['code']} {m['fromTopic']}->{m['toTopic']}"
                                     for m in moved[:8]))
        # drop topics that lost every row
        for num in list(topics):
            if not topics[num]["rows"]:
                del topics[num]
                order_seen.remove(num)

    nodes, edges = [], []
    subject_code = slug
    nodes.append({"code": subject_code, "family": "SUBJECT",
                  "title": reg.get("subject") or qual, "description": None,
                  "parents": [], "provenanceTier": "RULE_DERIVED", "order": 0})

    n_sub, n_pts = 0, 0
    ordered = sorted(topics, key=topic_sort_key)   # after re-parent pruning
    for t_idx, num in enumerate(ordered, start=1):
        t = topics[num]
        t_title = t["title"] or f"Topic {num}"
        t_code = f"{qual}-T{num}"
        nodes.append({"code": t_code, "family": "TOPIC", "title": t_title,
                      "description": None, "parents": [subject_code],
                      "provenanceTier": "RULE_DERIVED", "order": t_idx})
        edges.append([subject_code, t_code])

        # subtopics from inline subsection dicts
        subs: dict[str, dict] = {}
        sub_order: list[str] = []
        for r in t["rows"]:
            sub = r.get("subsection") or {}
            key = str(sub.get("letter") or sub.get("code") or "")
            st_title = clean_title(str(sub.get("title") or ""))
            if not key or not st_title:
                key = key or "_"
                if not st_title:
                    st_title = t_title        # collapse: unnamed subs -> topic title
            if key not in subs:
                subs[key] = {"title": st_title, "rows": []}
                sub_order.append(key)
            subs[key]["rows"].append(r)
        # roman ordering ONLY when the whole section uses roman keys
        # ('i' is also the 9th letter — chemistry sections a..i must stay
        # alphabetical, ial-biology's i, ii, iii must sort numerically);
        # '_' = unlettered lead-in rows, which the PDFs place FIRST
        roman_mode = bool(sub_order) and all(k in ROMAN for k in sub_order)

        def _sub_sort(k: str):
            if k == "_":
                return [(-1, "")]
            if roman_mode:
                return [(0, ROMAN[k])]
            return natural_key(k)

        subs_ordered = sorted(sub_order, key=_sub_sort)
        if merge_info:
            # tier-merged listing: restore official code ascent per subtopic
            for key in sub_order:
                subs[key]["rows"].sort(key=lambda r: _ord_tuple(r.get("official_code")))
            # a foundation code replaced by a higher statement may live in a
            # DIFFERENT subtopic than its higher twin — drop F stragglers
            for key in sub_order:
                subs[key]["rows"] = [r for r in subs[key]["rows"]
                                     if str(r.get("official_code")) not in tier_merge_codes
                                     or str(r.get("scope")) == "H"
                                     or str((r.get("applicability") or {}).get("unit_scope", "")).endswith("H")]
        # point order is code-canonical (matches the export gate; stable for
        # rows whose codes tie)
        for key in sub_order:
            subs[key]["rows"].sort(key=lambda r: _ord_tuple(r.get("official_code")))

        # duplicate subtopic titles inside a section would break kg_export's
        # parent matching — disambiguate deterministically via the official
        # subsection key (identifier, not content)
        seen_titles: dict[str, int] = {}
        for s_idx, key in enumerate(subs_ordered, start=1):
            st = subs[key]
            label = st["title"]
            if label in seen_titles:
                warnings.append(
                    f"duplicate subtopic title '{label}' in section '{t_title}' "
                    f"(official key {key}) — suffixed with key")
                label = f"{label} ({key})"
            seen_titles[label] = 1
            s_code = f"{t_code}:SUB{key}"
            nodes.append({"code": s_code, "family": "SUBTOPIC", "title": label,
                          "description": None, "parents": [t_code],
                          "provenanceTier": "RULE_DERIVED", "order": s_idx})
            edges.append([t_code, s_code])
            n_sub += 1
            for r in st["rows"]:
                pid = str(r.get("official_code") or r.get("id"))
                nodes.append({"code": pid, "family": "SPEC_POINT",
                              "title": r.get("text") or "", "description": None,
                              "parents": [s_code], "provenanceTier": "RULE_DERIVED",
                              "order": n_pts + 1})
                edges.append([s_code, pid])
                n_pts += 1

    curriculum = {
        "board": BOARD,
        "level": reg.get("level") or "",
        "subject": reg.get("subject") or qual,
        "code": reg.get("code") or qual,
        "syllabusVersion": None,
        "nodes": nodes,
        "edges": edges,
    }
    meta = {
        "generator": "scripts/build_official_spines.py @ " + REPO.name,
        "resourcesSha": RESOURCES_SHA,
        "qual": qual,
        "scopeRule": rule,
        "tierMerge": merge_info,
        "unitAssignment": ("structure.json spec_point_units (upstream-validated)"
                           if unit_map is not None else "scope/table rule"),
        "counts": {"topics": len(ordered), "subtopics": n_sub, "specPoints": n_pts,
                   "parsePool": len(rows_all), "orphans": len(orphans)},
        "orphans": orphans,
        "warnings": warnings,
        "parseFlags": pts_doc.get("counts", {}).get("flagged"),
        # no per-spine timestamp: rebuilds are byte-deterministic at a fixed
        # RESOURCES_SHA (the report carries the single build time)
    }
    return {"meta": meta, "curriculum": curriculum}


def load_topics_index(cache: Path, quals: list[str]) -> dict:
    """number -> [(clean_title, page, ordering), ...] per qual."""
    idx = {}
    for q in quals:
        t = fetch_json(f"Official-Specifications/parsed/{q}/topics.json", cache)
        rows = t.get("topics", []) if isinstance(t, dict) else t
        by_no: dict[str, list] = {}
        for r in rows:
            num = str(r.get("number"))
            title = clean_title(str(r.get("title") or ""))
            if not title:
                continue
            by_no.setdefault(num, []).append(
                (title, (r.get("provenance") or {}).get("page") or 0,
                 r.get("ordering") or 0))
        for num in by_no:
            by_no[num].sort(key=lambda x: (x[2], x[1]))
        idx[q] = by_no
    return idx


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--qual", action="append", default=[], help="course slug (repeatable)")
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--out", type=Path, default=REPO / "spines")
    args = ap.parse_args()

    registry = {}
    reg_raw = json.loads((REPO / "content" / "courses.json").read_text(encoding="utf-8"))
    for e in (reg_raw if isinstance(reg_raw, list) else reg_raw.get("courses", [])):
        registry[e["slug"]] = e
    slugs = args.qual or sorted(registry)

    # slug -> qual via spec.json sme_courses
    slug_qual: dict[str, str] = {}
    quals = sorted({d.name for d in (args.cache / "Official-Specifications__parsed").glob("*")
                    if d.is_dir()}) if (args.cache / "Official-Specifications__parsed").exists() else []
    if not quals:
        # first run: discover quals from the manifest
        man = fetch_json("Official-Specifications/manifest.json", args.cache)
        quals = [r["slug"] if isinstance(r, dict) else r for r in man["qualifications"]]
    for q in quals:
        spec = fetch_json(f"Official-Specifications/{q}/spec.json", args.cache)
        for c in spec.get("sme_courses") or []:
            slug_qual[c] = q

    topics_idx = load_topics_index(args.cache, sorted(set(slug_qual.values())))

    args.out.mkdir(parents=True, exist_ok=True)
    report = {"resourcesSha": RESOURCES_SHA,
              "generatedUtc": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
              "courses": {}, "failures": []}
    ok = 0
    for slug in slugs:
        if slug not in slug_qual:
            report["failures"].append({"slug": slug, "error": "no qual covers this slug"})
            print(f"FAIL  {slug}: no qual")
            continue
        try:
            payload = build_course(slug, slug_qual[slug], registry, args.cache, topics_idx)
            (args.out / f"{slug}.json").write_text(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8")
            c = payload["meta"]["counts"]
            report["courses"][slug] = {"qual": slug_qual[slug], "rule": payload["meta"]["scopeRule"],
                                       "counts": c, "warnings": payload["meta"]["warnings"]}
            ok += 1
            print(f"  ok  {slug:70s} {c['topics']:3d} sections {c['subtopics']:4d} subs "
                  f"{c['specPoints']:4d} pts  (pool {c['parsePool']}, orphans {c['orphans']})")
        except Exception as exc:  # noqa: BLE001
            report["failures"].append({"slug": slug, "error": str(exc)})
            print(f"FAIL  {slug}: {exc}", file=sys.stderr)

    (args.out / "_report.json").write_text(
        json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\n{ok}/{len(slugs)} spines -> {args.out}")
    return 0 if ok == len(slugs) else 1


if __name__ == "__main__":
    sys.exit(main())
