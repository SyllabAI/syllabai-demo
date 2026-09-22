#!/usr/bin/env python3
"""attach_official_map.py — Stage 2: SME content re-attachment onto official codes.

Consumes the upstream T-SPEC verdict work (all merged on resources main) and
produces one attachment record per demo course:

  - spec-links/<slug>.json                          upstream ITEM-level codes
    (keyed by the SAME rn_* / qstnprt_* / fl_* ids the demo content uses),
    AI_VALIDATED + HUMAN_VALIDATED via the operator-delegated T-SPEC chain
  - SME-ExamQuestion/<slug>/spec_point_map.json     spcpt -> official map
    (tier / method / score / unit per row)
  - SME-ExamQuestion/<slug>/spec_point_resolution.json  provenance sidecar
  - SME-Flashcards/<slug>/flashcard_spec_map.json   card-level cross-check

plus the Stage 1 official spine (spines/<slug>.json) and the live SME content
(content/<slug>/{notes,flashcards,questions}.json).

Output: content-maps/<slug>.json  (schema syllabai.official-attachment/1.0)
        content-maps/_report.json (aggregate)

Discipline:
  - NO-GUESS: an item's codes come from (a) the upstream item join, or
    (b) the item's own declared SME spec-point links resolved through the
    upstream spcpt->official map — every code carries its lineage
    (upstream_item_join > sme_declared_link_rekey). Nothing else is attached.
  - items with no resolvable attachment stay UNMAPPED and are listed; they
    are never dropped and never force-assigned.
  - codes that fall outside the course's spine scope (e.g. a Unit-1 SME lane
    tagging a Unit-2 statement) are KEPT with their unit-qualified
    official_id and flagged spineHit=false — honest cross-unit attachments,
    not silent rewrites.
  - content/ is byte-untouched: this stage only produces the attachment
    layer; the physical flip is Stage 3 (gated, build_official_content.py).
  - deterministic: identical re-runs at the same pin are byte-identical
    (generatedUtc derives from the consumed inputs, not the clock).

Usage:
    python3 scripts/attach_official_map.py                 # all 49 courses
    python3 scripts/attach_official_map.py --course <slug> # one course
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# resources main @ Stage 2 pin (carries T-SPEC-4..10 verdicts + NORM-1 parses)
RESOURCES_SHA = "2e17aab05c200bf48d8bb89538c7b7c316cc0651"
RAW_BASE = f"https://raw.githubusercontent.com/SyllabAI/syllabai-resources/{RESOURCES_SHA}"
DEFAULT_CACHE = Path("/home/z/my-project/work/spec-maps-cache")

SCHEMA = "syllabai.official-attachment/1.0"
REPORT_SCHEMA = "syllabai.official-attachment-report/1.0"

# lineage ranks (lower = better; kept per code)
L_UPSTREAM = "upstream_item_join"
L_DECLARED = "sme_declared_link_rekey"
LINEAGE_RANK = {L_UPSTREAM: 0, L_DECLARED: 1}

SPCPT_RE = re.compile(r"spcpt_[A-Za-z0-9]+")


def fetch_text(rel: str, cache: Path) -> str | None:
    """Fetch a pinned raw file (disk-cached). Returns None on 404."""
    dest = cache / rel.replace("/", "__")
    if dest.exists():
        return dest.read_text(encoding="utf-8")
    url = f"{RAW_BASE}/{rel}"
    req = urllib.request.Request(url, headers={"User-Agent": "syllabai-attach-map/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return data.decode("utf-8")


def fetch_json(rel: str, cache: Path) -> dict | list | None:
    t = fetch_text(rel, cache)
    return None if t is None else json.loads(t)


def sha256_text(t: str) -> str:
    return hashlib.sha256(t.encode("utf-8")).hexdigest()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


# --------------------------------------------------------------------------
# input normalization
# --------------------------------------------------------------------------
def norm_upstream_code(c: dict) -> dict:
    """One spec-links / item code -> normalized attachment code."""
    return {
        "officialId": c.get("official_id"),
        "officialCode": c.get("official_code"),
        "unit": c.get("unit"),
        "tier": c.get("tier"),
        "method": c.get("method"),
        "score": c.get("score"),
        "lineage": L_UPSTREAM,
    }


# ---- code alias resolution -------------------------------------------------
# The upstream map and the Stage 1 spines name the same rows with different
# code shapes in a few quals. Resolution is SELF-VALIDATING: a candidate is
# only accepted when it exactly matches a spine code AND the row's
# unit/strand (explicit, or derived from the official_id) is compatible with
# the course's scoping rule. No candidate is ever invented into the spine.
#
#   igcse-chemistry-19: rows appear bare ('1.54C') and course-prefixed
#     ('4CH1-1.1'); the spine (= parse official_code) is bare.
#   igcse-accounting / english-literature / english-language-a / geography:
#     official_code=None rows carry chunk ids ('S1.036', 'C2T05', 'SX.031');
#     those spines use the verbatim parse row id.
#   ial-maths / maths-a-modular: bare codes RESTART per unit (and maths-a F/H
#     tiers reuse numbers for different statements — 53 shared codes differ),
#     so a row's unit is derived ('IAL_MATHS:P1-1.1', 'U1H-6.3B', unit field)
#     and must match the course's scope; a P1-tagged row never lands on the
#     P2 spine — it stays honestly outside (cross-unit).
#   SDA strands: the strand word in the official_id ('Biology-2.49') must
#     match the strand course.
PREFIXED_CODE_RE = re.compile(r"^([A-Z0-9]{2,8})-([0-9].*)$")
UNIT_TOKEN_RE = re.compile(r"^([A-Z]{1,2}\d[A-Z]?)-([0-9].*)$")
STRAND_WORDS = {"Biology", "Chemistry", "Physics"}


def _spine_namespace(spine_set: set) -> str | None:
    pref = {c.split(":", 1)[0] for c in spine_set if ":" in c}
    return pref.pop() if len(pref) == 1 else None


def course_ctx(rule: dict, spine_set: set) -> dict:
    """Unit/strand expectations derived from the Stage 1 scoping rule."""
    kind = rule.get("kind")
    units: set | None = None
    strand = None
    unit_required = False
    if kind == "unit":                      # ial-maths lanes ('P2', 'FP1')
        units, unit_required = {rule["value"]}, True
    elif kind == "applicability_unit_in":   # maths-a-modular ('U2F','U2H')
        units, unit_required = set(rule["values"]), True
    elif kind == "unit_range":              # modular bio/chem/phy ('Unit N')
        units = {f"Unit {rule['unit']}"}
    elif kind == "strand_and_unit":         # SDA modular
        strand, units = rule["strand"], {f"Unit {rule['unit']}"}
    elif kind == "scope_eq" and rule.get("value") in STRAND_WORDS:
        strand = rule["value"]              # SDA linear strands
    return {
        "units": units,
        "unit_required": unit_required,
        "strand": strand,
        "ns": _spine_namespace(spine_set),
    }


def normalize_unit(u: str | None) -> str | None:
    if not u:
        return None
    m = re.match(r"^Unit (\d) (Higher|Foundation)$", u)
    if m:
        return f"U{m.group(1)}{m.group(2)[0]}"
    return u


def resolve_spine_code(code: str | None, official_id: str | None, unit_field: str | None, ctx: dict, spine_set: set) -> str | None:
    """Resolve an upstream code row onto this course's spine, or None."""
    # candidate bare codes + unit/strand derivation
    cands: list[str] = []
    if code:
        cands.append(code)
    row_unit = normalize_unit(unit_field)
    row_strand = None
    if official_id and ":" in official_id:
        sfx = official_id.rsplit(":", 1)[1]
        if sfx not in cands:
            cands.append(sfx)
        if "-" in sfx:
            head, bare = sfx.split("-", 1)
            um = UNIT_TOKEN_RE.match(sfx)
            if um:
                if row_unit is None:
                    row_unit = um.group(1)
                if bare not in cands:
                    cands.append(bare)
            elif head in STRAND_WORDS:
                row_strand = head
                if bare not in cands:
                    cands.append(bare)
    if code:
        um = UNIT_TOKEN_RE.match(code)
        if um and row_unit is None:
            row_unit = um.group(1)
        pm = PREFIXED_CODE_RE.match(code)
        if pm and pm.group(2) not in cands:
            cands.append(pm.group(2))
    if ctx["ns"]:
        cands += [f"{ctx['ns']}:{c}" for c in list(cands)]

    units = ctx["units"]
    for cand in cands:
        if cand not in spine_set:
            continue
        if units is not None:
            if row_unit is not None:
                if row_unit not in units:
                    return None          # cross-unit attachment -> outside
            elif ctx["unit_required"]:
                return None              # colliding code space, unit unknown
        if ctx["strand"] and row_strand and row_strand != ctx["strand"]:
            return None                  # foreign strand -> outside
        return cand
    return None


def code_key(c: dict) -> tuple:
    # merge on the resolved spine code when available (alias shapes unify)
    return ("spine", c["spineCode"]) if c.get("spineCode") else ("raw", c.get("officialId"), c.get("officialCode"))


def merge_codes(*code_lists: list[dict]) -> list[dict]:
    """Merge code lists; upstream lineage wins over declared; stable order."""
    best: dict[tuple, dict] = {}
    order: list[tuple] = []
    for codes in code_lists:
        for c in codes:
            k = code_key(c)
            if k not in best:
                order.append(k)
                best[k] = dict(c)
            else:
                cur = best[k]
                if LINEAGE_RANK[c["lineage"]] < LINEAGE_RANK[cur["lineage"]]:
                    # keep upstream tier/method, remember both lineages
                    merged = dict(c)
                    merged["alsoLineage"] = cur["lineage"]
                    best[k] = merged
    return [best[k] for k in order]


# --------------------------------------------------------------------------
# per-course builder
# --------------------------------------------------------------------------
def build_course(slug: str, cache: Path, out_dir: Path) -> dict:
    spine_path = REPO / "spines" / f"{slug}.json"
    if not spine_path.exists():
        raise FileNotFoundError(f"missing spine for {slug}")
    spine = load_json(spine_path)
    spine_nodes = spine["curriculum"]["nodes"]
    spine_codes = sorted({n["code"] for n in spine_nodes if n["family"] == "SPEC_POINT"})
    spine_set = set(spine_codes)
    qual = spine["meta"]["qual"]
    ctx = course_ctx(spine["meta"].get("scopeRule") or {}, spine_set)

    content_dir = REPO / "content" / slug
    notes = load_json(content_dir / "notes.json")
    questions = load_json(content_dir / "questions.json")
    fc_path = content_dir / "flashcards.json"
    flashcards = load_json(fc_path) if fc_path.exists() else []

    # ---- upstream inputs -------------------------------------------------
    inputs: list[str] = []        # rel paths consumed (for sha pinning)
    stamps: list[str] = []

    spec_links = fetch_json(f"spec-links/{slug}.json", cache)
    if spec_links is not None:
        inputs.append(f"spec-links/{slug}.json")
        stamps.append(spec_links.get("generated_utc", ""))
    sl_items = spec_links.get("items", {}) if isinstance(spec_links, dict) else {}

    spm = fetch_json(f"SME-ExamQuestion/{slug}/spec_point_map.json", cache)
    if spm is not None:
        inputs.append(f"SME-ExamQuestion/{slug}/spec_point_map.json")
        stamps.append(spm.get("generated_utc", ""))
    res = fetch_json(f"SME-ExamQuestion/{slug}/spec_point_resolution.json", cache)
    if res is not None:
        inputs.append(f"SME-ExamQuestion/{slug}/spec_point_resolution.json")
        stamps.append(res.get("generated_utc", ""))
    fcm = fetch_json(f"SME-Flashcards/{slug}/flashcard_spec_map.json", cache)
    if fcm is not None:
        inputs.append(f"SME-Flashcards/{slug}/flashcard_spec_map.json")

    # ---- spcpt -> official ----------------------------------------------
    spcpt_map: dict[str, dict] = {}
    spcpt_unmapped: list[str] = []
    if spm:
        for sid, m in spm.get("mappings", {}).items():
            spcpt_map[sid] = {
                "officialId": m.get("official_id"),
                "officialCode": m.get("official_code"),
                "unit": m.get("unit"),
                "tier": m.get("tier"),
                "method": m.get("method"),
                "score": m.get("score"),
            }
        raw_unmapped = spm.get("unmapped", [])
        for u in raw_unmapped:
            spcpt_unmapped.append(u if isinstance(u, str) else u.get("id", json.dumps(u, sort_keys=True)))
        spcpt_unmapped.sort()
        sm_meta = {
            "regime": spm.get("regime"),
            "unitScope": spm.get("unit_scope"),
            "smeEntries": spm.get("sme_entries"),
        }
    else:
        sm_meta = None

    # provenance summary from the resolution sidecar
    prov = None
    if res and isinstance(res, dict):
        prov = {
            "validation": res.get("validation"),
            "counts": res.get("counts"),
        }

    # ---- item attachment --------------------------------------------------
    items: dict[str, dict] = {}

    def attach(item_id: str, kind: str, declared_ids: list[str], extra_codes: list[dict]):
        up = sl_items.get(item_id, {})
        up_codes = [norm_upstream_code(c) for c in up.get("codes", [])] if up else []
        declared_codes = [
            {
                "officialId": spcpt_map[s]["officialId"],
                "officialCode": spcpt_map[s]["officialCode"],
                "unit": spcpt_map[s]["unit"],
                "tier": spcpt_map[s]["tier"],
                "method": spcpt_map[s]["method"],
                "score": spcpt_map[s]["score"],
                "lineage": L_DECLARED,
                "viaSpcpt": s,
            }
            for s in sorted(set(declared_ids))
            if s in spcpt_map
        ]
        raw = up_codes + declared_codes
        for c in raw:
            c["spineCode"] = resolve_spine_code(
                c.get("officialCode"), c.get("officialId"), c.get("unit"), ctx, spine_set
            )
        codes = merge_codes(*[raw]) if raw else []
        declared_missing = sorted(set(declared_ids) - set(spcpt_map))
        if codes:
            rec: dict = {"kind": kind, "codes": codes}
            if declared_missing:
                rec["declaredUnresolved"] = declared_missing
            items[item_id] = rec
        else:
            items[item_id] = {
                "kind": kind,
                "codes": [],
                "unmapped": True,
                **({"declaredUnresolved": declared_missing} if declared_missing else {}),
                **({"upstreamNote": up.get("reason")} if up and up.get("reason") else {}),
            }

    # notes
    notes_inline_refs = 0
    notes_inline_unmapped = set()
    for n in notes:
        nid = n["noteId"]
        body = n.get("bodyMd") or ""
        inline = SPCPT_RE.findall(body)
        notes_inline_refs += len(inline)
        notes_inline_unmapped.update(r for r in inline if r not in spcpt_map)
        attach(nid, "note", n.get("specPointIds") or [], [])

    # question parts
    qp_total = 0
    for qset in questions:
        for q in qset.get("questions", []):
            for p in q.get("parts", []):
                qp_total += 1
                attach(p["id"], "question_part", p.get("specPointIds") or [], [])

    # flashcards
    for f in flashcards:
        attach(f["id"], "flashcard", f.get("specPointIds") or [], [])

    # ---- reconciliation vs the spine -------------------------------------
    # keyed by the resolved spine code; None = could not be placed in this
    # course's spine (cross-unit or text-level attachments, kept verbatim)
    attached_codes = {}
    for iid, rec in items.items():
        for c in rec["codes"]:
            attached_codes.setdefault(c.get("spineCode"), []).append(iid)
    spine_hit = {c for c in attached_codes if c is not None}
    outside = sorted((c for c in attached_codes if c is None), key=str) if None in attached_codes else []
    outside_detail = [
        {
            "items": len(attached_codes[None]),
            "note": "attachments whose upstream code has no verbatim/alias match "
            "in this course's spine (cross-unit or text-level ids) — kept, not dropped",
        }
    ] if outside else []
    uncovered = sorted(c for c in (spine_set - spine_hit))

    # ---- coverage ----------------------------------------------------------
    def cov(kind: str, total: int) -> dict:
        ids = [i for i, r in items.items() if r["kind"] == kind]
        coded = [i for i in ids if items[i]["codes"]]
        via_up = [i for i in coded if any(c["lineage"] == L_UPSTREAM for c in items[i]["codes"])]
        return {
            "total": total,
            "coded": len(coded),
            "viaUpstreamJoin": len(via_up),
            "viaDeclaredLink": len(coded) - len(via_up),
            "unmapped": len(ids) - len(coded),
        }

    coverage = {
        "notes": cov("note", len(notes)),
        "questionParts": cov("question_part", qp_total),
        "flashcards": cov("flashcard", len(flashcards)),
    }

    spine_hit_count = sum(1 for c in spine_hit)
    outside_count = len(attached_codes.get(None, []))
    reconciliation = {
        "spineSpecPoints": len(spine_set),
        "distinctCodesAttached": len(spine_hit),
        "spineHitCodes": spine_hit_count,
        "codesOutsideSpine": outside_detail,
        "itemsOutsideSpine": outside_count,
        "uncoveredSpineCodes": len(uncovered),
        "uncoveredSpineCodeList": uncovered,
    }
    generated = max([s for s in stamps if s], default=None)
    attachment = {
        "schema": SCHEMA,
        "course": slug,
        "qual": qual,
        "resourcesSha": RESOURCES_SHA,
        "generatedUtc": generated,
        "inputs": {
            rel: {"sha256": sha256_text(fetch_text(rel, cache) or "")}
            for rel in sorted(inputs)
        },
        "sources": {
            "specLinks": None if spec_links is None else spec_links.get("totals"),
            "specPointMap": sm_meta,
            "resolution": prov,
            "flashcardMap": None
            if fcm is None
            else {"totals": fcm.get("totals"), "unresolvedSpcpt": len(fcm.get("unresolved_spcpt", []))},
        },
        "spcptToOfficial": {k: spcpt_map[k] for k in sorted(spcpt_map)},
        "spcptUnmapped": spcpt_unmapped,
        "items": {k: items[k] for k in sorted(items)},
        "reconciliation": reconciliation,
        "contentCoverage": coverage,
        "notesInlineRefs": {
            "total": notes_inline_refs,
            "unmappedToMap": sorted(notes_inline_unmapped),
        },
    }
    out = out_dir / f"{slug}.json"
    out.write_text(json.dumps(attachment, indent=1, sort_keys=True) + "\n", encoding="utf-8")

    row = {
        "course": slug,
        "qual": qual,
        "specPointMap": bool(spm),
        "spcptMapped": len(spcpt_map),
        "spcptUnmapped": len(spcpt_unmapped),
        "items": {k: v["coded"] for k, v in coverage.items()},
        "totals": {k: v["total"] for k, v in coverage.items()},
        "spineHitCodes": len(spine_hit),
        "codesOutsideSpine": outside_count,
        "uncoveredSpineCodes": len(uncovered),
    }
    return row


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--course", help="single course slug")
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    args = ap.parse_args()

    out_dir = REPO / "content-maps"
    out_dir.mkdir(exist_ok=True)

    courses = sorted(p.name for p in (REPO / "content").iterdir() if p.is_dir())
    if args.course:
        courses = [args.course] if args.course in courses else []
        if not courses:
            print(f"unknown course {args.course!r}", file=sys.stderr)
            return 2

    content_dir = REPO / "content"
    before = {
        p: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(content_dir.rglob("*.json"))
    }

    rows = []
    for slug in courses:
        try:
            rows.append(build_course(slug, args.cache, out_dir))
        except Exception as e:
            print(f"FAIL {slug}: {e}", file=sys.stderr)
            raise

    after = {
        p: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(content_dir.rglob("*.json"))
    }
    if before != after:
        print("FATAL: content/ was modified", file=sys.stderr)
        return 1

    # aggregate
    def agg(key, sel):
        return sum(sel(r[key]) for r in rows)

    totals = {
        "courses": len(rows),
        "notesTotal": agg("totals", lambda t: t.get("notes", 0)),
        "questionPartsTotal": agg("totals", lambda t: t.get("questionParts", 0)),
        "flashcardsTotal": agg("totals", lambda t: t.get("flashcards", 0)),
        "notesCoded": agg("items", lambda t: t.get("notes", 0)),
        "questionPartsCoded": agg("items", lambda t: t.get("questionParts", 0)),
        "flashcardsCoded": agg("items", lambda t: t.get("flashcards", 0)),
    }
    report = {
        "schema": REPORT_SCHEMA,
        "resourcesSha": RESOURCES_SHA,
        "courses": {r["course"]: r for r in rows},
        "totals": totals,
    }
    (out_dir / "_report.json").write_text(
        json.dumps(report, indent=1, sort_keys=True) + "\n", encoding="utf-8"
    )

    # console summary
    print(f"courses: {len(rows)}")
    for k, v in totals.items():
        if k != "courses":
            print(f"  {k}: {v}")
    print(f"attachment maps -> {out_dir}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
