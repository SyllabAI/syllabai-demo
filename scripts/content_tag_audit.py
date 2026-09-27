#!/usr/bin/env python3
"""content_tag_audit.py — static integrity audit of content tags across the corpus.

Motivated by the "Ict" defect (commit c3a58b5): a subject tag was exported with
wrong casing from content truth and faithfully rendered downstream. This audit
generalizes that check to EVERY content tag surface:

  1. content/courses.json                     (operator registry: slug/level/subject/label/code/status)
  2. content/<slug>/curriculum.json           (curriculum truth: board/level/subject/code/syllabusVersion top-level)
  3. content/<slug>/manifest.json             (manifest.curriculum block + officialSpine pointers)
  4. content/<slug>/questions.json            (per-topic-set curriculum blocks — where the 21 "Ict"s lived)
  5. public/kg/data/<slug>.json               (exported meta.* + subjectLabel — what the explorer renders)
  6. public/kg/data/index.json                (host-page picker: subject/code/counts)
  7. spines/<slug>.json, content-maps/<slug>.json (derived artifacts: qual/course pointers)

Checks:
  C1  value-domain scan: casing anomalies (Ict-style), whitespace, empties,
      code format, syllabusVersion format, unknown boards/levels
  C2  per-course cross-surface consistency (registry == curriculum == manifest ==
      every questions.json topic block == kg meta == index entry)
  C3  corpus invariants: 49 everywhere, no duplicate slugs, spine/content-map
      pointers resolve, spec-point counts agree at every layer
  C4  unit layer (where a curriculum carries UNIT nodes): SUBJECT -> UNIT ->
      TOPIC integrity, "Unit N (CODE)" titles, and per-topic unanimity of
      SPEC_POINT applicability.unit_scope (the unit home derivation)

Usage:
  python3 scripts/content_tag_audit.py [--repo-root .]
Exits non-zero if any FAIL.
"""
import argparse
import collections
import datetime
import json
import re
import sys
from pathlib import Path

# Frozen value domains — canonical forms verified across the 49-course corpus
# (live sweep 2026-09-26 + ICT fix c3a58b5 + board normalization). A value
# outside these sets is an Ict-class defect: shape heuristics cannot catch
# "Ict" (it looks like an ordinary capitalized word), only domain membership can.
SUBJECTS_OK = {"Accounting", "Biology", "Business", "Chemistry", "Economics",
               "English Language", "English Literature", "Further Maths",
               "Geography", "ICT", "Maths", "Physics", "Science"}
LEVELS_OK = {"IAL", "IGCSE"}
BOARDS_OK = {"Pearson Edexcel"}
STATUSES_OK = {"full", "pilot"}
CODE_RE = re.compile(r"^[A-Z0-9/]+$")   # 4XMAF/4XMAH modular units use a slash
YEAR_RE = re.compile(r"^\d{4}(?:-\d{2,4})?(?: \(Issue \d+\))?$")  # "2017 (Issue 3)"
UNIT_TITLE_RE = re.compile(r"^Unit \d+ \([A-Z]{3}\d{2}\)$")  # "Unit 1 (WPH11)"

findings = []  # (severity, course_or '-', check_id, message)


def finding(sev, course, cid, msg):
    findings.append((sev, course, cid, msg))


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        finding("FAIL", "-", "JSON", f"{path}: unparseable ({e})")
        return None


def walk_tag_blocks(node, path, out):
    """Recursively collect every dict carrying board+level+subject (tag-shaped)."""
    if isinstance(node, dict):
        if {"board", "level", "subject"} <= set(node.keys()):
            out.append((path, node))
        for k, v in node.items():
            walk_tag_blocks(v, f"{path}.{k}", out)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            walk_tag_blocks(v, f"{path}[{i}]", out)


def domain_check(value, field, where, course):
    """Tag value must be a member of its frozen canonical domain (Ict-class guard)."""
    domain = {"subject": SUBJECTS_OK, "level": LEVELS_OK, "board": BOARDS_OK}[field]
    v = (value or "").strip()
    if value != v:
        finding("FAIL", course, f"C1-{field}", f"{where}: whitespace padding in {value!r}")
    if not v:
        finding("FAIL", course, f"C1-{field}", f"{where}: empty value")
    elif v not in domain:
        finding("FAIL", course, f"C1-{field}",
                f"{where}: {v!r} outside canonical domain {sorted(domain)}")


def norm_tags(t):
    return (t.get("board"), t.get("level"), t.get("subject"), t.get("code"),
            t.get("syllabusVersion"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", default=".")
    args = ap.parse_args()
    root = Path(args.repo_root).resolve()

    content = root / "content"
    kgdata = root / "public" / "kg" / "data"

    # ---------- load corpus ----------
    registry = load_json(content / "courses.json")
    reg_courses = {}
    if registry:
        for entry in registry.get("courses", []):
            slug = entry.get("slug")
            if slug in reg_courses:
                finding("FAIL", slug, "C3-registry", "duplicate slug in courses.json")
            reg_courses[slug] = entry
            domain_check(entry.get("subject"), "subject", "registry.subject", slug)
            domain_check(entry.get("level"), "level", "registry.level", slug)
            if not CODE_RE.match(entry.get("code", "") or ""):
                finding("FAIL", slug, "C1-code", f"registry.code malformed: {entry.get('code')!r}")
            if entry.get("status") not in STATUSES_OK:
                finding("FAIL", slug, "C1-status", f"registry.status: {entry.get('status')!r}")
            if entry.get("label", "") != entry.get("subject", ""):
                finding("WARN", slug, "C2-label",
                        f"registry label {entry.get('label')!r} != subject {entry.get('subject')!r}")

    course_dirs = sorted(p.name for p in content.iterdir() if p.is_dir())
    index = load_json(kgdata / "index.json")
    index_entries = {e.get("slug"): e for e in (index.get("courses", []) if index else [])}

    # canonicalKG.edexcel-chemistry-4ch1.json is the legacy inline-4CH1 mirror,
    # not a course export — excluded from corpus set comparisons
    kg_files = sorted(p.stem for p in kgdata.glob("*.json")
                      if p.stem != "index" and not p.stem.startswith("canonicalKG"))
    board_map = {}  # learned from corpus: curriculum.board -> kg meta.board

    # ---------- per-course ----------
    for slug in course_dirs:
        cdir = content / slug
        cur = load_json(cdir / "curriculum.json")
        if cur is None:
            continue
        cur_tags = {k: cur.get(k) for k in ("board", "level", "subject", "code", "syllabusVersion")}

        # C1 on curriculum truth tags
        for f in ("board", "level", "subject"):
            domain_check(cur_tags[f], f, "curriculum", slug)
        if not CODE_RE.match(cur_tags["code"] or ""):
            finding("FAIL", slug, "C1-code", f"curriculum.code malformed: {cur_tags['code']!r}")
        if not YEAR_RE.match(str(cur_tags["syllabusVersion"] or "")):
            finding("FAIL", slug, "C1-year", f"curriculum.syllabusVersion malformed: {cur_tags['syllabusVersion']!r}")
        if cur_tags["level"] not in LEVELS_OK:
            finding("FAIL", slug, "C1-level", f"unexpected level: {cur_tags['level']!r}")

        # C4: unit layer (where present) — SUBJECT -> UNIT -> TOPIC integrity;
        # unit titles, parents, and per-topic unanimity of point unit_scope
        c4_nodes = cur.get("nodes") or []
        c4_units = [n for n in c4_nodes if n.get("family") == "UNIT"]
        if c4_units:
            c4_subj = next((n for n in c4_nodes if n.get("family") == "SUBJECT"), None)
            c4_topic_codes = {n.get("code") for n in c4_nodes if n.get("family") == "TOPIC"}
            c4_unit_codes = set()
            for u in c4_units:
                uc = u.get("code") or ""
                c4_unit_codes.add(uc)
                m = re.search(r"U(\d+)$", uc)
                if not m:
                    finding("FAIL", slug, "C4-unit", f"UNIT code unparseable: {uc!r}")
                if not UNIT_TITLE_RE.match(u.get("title") or ""):
                    finding("FAIL", slug, "C4-unit",
                            f"UNIT title not 'Unit N (CODE)': {u.get('title')!r}")
                want_parents = [c4_subj["code"]] if c4_subj else None
                if list(u.get("parents") or []) != want_parents:
                    finding("FAIL", slug, "C4-unit",
                            f"UNIT {uc} parents {u.get('parents')!r} != {want_parents!r}")
            c4_unit_of_topic = {}
            for t in (n for n in c4_nodes if n.get("family") == "TOPIC"):
                ups = [p for p in (t.get("parents") or []) if p in c4_unit_codes]
                if len(ups) != 1:
                    finding("FAIL", slug, "C4-unit",
                            f"TOPIC {t.get('code')} has {len(ups)} UNIT parents {ups!r}")
                else:
                    c4_unit_of_topic[t.get("code")] = ups[0]
            # unit homes: unanimous SPEC_POINT applicability.unit_scope per topic
            c4_top_of_sub = {}
            for st in (n for n in c4_nodes if n.get("family") == "SUBTOPIC"):
                tp = [p for p in (st.get("parents") or []) if p in c4_topic_codes]
                if len(tp) == 1:
                    c4_top_of_sub[st.get("code")] = tp[0]
            c4_votes = collections.defaultdict(collections.Counter)
            for p in (n for n in c4_nodes if n.get("family") == "SPEC_POINT"):
                us = (p.get("applicability") or {}).get("unit_scope")
                for par in p.get("parents") or []:
                    t = c4_top_of_sub.get(par)
                    if t and us:
                        c4_votes[t][us] += 1
            for tcode, ucode in c4_unit_of_topic.items():
                m = re.search(r"U(\d+)$", ucode or "")
                want_scope = "U" + m.group(1) if m else None
                v = c4_votes.get(tcode, {})
                if want_scope is None or set(v) != {want_scope}:
                    finding("FAIL", slug, "C4-unit",
                            f"topic {tcode} parent {ucode} vs point unit_scope votes {dict(v)}")

        # registry <-> curriculum
        r = reg_courses.get(slug)
        if r is None:
            finding("FAIL", slug, "C2-registry", "course dir missing from courses.json registry")
        else:
            for f in ("level", "subject", "code"):
                if r.get(f) != cur_tags[f]:
                    finding("FAIL", slug, "C2-registry",
                            f"registry.{f}={r.get(f)!r} != curriculum.{f}={cur_tags[f]!r}")

        # manifest.curriculum == curriculum truth
        man = load_json(cdir / "manifest.json")
        if man:
            mtag = man.get("curriculum", {})
            if norm_tags(mtag) != norm_tags(cur_tags):
                finding("FAIL", slug, "C2-manifest",
                        f"manifest.curriculum {norm_tags(mtag)} != curriculum {norm_tags(cur_tags)}")
            spine_ref = (man.get("officialSpine") or {}).get("spine")
            cmap_ref = (man.get("officialSpine") or {}).get("attachmentMap")
            if spine_ref and not (root / spine_ref).exists():
                finding("FAIL", slug, "C3-spine", f"officialSpine missing on disk: {spine_ref}")
            if cmap_ref and not (root / cmap_ref).exists():
                finding("FAIL", slug, "C3-spine", f"attachmentMap missing on disk: {cmap_ref}")

        # every questions.json tag block must equal curriculum truth
        qfile = cdir / "questions.json"
        if qfile.exists():
            qdata = load_json(qfile)
            blocks = []
            walk_tag_blocks(qdata, "questions", blocks)
            for path, blk in blocks:
                if norm_tags(blk) != norm_tags(cur_tags):
                    finding("FAIL", slug, "C2-questions",
                            f"{path}: {norm_tags(blk)} != curriculum {norm_tags(cur_tags)}")
        else:
            finding("WARN", slug, "C2-questions", "no questions.json (course may be questionless)")

        # notes.json presence is informational only (not tag-bearing)

        # ---------- kg export ----------
        kgf = kgdata / f"{slug}.json"
        if not kgf.exists():
            finding("FAIL", slug, "C3-export", "missing exported kg data file")
            continue
        kg = load_json(kgf)
        if kg is None:
            continue
        meta = kg.get("meta", {})
        board_map.setdefault(cur_tags["board"], meta.get("board"))

        for f in ("board", "level", "subject", "code", "syllabusVersion"):
            if meta.get(f) != cur_tags[f]:
                finding("FAIL", slug, "C2-kgmeta",
                        f"kg meta.{f}={meta.get(f)!r} != curriculum.{f}={cur_tags[f]!r}")
        if meta.get("curriculumCode") != cur_tags["code"]:
            finding("FAIL", slug, "C2-kgmeta",
                    f"kg meta.curriculumCode={meta.get('curriculumCode')!r} != code {cur_tags['code']!r}")
        if meta.get("course") != slug:
            finding("FAIL", slug, "C2-kgmeta", f"kg meta.course={meta.get('course')!r}")
        if kg.get("subjectLabel") != meta.get("subject"):
            finding("FAIL", slug, "C2-kgmeta",
                    f"subjectLabel={kg.get('subjectLabel')!r} != meta.subject={meta.get('subject')!r}")
        subj_node = next((n for n in kg.get("nodes", []) if n.get("id") == "subject"), None)
        if subj_node and subj_node.get("label") != meta.get("subject"):
            finding("FAIL", slug, "C2-kgmeta",
                    f"subject node label={subj_node.get('label')!r} != meta.subject={meta.get('subject')!r}")

        # ---------- index entry ----------
        e = index_entries.get(slug)
        if e is None:
            finding("FAIL", slug, "C2-index", "missing from index.json")
        else:
            if e.get("subject") != meta.get("subject"):
                finding("FAIL", slug, "C2-index",
                        f"index.subject={e.get('subject')!r} != kg meta.subject={meta.get('subject')!r}")
            if e.get("code") != meta.get("code"):
                finding("FAIL", slug, "C2-index", f"index.code={e.get('code')!r} != kg meta.code={meta.get('code')!r}")
            ec = e.get("counts", {})
            for k, actual in (("nodes", len(kg.get("nodes", []))),
                              ("edges", len(kg.get("edges", []))),
                              ("specPoints", len(kg.get("points", [])))):
                if ec.get(k) != actual:
                    finding("FAIL", slug, "C2-index", f"index.counts.{k}={ec.get(k)} != actual {actual}")

        # ---------- spec-point count agreement ----------
        sp_cur = sum(1 for n in cur.get("nodes", []) if n.get("family") == "SPEC_POINT")
        sp_kg = len(kg.get("points", []))
        sp_man = (man or {}).get("counts", {}).get("specPoints")
        if not (sp_cur == sp_kg == sp_man):
            finding("FAIL", slug, "C3-counts",
                    f"specPoints mismatch: curriculum {sp_cur}, kg {sp_kg}, manifest {sp_man}")

    # ---------- C3 corpus invariants ----------
    reg_slugs = set(reg_courses)
    dir_slugs = set(course_dirs)
    kg_slugs = set(kg_files)
    idx_slugs = set(index_entries)
    if not (reg_slugs == dir_slugs == kg_slugs == idx_slugs):
        finding("FAIL", "-", "C3-corpus",
                f"slug sets differ: registry {len(reg_slugs)}, dirs {len(dir_slugs)}, "
                f"kg files {len(kg_slugs)}, index {len(idx_slugs)}; "
                f"only-in-dirs={sorted(dir_slugs - reg_slugs)[:5]}, "
                f"only-in-registry={sorted(reg_slugs - dir_slugs)[:5]}")

    # spine/content-map qual pointers
    for sp in sorted((root / "spines").glob("*.json")):
        if sp.stem.startswith("_"):
            continue  # _report.json / _validation.json are aggregates, not course spines
        d = load_json(sp)
        if d:
            qual = (d.get("meta") or {}).get("qual", "")
            slug = sp.stem
            if not qual:
                finding("FAIL", slug, "C3-spine", "spine meta.qual empty")
            elif not slug.startswith(qual):
                # by design some quals are shared across variant courses
                # (e.g. the ial-maths spine also serves ial-further-maths FP1)
                finding("WARN", slug, "C3-spine",
                        f"spine meta.qual={qual!r} is not a slug prefix (shared spine?)")
    for cm in sorted((root / "content-maps").glob("*.json")):
        d = load_json(cm)
        if d and d.get("course") and d["course"] != cm.stem:
            finding("FAIL", cm.stem, "C3-spine", f"content-map course={d['course']!r} != filename")

    # ---------- value-domain report ----------
    print("=== learned board map (curriculum -> kg meta) ===")
    for k, v in sorted(board_map.items()):
        print(f"  {k!r} -> {v!r}")

    # ---------- report ----------
    fails = [f for f in findings if f[0] == "FAIL"]
    warns = [f for f in findings if f[0] == "WARN"]
    lines = []
    lines.append(f"CONTENT TAG AUDIT — {datetime.date.today().isoformat()}")
    lines.append(f"corpus: {len(course_dirs)} course dirs, {len(kg_slugs)} kg exports, "
                 f"{len(reg_slugs)} registry entries, {len(idx_slugs)} index entries")
    lines.append("")
    lines.append(f"RESULT: {'PASS' if not fails else 'FAIL'} — "
                 f"{len(fails)} FAIL, {len(warns)} WARN across "
                 f"{len(course_dirs)} courses (7 tag surfaces)")
    lines.append("")
    if findings:
        lines.append("FINDINGS:")
        for sev, course, cid, msg in findings:
            lines.append(f"  [{sev}] {course} {cid}: {msg}")
    else:
        lines.append("FINDINGS: none")
    report = "\n".join(lines)
    print(report)

    out = root.parent / "kg_audit" / "content-tag-audit-report.txt"
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(report + "\n", encoding="utf-8")
        print(f"\nreport copy: {out}")
    except Exception:  # noqa: BLE001
        pass

    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
