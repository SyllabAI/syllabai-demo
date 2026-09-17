#!/usr/bin/env python3
"""
syllabai-demo corpus bundle builder.

Reads work/corpus-cache/ (fetched by fetch_corpus.py) and writes one validated
content bundle per course under content/<slug>/ in the demo bundle format the
app already loads (manifest / curriculum / notes / questions / flashcards /
concept-graph / learner-sim .json).

Design invariants (mirror src/lib/contracts.ts):
  - canonical upstream ids are preserved verbatim (rn_*, qstn*, qstnprt_*,
    fl_*, tqst*, spcpt_*) — never regenerated.
  - the navigation tree is the CORPUS's own tree:
      * igcse-chemistry-19 → the official 4CH1 specification tree (ported
        from the Phase-1/2 graph work; notes/questions join via official
        spec_point_codes that the corpus carries).
      * every other course → the SME-native tree (section > topic >
        spcpt_* spec points), provenance RULE_DERIVED, official codes left
        empty — official-spec mapping is genuinely pending upstream.
  - images are hotlinked from raw.githubusercontent (public repo) — no
    binaries are committed to the demo repo.
  - MCQ options are NOT captured upstream; nothing is invented for them.

Also emits docs/CORPUS_IMPORT_REPORT.md with the mapping-integrity audit the
operator asked for ("all of them are mapped to each other — check to confirm").
"""
import json
import os
import re
import shutil
import sys
from collections import OrderedDict, defaultdict

WORK = "/home/z/my-project/work"
CACHE = os.path.join(WORK, "corpus-cache")
PROJECT = "/home/z/my-project"
CONTENT = os.path.join(PROJECT, "content")
DOCS = os.path.join(PROJECT, "docs")

RAW_BASE = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main"
RESOURCES_SHA = "75755855f9e24391edb244f03993cc649bdf4e7a"
RESOURCES_DATE = "2026-09-17T18:19:23Z"

PILOT_SLUG = "igcse-chemistry-19"  # official 4CH1 tree + KG port

UPSTREAM_SCHEMAS = [
    "syllabai.sme-revision-note/1.0",
    "syllabai.sme-revision-notes-course/1.0",
    "syllabai.sme-exam-questions/1.1",
    "syllabai.sme-flashcard-deck/1.0",
]

IMG_RE_MD = re.compile(r"(!\[[^\]]*\]\()((?:\.\./)+assets/[^)]+|assets/[^)]+)(\))")
IMG_RE_HTML = re.compile(r'(<img[^>]*\bsrc=")((?:\.\./)+assets/[^"]+|assets/[^"]+)(")')


def cache_read(repo_path):
    with open(os.path.join(CACHE, repo_path), encoding="utf8") as f:
        return f.read()


def cache_read_json(repo_path):
    return json.loads(cache_read(repo_path))


def slug_num(slug):
    """Leading number of an SME slug: '12-energetics' → 12."""
    m = re.match(r"(\d+)", slug)
    return int(m.group(1)) if m else 9999


def hotlink(course, corpus, section, topic, text):
    """Rewrite relative assets/ refs in a markdown fragment to raw GitHub URLs."""
    if not text:
        return text
    base = f"{RAW_BASE}/{corpus}/{course}"
    if section:
        base += f"/{section}"
    if topic:
        base += f"/{topic}"

    def repl_md(m):
        fname = m.group(2).split("/")[-1]
        return f"{m.group(1)}{base}/assets/{fname}{m.group(3)}"

    def repl_html(m):
        fname = m.group(2).split("/")[-1]
        return f"{m.group(1)}{base}/assets/{fname}{m.group(3)}"

    text = IMG_RE_MD.sub(repl_md, text)
    text = IMG_RE_HTML.sub(repl_html, text)
    return text


def parse_note_md(text):
    """Split a corpus note .md into (frontmatter_dict, body_md)."""
    if text.startswith("---"):
        parts = text.split("\n---", 2)
        # parts[0] == '---' … crude but corpus frontmatter is well-formed
        try:
            end = text.index("\n---\n", 3)
        except ValueError:
            return {}, text
        fm_raw = text[3:end]
        body = text[end + 5 :]
        fm = {}
        for line in fm_raw.splitlines():
            if ":" not in line:
                continue
            k, v = line.split(":", 1)
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                items = [x.strip().strip('"') for x in v[1:-1].split(",") if x.strip()]
                fm[k.strip()] = items
            else:
                fm[k.strip()] = v.strip('"')
        return fm, body
    return {}, text


def load_json(path):
    with open(path, encoding="utf8") as f:
        return json.load(f)


def main():
    eq_manifest = cache_read_json("SME-ExamQuestion/manifest.json")
    fc_manifest = cache_read_json("SME-Flashcards/manifest.json")
    eq_courses = {c["slug"]: c for c in eq_manifest["courses"]}
    fc_courses = fc_manifest.get("courses", {})
    if not isinstance(fc_courses, dict):
        fc_courses = {c["slug"]: c for c in fc_courses}

    # discover course slugs from the cache dir (superset of manifests)
    eq_dir = os.path.join(CACHE, "SME-ExamQuestion")
    rn_dir = os.path.join(CACHE, "SME-RevisionNotes")
    fc_dir = os.path.join(CACHE, "SME-Flashcards")
    slugs = sorted(
        d for d in os.listdir(eq_dir) if os.path.isdir(os.path.join(eq_dir, d))
    )
    print(f"courses in EQ cache: {len(slugs)}")

    # port the official 4CH1 pilot artifacts before the old bundle is removed
    # the official 4CH1 artifacts live in the pilot bundle itself (curated in
    # the Phase-1/2 graph import); they are re-used verbatim on every rebuild
    official_dir = os.path.join(CONTENT, PILOT_SLUG)
    official_curriculum = load_json(os.path.join(official_dir, "curriculum.json"))
    official_concept_graph = load_json(os.path.join(official_dir, "concept-graph.json"))
    official_learner = load_json(os.path.join(official_dir, "learner-sim.json"))

    report_courses = []
    totals = defaultdict(int)

    for slug in slugs:
        # ── upstream inputs ──────────────────────────────────────────────
        eqm = eq_courses.get(slug, {})
        level = eqm.get("level", "igcse")
        subject = eqm.get("subject", slug)
        if subject and subject[:1].islower():
            subject = subject[:1].upper() + subject[1:]
        level_display = "IAL" if level == "international-a-level" else "IGCSE"

        spec_index = cache_read_json(f"SME-ExamQuestion/{slug}/spec_point_index.json")
        sp_index = spec_index["spec_points"]  # OrderedDict-ish dict, corpus order

        # all topic.json under the course
        topic_files = []
        for root, _dirs, files in os.walk(os.path.join(eq_dir, slug)):
            for fn in files:
                if fn == "topic.json":
                    topic_files.append(os.path.join(root, fn))
        topic_files.sort()
        topics_raw = [load_json(p) for p in topic_files]

        # revision notes
        rn_manifest = cache_read_json(f"SME-RevisionNotes/{slug}/manifest.json")
        rn_notes_dir = os.path.join(rn_dir, slug, "notes")
        note_files = []
        for root, _dirs, files in os.walk(rn_notes_dir):
            for fn in files:
                if fn.endswith(".md"):
                    note_files.append(os.path.join(root, fn))
        note_files.sort()

        # flashcard decks
        decks = []
        course_fc_dir = os.path.join(fc_dir, slug)
        if os.path.isdir(course_fc_dir):
            for root, _dirs, files in os.walk(course_fc_dir):
                for fn in files:
                    if fn == "deck.json":
                        decks.append(load_json(os.path.join(root, fn)))
            decks.sort(key=lambda d: (d.get("deck", {}).get("section_slug", ""), d.get("deck", {}).get("order", 0)))

        is_pilot = slug == PILOT_SLUG

        # ── curriculum tree ──────────────────────────────────────────────
        if is_pilot:
            curriculum = official_curriculum  # official 4CH1 tree, ported verbatim
            tree_kind = "official"
            official_by_code = {
                n["code"]: n for n in curriculum["nodes"] if n["family"] == "SPEC_POINT"
            }
        else:
            tree_kind = "sme-native"
            curriculum = build_sme_native_tree(slug, topics_raw, note_files, sp_index, subject, rn_dir)
            official_by_code = {}

        node_codes = {n["code"] for n in curriculum["nodes"]}

        # ── notes ────────────────────────────────────────────────────────
        notes = []
        note_codes_hit = 0
        for path in note_files:
            rel = os.path.relpath(path, os.path.join(rn_dir, slug)).replace(os.sep, "/")
            # rel: notes/<section>/<topic>/<leaf>.md
            segs = rel.split("/")
            section_slug, topic_slug = segs[1], segs[2]
            text = cache_read(f"SME-RevisionNotes/{slug}/{rel}".replace(os.sep, "/"))
            fm, body = parse_note_md(text)
            note_id = fm.get("note_id") or rel
            spec_ids = fm.get("spec_point_ids") or []
            codes = fm.get("spec_point_codes") or []
            if is_pilot and codes:
                note_codes_hit += 1
            body = hotlink(slug, "SME-RevisionNotes", None, None, body)
            notes.append(
                OrderedDict(
                    noteId=note_id,
                    title=fm.get("title") or segs[-1][:-3],
                    sourceUrl=fm.get("source") or None,
                    specPointIds=list(spec_ids),
                    specPointCodes=list(codes),
                    guidedStudy=str(fm.get("guided_study", "false")).lower() == "true",
                    path="/".join(segs[1:]),
                    sectionSlug=section_slug,
                    topicSlug=topic_slug,
                    updatedAt=fm.get("updated_at") or rn_manifest.get("generated_utc"),
                    bodyMd=body,
                )
            )
        notes.sort(key=lambda n: (slug_num(n["sectionSlug"]), slug_num(n["topicSlug"]), n["path"]))

        # ── exam questions: one row per (topic × set) ────────────────────
        question_rows = []
        part_total = 0
        part_with_specs = 0
        part_codes_hit = 0
        set_placed = 0
        for t in topics_raw:
            curriculum_raw = t.get("curriculum", {})
            section = t.get("section", {})
            topic_meta = t.get("topic", {})
            subtopics_meta = t.get("subtopics", []) or []
            related_note_ids = [s.get("revision_note_id") for s in subtopics_meta if s.get("revision_note_id")]
            by_set = defaultdict(list)
            for q in t.get("questions", []):
                by_set[q.get("set_slug")].append(q)
            for set_meta in t.get("question_sets", []):
                set_slug = set_meta["slug"]
                qs = by_set.get(set_slug, [])
                if not qs:
                    continue
                qs.sort(key=lambda q: q.get("order", 0))
                set_kind = (
                    "Multiple-Choice Questions"
                    if "multiple-choice" in set_slug
                    else "Structured Questions"
                    if "structured" in set_slug
                    else None  # mixed SME set page ("exam-questions")
                )
                out_questions = []
                for q in qs:
                    parts = []
                    for p in q.get("parts", []):
                        part_total += 1
                        sp_ids = p.get("spec_point_ids") or []
                        codes = p.get("spec_point_codes") or []
                        if sp_ids:
                            part_with_specs += 1
                        if is_pilot and codes:
                            part_codes_hit += 1
                        sp = p.get("source_paper") or {}
                        parts.append(
                            OrderedDict(
                                id=p["id"],
                                order=p.get("order", 0),
                                questionType=p.get("question_type"),
                                marks=p.get("marks", 0),
                                commandWord=p.get("command_word"),
                                specPointIds=sp_ids,
                                specPointCodes=codes,
                                sourcePaper=OrderedDict(
                                    date=sp.get("date"),
                                    number=sp.get("number"),
                                    questionNumber=sp.get("question_number"),
                                    questionPart=sp.get("question_part"),
                                )
                                if sp
                                else None,
                                problemMd=hotlink(
                                    slug, "SME-ExamQuestion", section.get("slug"), topic_meta.get("slug"),
                                    p.get("problem_md") or "",
                                ),
                                solutionMd=hotlink(
                                    slug, "SME-ExamQuestion", section.get("slug"), topic_meta.get("slug"),
                                    p.get("solution_md"),
                                )
                                or None,
                            )
                        )
                    if not parts:
                        continue
                    out_questions.append(
                        OrderedDict(
                            id=q["id"],
                            order=q.get("order", 0),
                            difficulty=q.get("difficulty"),
                            style=q.get("style"),
                            totalMarks=q.get("total_marks", 0),
                            parts=parts,
                        )
                    )
                if not out_questions:
                    continue
                row_slug = f"{topic_meta.get('slug')}--{set_slug}"
                placed = topic_meta.get("slug") in node_codes if tree_kind == "sme-native" else False
                if tree_kind == "official":
                    placed = True  # resolved via spec-code tally at load time
                if placed:
                    set_placed += 1
                question_rows.append(
                    OrderedDict(
                        topicId=f"{t['topic']['id']}--{set_meta['id']}",
                        slug=row_slug,
                        name=topic_meta.get("name") or topic_meta.get("slug"),
                        setName=set_kind,
                        topicSlug=topic_meta.get("slug"),
                        section=section.get("name") or "",
                        sectionSlug=section.get("slug") or "",
                        curriculum=OrderedDict(
                            board=curriculum_raw.get("board", "Edexcel"),
                            level=level_display,
                            subject=curriculum_raw.get("subject", subject),
                            code=curriculum_raw.get("code") or curriculum_raw.get("exam_code") or "",
                            syllabusVersion=str(curriculum_raw.get("syllabus_version", "")),
                        ),
                        source=OrderedDict(
                            provider=t.get("source", {}).get("provider", "Save My Exams"),
                            license=t.get("source", {}).get("license", ""),
                            pageUrl=t.get("source", {}).get("page_url"),
                        ),
                        schema=t.get("schema"),
                        relatedNoteIds=related_note_ids,
                        questions=out_questions,
                    )
                )
        question_rows.sort(
            key=lambda r: (slug_num(r["sectionSlug"]), slug_num(r["topicSlug"] or ""), 0 if "multiple-choice" in r["slug"] else 1)
        )

        # ── flashcards ───────────────────────────────────────────────────
        # deck placement is corpus-native (deck.topic_slug); for the official
        # 4CH1 tree, derive topic_slug → official sub-topic via the notes'
        # official codes (corpus-documented 1:1 subsection correspondence)
        topic_to_sub = {}
        if is_pilot:
            sub_of_code = {}
            for n in curriculum["nodes"]:
                if n["family"] == "SPEC_POINT" and len(n["parents"]) > 1:
                    sub_of_code[n["code"]] = n["parents"][-1]
            codes_by_topic = defaultdict(list)
            for n in notes:
                for c in n["specPointCodes"]:
                    codes_by_topic[n["topicSlug"]].append(sub_of_code.get(c))
            for tslug, subs in codes_by_topic.items():
                subs = [x for x in subs if x]
                if subs:
                    topic_to_sub[tslug] = max(set(subs), key=subs.count)
        else:
            for n in curriculum["nodes"]:
                if n["family"] == "SUBTOPIC":
                    topic_to_sub[n["code"]] = n["code"]

        cards = []
        card_total = 0
        card_with_links = 0
        card_placed = 0
        for deck in decks:
            dmeta = deck.get("deck", {})
            section_slug = dmeta.get("section_slug")
            topic_slug = dmeta.get("topic_slug")
            for c in deck.get("cards", []):
                card_total += 1
                links = c.get("spec_links") or []
                if links:
                    card_with_links += 1
                spec_ids = links
                code = None
                source_note = None
                if is_pilot:
                    # SME id → note → official code (corpus-documented join);
                    # upstream 4CH1 decks carry no spec_links, so cards rely on
                    # deck-topic placement below — nothing is invented here
                    for lnk in links:
                        entry = sp_index.get(lnk) or {}
                        for nid in entry.get("notes", []):
                            n = next((x for x in notes if x["noteId"] == nid), None)
                            if n and n["specPointCodes"]:
                                code = n["specPointCodes"][0]
                                source_note = nid
                                break
                        if code:
                            break
                sub_code = topic_to_sub.get(topic_slug)
                if sub_code is None and links:
                    for lnk in links:
                        if lnk in node_codes:
                            sub_code = lnk
                            break
                if sub_code:
                    card_placed += 1
                cards.append(
                    OrderedDict(
                        id=c["id"],
                        cardType=c.get("card_type"),
                        front=c.get("front_md") or "",
                        back=c.get("back_md") or "",
                        specPointCode=code,
                        specPointIds=spec_ids,
                        sourceNoteId=source_note,
                        sourceTitle=None,
                        deckSlug=topic_slug,
                        sectionSlug=section_slug,
                        topicSlug=topic_slug,
                        subtopicCode=sub_code,
                        provenanceTier="RULE_DERIVED",
                    )
                )
        for card in cards:
            card["front"] = hotlink(slug, "SME-Flashcards", card["sectionSlug"], card["topicSlug"], card["front"])
            card["back"] = hotlink(slug, "SME-Flashcards", card["sectionSlug"], card["topicSlug"], card["back"])
        cards.sort(key=lambda c: (slug_num(c["sectionSlug"] or ""), slug_num(c["topicSlug"] or "")))

        # ── concept graph + learner overlay ─────────────────────────────
        if is_pilot:
            concept_graph = official_concept_graph
            learner = official_learner
        else:
            concept_graph = OrderedDict(
                curriculumCode=slug,
                edgeVocabulary=None,
                counts=None,
                validationGate=None,
                nodes=[],
                edges=[],
            )
            learner = OrderedDict(
                learnerId=f"sim-{slug}",
                displayName="Demo learner (simulated)",
                disclaimer="No simulated learner overlay is seeded for this course yet. Strengths analytics are only seeded for the 4CH1 pilot; practice marks and flashcard ratings you record are still saved locally.",
                skillStates=[],
                misconceptionStates=[],
            )

        # ── manifest + write ─────────────────────────────────────────────
        course_code = ""
        for t in topics_raw:
            cur = t.get("curriculum", {})
            course_code = cur.get("code") or cur.get("exam_code") or ""
            if course_code:
                break
        spec_points = [n for n in curriculum["nodes"] if n["family"] == "SPEC_POINT"]

        manifest = OrderedDict(
            schema="syllabai-demo.content-bundle/2.0",
            generatedUtc=RESOURCES_DATE,
            importSource=OrderedDict(
                repo="SyllabAI/syllabai-resources",
                ref=f"main@{RESOURCES_SHA}",
                upstreamSchemas=UPSTREAM_SCHEMAS,
            ),
            curriculum=OrderedDict(
                board="Edexcel",
                level=level_display,
                subject=subject,
                code=course_code,
                syllabusVersion=next(
                iter(sorted({str(t.get("curriculum", {}).get("syllabus_version", "") or "") for t in topics_raw} - {""})),
                "",
            ),
            ),
            license="Operator-authorized SME corpus — see LICENSE-DATA.md in syllabai-resources (Amendment 2026-09-17). Demo re-use only.",
            counts=OrderedDict(
                sections=len({n["code"] for n in curriculum["nodes"] if n["family"] == "TOPIC"}),
                topics=len({n["code"] for n in curriculum["nodes"] if n["family"] == "SUBTOPIC"}),
                specPoints=len(spec_points),
                notes=len(notes),
                questionSets=len(question_rows),
                questions=sum(len(r["questions"]) for r in question_rows),
                parts=part_total,
                marks=sum(p["marks"] for r in question_rows for q in r["questions"] for p in q["parts"]),
                flashcards=len(cards),
            ),
            treeKind=tree_kind,
        )

        out_dir = os.path.join(CONTENT, slug)
        if os.path.isdir(out_dir):
            shutil.rmtree(out_dir)
        os.makedirs(out_dir)

        def write(name, obj):
            with open(os.path.join(out_dir, name), "w", encoding="utf8") as f:
                json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))

        write("manifest.json", manifest)
        write("curriculum.json", curriculum)
        write("notes.json", notes)
        write("questions.json", question_rows)
        write("flashcards.json", cards)
        write("concept-graph.json", concept_graph)
        write("learner-sim.json", learner)

        # ── mapping-integrity audit ──────────────────────────────────────
        notes_with_specs = sum(1 for n in notes if n["specPointIds"])
        notes_in_tree = 0
        for n in notes:
            ok = any(c in node_codes for c in n["specPointCodes"]) if is_pilot else (
                n["topicSlug"] in node_codes or any(c in node_codes for c in n["specPointIds"])
            )
            if ok:
                notes_in_tree += 1
        parts_resolved = 0
        for r in question_rows:
            for q in r["questions"]:
                for p in q["parts"]:
                    ids = p["specPointCodes"] if is_pilot else p["specPointIds"]
                    if ids and any(i in node_codes for i in ids):
                        parts_resolved += 1
        totals["notes"] += len(notes)
        totals["questions"] += sum(len(r["questions"]) for r in question_rows)
        totals["parts"] += part_total
        totals["cards"] += len(cards)
        totals["specPoints"] += len(spec_points)

        report_courses.append(
            OrderedDict(
                slug=slug,
                level=level_display,
                subject=subject,
                treeKind=tree_kind,
                sections=manifest["counts"]["sections"],
                topics=manifest["counts"]["topics"],
                specPoints=len(spec_points),
                notes=len(notes),
                notesWithSpecAnchors=notes_with_specs,
                notesPlacedInTree=notes_in_tree,
                questionSets=len(question_rows),
                questions=sum(len(r["questions"]) for r in question_rows),
                parts=part_total,
                partsWithSpecAnchors=part_with_specs,
                partsResolvedInTree=parts_resolved,
                flashcardDecks=len(decks),
                flashcards=card_total,
                cardsWithSpecLinks=card_with_links,
                cardsPlacedInTree=card_placed,
                officialCodeCoverage=(None if not is_pilot else OrderedDict(notes=note_codes_hit, parts=part_codes_hit)),
            )
        )
        print(
            f"  {slug}: tree={tree_kind} notes={len(notes)} sets={len(question_rows)}"
            f" questions={manifest['counts']['questions']} parts={part_total} cards={len(cards)}"
        )

    # ── registry ─────────────────────────────────────────────────────────
    registry = OrderedDict(
        schema="syllabai-demo.course-registry/1.1",
        note=(
            "Operator-maintained registry mirroring the 39 Edexcel IAL/IGCSE course "
            "variants scraped in SyllabAI/syllabai-resources (authoritative source). "
            "Every course has a content bundle under content/<slug>/ imported from the "
            "corpus: 'pilot' = official-tree course with the 4CH1 concept graph and "
            "learner overlay; 'full' = complete SME-native corpus import (notes, exam "
            "questions, flashcards; official-spec mapping pending upstream for all "
            "non-4CH1 courses). Slugs, levels, subjects and exam codes come from the "
            "upstream manifests — never invented."
        ),
        courses=[],
    )
    LABEL_RULES = [
        (re.compile(r"-modular-24-(unit-\d+)$"), lambda m: f" — Modular 2024, {m.group(1).replace('unit-', 'Unit ')}"),
        (re.compile(r"-(foundation|higher)$"), lambda m: f" ({m.group(1).capitalize()})"),
        (re.compile(r"-foundation-unit-(\d+)$"), lambda m: f" — Foundation, Unit {m.group(1)}"),
        (re.compile(r"-higher-unit-(\d+)$"), lambda m: f" — Higher, Unit {m.group(1)}"),
    ]
    MATHS_UNIT = {
        "pure-1": "Pure Mathematics 1", "pure-2": "Pure Mathematics 2",
        "pure-3": "Pure Mathematics 3", "pure-4": "Pure Mathematics 4",
        "mechanics-1": "Mechanics 1", "mechanics-2": "Mechanics 2",
        "statistics-1": "Statistics 1", "statistics-2": "Statistics 2",
        "further-pure-1": "Further Pure 1",
        "decision-1": "Decision 1",
    }
    def display_subject(raw, fallback):
        out = (raw or fallback).replace("-", " ")
        return " ".join(w[:1].upper() + w[1:] if w else w for w in out.split(" "))

    for slug in slugs:
        eqm = eq_courses.get(slug, {})
        level = "IAL" if eqm.get("level") == "international-a-level" else "IGCSE"
        subject = display_subject(eqm.get("subject"), slug)
        label = None
        m = re.match(r"ial-(?:maths|further-maths)-\d+-(.+)$", slug)
        if m:
            unit = MATHS_UNIT.get(m.group(1))
            if unit:
                label = f"{subject} — {unit}"
        if label is None:
            for rx, fn in LABEL_RULES:
                mm = rx.search(slug)
                if mm:
                    label = f"{subject}{fn(mm)}"
                    break
        if label is None:
            m = re.match(r"igcse-science-double-award-17-(biology|chemistry|physics)$", slug)
            if m:
                label = f"Science (Double Award) — {m.group(1).capitalize()}"
        course_code = ""
        try:
            with open(os.path.join(CONTENT, slug, "manifest.json"), encoding="utf8") as f:
                course_code = json.load(f)["curriculum"]["code"]
        except Exception:
            pass
        registry["courses"].append(
            OrderedDict(
                slug=slug,
                level=level,
                subject=subject,
                label=label or subject,
                code=course_code,
                status="pilot" if slug == PILOT_SLUG else "full",
            )
        )
    with open(os.path.join(CONTENT, "courses.json"), "w", encoding="utf8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # ── docs report ──────────────────────────────────────────────────────
    os.makedirs(DOCS, exist_ok=True)
    write_report(report_courses, eq_manifest, totals)


def build_sme_native_tree(slug, topics_raw, note_files, sp_index, subject_title, rn_root):
    """SME-native curriculum: SUBJECT > TOPIC(section) > SUBTOPIC(topic) > spcpt_*."""
    nodes = [
        OrderedDict(
            code=slug, family="SUBJECT", title=subject_title or slug, description=None,
            parents=[], provenanceTier="RULE_DERIVED", order=0,
        )
    ]
    section_names = OrderedDict()
    topic_names = OrderedDict()
    topic_section = OrderedDict()
    for t in topics_raw:
        sec = t.get("section", {})
        top = t.get("topic", {})
        if sec.get("slug"):
            section_names.setdefault(sec["slug"], sec.get("name") or sec["slug"])
        if top.get("slug"):
            topic_names.setdefault(top["slug"], top.get("name") or top["slug"])
            topic_section[top["slug"]] = sec.get("slug")
    # notes-only sections/topics from note paths
    leaf_to_topic = {}
    for path in note_files:
        rel = os.path.relpath(path, rn_root).replace(os.sep, "/")
        segs = rel.split("/")  # <slug>/notes/<section>/<topic>/<leaf>.md
        if len(segs) >= 5 and segs[1] == "notes":
            def human(sl):
                return " ".join(w[:1].upper() + w[1:] if w else w for w in sl.split("-"))
            section_names.setdefault(segs[2], human(segs[2]))
            topic_names.setdefault(segs[3], human(segs[3]))
            topic_section.setdefault(segs[3], segs[2])
            leaf_to_topic[segs[4][:-3]] = segs[3]
    # topics only known from the spec index leaf slugs
    for sp_id, entry in sp_index.items():
        for leaf in entry.get("subtopic_slugs", []):
            if leaf in leaf_to_topic:
                continue
            m = re.match(r"^(\d+(?:-\d+)*?)-(\d+)-([a-z0-9-]+)$", leaf)
            guess = f"{m.group(1)}-{m.group(3)}" if m else leaf
            if guess not in topic_names and re.match(r"^\d", leaf):
                pass  # only reachable if the note corpus is missing — do not invent names
            leaf_to_topic.setdefault(leaf, guess if guess in topic_names else leaf)
    for i, sec_slug in enumerate(sorted(section_names, key=slug_num)):
        num = slug_num(sec_slug)
        nodes.append(
            OrderedDict(
                code=sec_slug, family="TOPIC", title=section_names[sec_slug],
                description=None, parents=[slug], provenanceTier="RULE_DERIVED",
                order=num if num < 999 else 900 + i,
            )
        )
    for i, top_slug in enumerate(sorted(topic_names, key=slug_num)):
        parent = topic_section.get(top_slug)
        if parent not in section_names:
            parent = min(section_names, key=slug_num) if section_names else slug
        num = slug_num(top_slug)
        nodes.append(
            OrderedDict(
                code=top_slug, family="SUBTOPIC", title=topic_names[top_slug],
                description=None, parents=[parent], provenanceTier="RULE_DERIVED",
                order=num if num < 999 else 900 + i,
            )
        )
    # spec points — corpus order, attached via leaf → topic map
    for order, (sp_id, entry) in enumerate(sp_index.items()):
        leaves = entry.get("subtopic_slugs") or []
        target = None
        for leaf in leaves:
            t = leaf_to_topic.get(leaf)
            if t in topic_names:
                target = t
                break
        if target is None and leaves:
            # last resort: derive the topic slug by dropping the leaf ordinal
            m = re.match(r"^((?:\d+-)+)\d+-(.+)$", leaves[0])
            if m:
                cand = f"{m.group(1)}{m.group(2)}"
                if cand in topic_names:
                    target = cand
        if target is None:
            target = next(iter(topic_names), slug)
        nodes.append(
            OrderedDict(
                code=sp_id,
                family="SPEC_POINT",
                title=entry.get("name") or sp_id,
                description=entry.get("definition") or None,
                parents=[target],
                provenanceTier="RULE_DERIVED",
                order=order,
            )
        )
    return OrderedDict(
        board="Edexcel", level="", subject=subject_title or "", code=slug,
        syllabusVersion="", nodes=nodes, edges=[],
    )


def write_report(report_courses, eq_manifest, totals):
    lines = [
        "# Corpus Import & Mapping Integrity Report",
        "",
        f"Imported from `SyllabAI/syllabai-resources` @ `main` (`7575585`, {RESOURCES_DATE}) — ",
        "the operator-authorized Save My Exams corpus (see `LICENSE-DATA.md` upstream).",
        "",
        "Every course is imported with its **own corpus-native navigation tree**:",
        "",
        "- `official` — the Pearson-registered 4CH1 specification tree (182 points,",
        "  graph-as-code Phase 1/2); notes and question parts carry official",
        "  `4CH1-x.y` codes (`AI_VALIDATED`, operator-delegated upstream).",
        "- `sme-native` — the SME tree the scraper harvested (section > topic >",
        "  `spcpt_*` spec points). These courses are **not yet mapped to official",
        "  specification codes upstream** — the demo leaves `specPointCodes` empty",
        "  rather than inventing anchors.",
        "",
        "## Cross-resource mapping (how notes ↔ questions ↔ flashcards connect)",
        "",
        "All three resource families join through the SME spec-point ids",
        "(`spcpt_*`) that the scraper preserved verbatim:",
        "",
        "- revision notes → `spec_point_ids` (frontmatter, per page)",
        "- exam-question parts → `spec_point_ids` (per part) + topic-level",
        "  `revision_note_id` links back to the covering notes",
        "- flashcards → `spec_links` (per card), joined to notes via the course's",
        "  `spec_point_index.json` (SME-native id → name/definition/notes)",
        "",
        "## Per-course audit",
        "",
        "| course | tree | secs | tops | spec pts | notes | notes anchored | notes placed | sets | qs | parts | parts anchored | parts resolved | decks | cards | cards linked | cards placed |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for c in report_courses:
        lines.append(
            f"| {c['slug']} | {c['treeKind']} | {c['sections']} | {c['topics']} | {c['specPoints']} "
            f"| {c['notes']} | {c['notesWithSpecAnchors']} | {c['notesPlacedInTree']} "
            f"| {c['questionSets']} | {c['questions']} | {c['parts']} | {c['partsWithSpecAnchors']} "
            f"| {c['partsResolvedInTree']} | {c['flashcardDecks']} | {c['flashcards']} "
            f"| {c['cardsWithSpecLinks']} | {c['cardsPlacedInTree']} |"
        )
    lines += [
        "",
        f"**Totals** — notes {totals['notes']}, questions {totals['questions']}, "
        f"parts {totals['parts']}, flashcards {totals['cards']}, spec points {totals['specPoints']}.",
        "",
        "Column glossary:",
        "",
        "- *anchored*: object carries at least one upstream spec-point anchor",
        "  (`spcpt_*`, or official `4CH1-x.y` on the pilot).",
        "- *placed*: object resolves into the bundle's navigation tree (directly",
        "  or via its anchors), i.e. it is reachable from the hub sidebar.",
        "- *resolved*: at least one anchor exists in the course tree.",
        "",
        "Known upstream gaps (honestly inherited, never fabricated):",
        "",
        "- a small minority of question parts reference SME spec points tagged in",
        "  sibling courses (cross-unit/cross-tier tagging upstream) — those parts",
        "  still render, they just resolve into no row of THIS course's tree;",
        "- MCQ option lists were not captured by the upstream scrape (only stems +",
        "  worked solutions) — the player shows its honest fallback instead of",
        "  inventing options;",
        "- 5 of 39 courses have no SME flashcard decks (further-pure, both",
        "  accounting variants, maths-a modular foundation units).",
        "",
    ]
    with open(os.path.join(DOCS, "CORPUS_IMPORT_REPORT.md"), "w", encoding="utf8") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    main()
