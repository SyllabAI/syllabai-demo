# Repository Map — where things live across SyllabAI

**Status: VERIFIED** (inspected via GitHub API, 2026-09-17, by the syllabai-demo recon agent)

Findings that materially affect the demo, per repo.

## SyllabAI/syllabai (master pack)

- `MASTER_SPEC.md` v1.3 (+ Addenda 1.4/1.5) — engineering source of truth; §8 canonical document format, §22 DTO boundaries, §27 parser contracts
- `DECISIONS.md` ADR-001…023; notable: ADR-001/009 (stack lock), ADR-011 (polyglot policy), ADR-012 (modular monolith), ADR-019 (Cycle-1 = IGCSE Chemistry 4CH1), ADR-020 (retrieval benchmark gate), ADR-021 (content compiler / portable packages), ADR-023 (LLM provider pool)
- `PROJECT_CONTEXT.md` / `PROGRESS.md` / `TODO.md` — living state; sessions numbered into the 90s
- `.syllabai/` — agent registry, locks, task templates, evidence packs (multi-agent operating system)
- Open issues include `#10 T-LIL: Local Intelligence Layer research and implementation spike`

## SyllabAI/syllabai-core (authoritative backend — Java 25 / Spring Boot 4.1)

- 26 REST controllers under `src/main/java/com/syllabai/**`:
  - learner: `AuthController`, `CurriculumController`, `KnowledgeController` (tree/prerequisites), `QuestionController`, `ExamPaperController`, `AttemptController(+History)`, `LearnerStateController`, `SmartLessonController`, `LearnerRecommendationController`, `RevisionNoteLearnerController`, `ClaController` (contextual learning assistant), `TutorController`
  - teacher: `TeacherReview/Marking/Content/Roster/ClassAnalytics/TestBuilder/ConceptGraph/Curriculum`, `GlmOcrIngestionController`
  - infra: `LlmAdminController`, `BootstrapAdminController`, `InterventionRunController`
- Modules (ADR-012 packages, not microservices): identity, curriculum, knowledge (KG + recursive-CTE prerequisite closure), content (canonical documents, chunking, embeddings), assessment, smartmark, learner (BKT/BDT/Ebbinghaus), tutor (KA-RAG), diagnostic, recommendation, teacher, research, infrastructure
- Free-LLM chain behind `LlmProvider`: Groq → Gemini 2.5 Flash → OpenRouter, with health/cooldown + experiment pinning
- Demo relevance: the **full API surface + DTO shapes** were lifted from `syllabai-web/src/lib/api.ts` + `types.ts` (mirrors Master Spec §22) into `src/lib/contracts.ts` (simplified, read-only)

## SyllabAI/syllabai-web (production frontend — Next.js 16 / React 19)

- **Single page + view-component architecture**: `src/app/page.tsx` switches views from `src/components/syllabai/` (KnowledgeGraphView, ConceptGraphView, MasteryMap, RevisionNotesView, PapersView, PracticeView, TutorChatView, SmartLessonView, teacher views…)
- `src/lib/api.ts` — the complete API client (auth, tree, questions, attempts, learner state, recommendations, smart lesson, CLA, marking, content validation, papers, revision notes + assets)
- `src/lib/types.ts` — 60+ DTO interfaces (canonical mirror of backend §22)
- **Knowledge graph visualization is custom SVG** (no graph library in deps): `KnowledgeGraphView.tsx` implements a layered left-to-right layout (leaf slotting, parent centering, de-collision sweep, bezier hierarchy + dashed prerequisite edges). **Ported** into `src/components/graph/layout.ts` + `SpecGraphCanvas` rather than rewritten
- `ConceptGraphView.tsx` — teacher concept-graph surface with the honesty rules (OFFICIAL CURRICULUM ANCHOR vs GRAPH-DERIVED layer; provenance always visible; explicit empty states). Rules re-implemented in the demo's concept web
- Tailwind 4 + shadcn/ui (New York) + Lucide — same visual system as the demo
- Deployment: Vercel Hobby at `https://syllabai-web.vercel.app`

## SyllabAI/syllabai-resources (content corpora — 38,823 files)

- `SME-ExamQuestion/<course>/<section>/<subtopic>/` — `topic.json` (schema `syllabai.sme-exam-questions/1.1`: curriculum identity, subtopics, questions with parts `problem_md`/`solution_md`, `command_word`, `spec_point_codes`, assets), plus `questions.md` / `mark-schemes.md` / `assets/`
- `SME-RevisionNotes/<course>/notes/...` — markdown notes with YAML frontmatter (`note_id rn_*`, `spec_point_ids spcpt_*`, `spec_point_codes 4CH1-x.y`, `guided_study`, source URL)
- `graph/` — **graph-as-code**:
  - `topics.yaml` (4 topics, 28 subtopics), `specification_points.yaml` (182 spec points, RULE_DERIVED, PDF-crosschecked)
  - `relationships.yaml` (210 skeleton edges; edge vocabulary from V2 `knowledge_edges` enum)
  - `concepts.yaml` + `concept_edges.yaml` (T-C11: 113 nodes = 98 concepts + 15 misconceptions; 275 edges incl. PART_OF/RELATED_TO/REQUIRES_PREREQUISITE/COMMONLY_CONFUSED_WITH/WRONG_ANSWER_PATTERN; provenance `AI_SUGGESTED`, operator validation gate)
- `Official-Specifications/`, `Chemistry IGCSE Revision Notes/` (legacy corpus w/ assets), `student-book-pilot/`
- **Flashcards do not exist as an upstream corpus** — the demo's flashcards are `DEMO_DERIVED` from the notes' spec-point callouts (an experiment, not an import)

## SyllabAI/syllabai-pastpapers + SyllabAI/Past-Papers (exam corpora)

- `syllabai-pastpapers`: canonical QP/MS corpus, charter-governed (README = charter), 2,708 PDFs examined → 2,512 files / 1,361 papers, SHA-256 manifests, two-layer model (filesystem + authoritative metadata)
- `Past-Papers`: raw operator-collected source PDFs (pre-normalization)
- Demo relevance: not bundled in v0 (large); the content-compiler / portable content package work (ADR-021, `CONTENT_PACKAGE_V0_1.md`) is the intended future bridge

## SyllabAI/syllabai-teacher-workbench (validation tooling)

- Staged decision importer, hash-chained staging log, evidence packs, Vercel readonly-mirror deploy
- Demo relevance: the teacher-validation workflow is a natural future experiment surface (Smart Mark → remediation loops)

## SyllabAI/syllabai-ops (automation)

- Drive mirror, Google-Sheet dashboard, Discord digest, CI quota sentinel, pilot monitor (19 read-only production probes)
- Demo relevance: none direct; pattern reference for "fail-loud" monitoring culture

## Key identifiers the demo preserves

| Identifier | Example | Source |
|---|---|---|
| Spec point code | `4CH1-1.25` (C-suffixed = chemistry-only) | `specification_points.yaml` |
| Concept node | `4CH1-CON-STATES-THREE` | `concepts.yaml` |
| Misconception node | `4CH1-MIS-*` | `concepts.yaml` |
| Revision note | `rn_2VnK66PqbvFKdKYt` | SME-RevisionNotes frontmatter |
| Question / part | `qstn_*` / `qstnprt_*` | SME-ExamQuestion topic.json |
| Validation states | SUGGESTED / VALIDATED / REJECTED / FLAGGED | Master Spec §7 |
| Mastery bands | LOW / DEVELOPING / SECURE / UNMEASURED | learner module |
| Provenance tiers | RULE_DERIVED / AI_SUGGESTED / HUMAN_VALIDATED | graph-as-code |
