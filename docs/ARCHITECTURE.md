# syllabai-demo — Architecture

**Status: ACCEPTED (initial shell)**

## 1. How the demo connects to the SyllabAI system

```text
                        ┌──────────────────────────── syllabai-demo ───────────────────────────┐
  Browser ─────────────►│  surfaces (server components + client islands)                       │
                        │      │                                                               │
                        │      ├── DemoDataProvider ──┬── MockProvider   (bundled real corpus) │
                        │      │   (src/lib/data)    ├── NeonProvider   (Drizzle + Neon, env-gated) │
                        │      │                     └── CoreApiProvider (syllabai-core REST)  │
                        │      ├── AIProvider (src/lib/ai, server-only)                        │
                        │      │        ├── Groq · OpenRouter · Gemini · FreeLLM (keyed)       │
                        │      │        ├── z.ai (sandbox default) └── mock (offline fallback) │
                        │      └── retrieval-lite (BM25 over bundled corpus → sufficiency gate)│
                        └──────────────────────────────────────────────────────────────────────┘
                                        │                        │
                       NEON_DATABASE_URL│     SYLLABAI_CORE_BASE_URL
                                        ▼                        ▼
                                   Neon PostgreSQL          syllabai-core (authoritative)
                                (demo read models only)     (production Java backend)
```

Experiment types enabled (brief §7):

- **A** Browser → demo → mock JSON *(default; hermetic)*
- **B** Browser → demo → Neon *(set `NEON_DATABASE_URL`)*
- **C** Browser → demo → syllabai-core API *(set `SYLLABAI_CORE_BASE_URL`)*
- **D** Browser → demo → Neon + AI provider
- **E** Browser → demo → syllabai-core + AI provider

## 2. Data modes

| Provider | Activation | Behavior |
|---|---|---|
| `mock` | default | Serves the committed `content/igcse-chemistry/*.json` bundles (Zod-validated at load). Canonical ids (`rn_*`, `qstn_*`, `4CH1-*`) preserved exactly. |
| `neon` | postgres URL present | Drizzle schema in `src/lib/data/neon.ts` (`curriculum_nodes`, `concept_nodes`, `graph_edges`, `revision_notes`, `exam_questions`, `flashcards`, `sim_skill_states`). Unseeded surfaces **fall back to the bundled corpus** — the demo never breaks on an empty table. |
| `core-api` | `SYLLABAI_CORE_BASE_URL` set | Server-side fetches against the authoritative API. Unprovisioned surfaces degrade to mock **with an explicit banner**. |

Selection order: explicit `DEMO_DATA_MODE` → core-api (if configured) → neon (if configured) → mock.

**These are read models, not a second educational database** (brief §21). The Drizzle schema is
a convenient projection for experiments; canonical educational truth remains in syllabai-core +
the operator corpora.

## 3. AI provider abstraction

`src/lib/ai/providers.ts` — one interface, five adapters + offline fallback. All server-only
(`import "server-only"`); the browser only ever calls `POST /api/ai/chat` on this origin. Keys
are read from env inside the adapters and never returned to the client — the client sees only a
provider id/name for the badge.

Uniform SSE event protocol on `/api/ai/chat`:

```text
event: citations  → evidence retrieved before generation (deep-linkable)
event: meta       → { provider, model, refused, evidenceCount }
event: delta      → streamed answer chunks
event: done/error
```

## 4. Grounded tutor (demo-simplified §26 pipeline)

`src/lib/tutor.ts` + `src/lib/ai/retrieval.ts`:

```text
learner query
  → tokenize (stopword-lite)
  → lexical BM25-lite over bundled segments (notes chunks, question parts, concepts)
  → SyllabAI-aware reranking (spec-code anchors, title hits)
  → evidence sufficiency gate (score threshold)
  → grounded generation with numbered [n] citations
  → honest refusal when evidence is insufficient (never fabricated)
```

The production KA-RAG path (hybrid retrieval, fusion, SyllabAI-aware reranking, claim/citation
validation) remains authoritative in `syllabai-core`; this exists so tutor UX experiments run
offline.

## 5. Knowledge graph

Two cooperating layers, never conflated (ported honesty rules from `syllabai-web`
`ConceptGraphView`):

1. **Official curriculum anchor** — `SpecGraphCanvas` renders the RULE_DERIVED spec skeleton
   (`graph/topics.yaml` + `graph/specification_points.yaml` + `relationships.yaml` prerequisite
   edges) with the layered left-to-right layout algorithm ported from the production
   `KnowledgeGraphView` (leaf slotting → parent centering → de-collision sweep; bezier hierarchy
   edges; dashed prerequisite curves). Focus-scroll keeps the root/selection in view.
2. **Graph-derived layer** — `ConceptWeb` renders the T-C11 concept/misconception neighbourhood
   of a focus node on a deterministic radial layout (no physics — fast and stable on mobile).
   Every node/edge displays its provenance tier (`AI_SUGGESTED` etc.). Empty states are explicit.

The learner mastery colours on the anchor view come from the **SIMULATED** overlay and are
toggleable.

## 6. Content pipeline

`scripts/import_content.py` (Python, stdlib + PyYAML) downloads a bounded, curated subset from
`SyllabAI/syllabai-resources` and emits versioned JSON bundles committed under `content/`:

- curriculum skeleton from the graph-as-code files (215 nodes / 396 edges)
- T-C11 concepts + misconceptions + semantic edges (113 / 275), evidence quotes pruned to the first per edge
- 9 revision notes with frontmatter preserved, image refs rewritten to `public/content-assets/` (bounded, hashed)
- 3 exam-question topics (58 questions) with parts, command words, spec-point codes, solutions
- `DEMO_DERIVED` flashcards generated from spec-point callouts + definition headings
- deterministic `SIMULATED` learner overlay (seeded RNG)

Re-run the script to refresh the bundle; the app never fetches GitHub at runtime.

## 7. Frontend structure

```text
src/
├── app/
│   ├── page.tsx                     # hub
│   ├── knowledge-graph/             # anchor + concept web (client island)
│   ├── revision-notes/              # index + [noteId] reader (server-rendered markdown)
│   ├── exam-questions/              # question browser + mark-scheme reveal (client)
│   ├── flashcards/ practice/        # client-only experiment surfaces
│   ├── tutor/                       # streaming chat client
│   ├── learner/                     # simulated overlay dashboard
│   ├── experiments/                 # isolated prototypes
│   └── api/{ai/chat,health}/        # the only AI entry point + self-report
├── components/
│   ├── layout/app-shell.tsx         # sidebar + provider badges
│   ├── graph/{layout,spec-graph-canvas,concept-web}   # ported viz engine
│   ├── markdown.tsx provenance.tsx  # corpus rendering + honesty badges
├── lib/
│   ├── contracts.ts                 # Zod semantic contracts (canonical-aligned)
│   ├── config.ts                    # public (non-secret) runtime config
│   ├── tutor.ts                     # grounded tutor orchestration
│   ├── data/{types,mock,neon,core-api,index}.ts       # provider seam
│   └── ai/{providers,retrieval}.ts  # provider abstraction + retrieval-lite
content/igcse-chemistry/*.json      # committed real-corpus bundles
scripts/import_content.py           # reproducible importer
docs/                               # this file, repository map, experiment guide
```

## 8. Performance posture (brief §24)

- server components by default; client JS only for interactive islands (graph canvas, chat, decks)
- graph rendering is dependency-free SVG (no d3/react-flow bundle cost)
- corpus JSON is loaded once per server process and Zod-validated; retrieval indexes are cached
- streaming responses (SSE) with citations arriving before generation
- lazy graph interactions; no giant initial bundle; mobile-usable layouts throughout

## 9. Security posture (brief §20)

- provider keys are server-only env reads; never in client bundles or responses
- the chat route is the single AI entry point; request bodies are Zod-validated and bounded
- no arbitrary SQL / HTTP from AI output; no AI write path exists at all
- the simulated learner overlay is client/session state and clearly labelled
- corpus licensing respected: pilot-licensed corpus, SME attestation referenced in the manifest
