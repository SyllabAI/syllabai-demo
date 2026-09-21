# syllabai-demo

**Status: IMPLEMENTED (initial shell + SaveMyExams-style Learning Hubs) — a fast, disposable experimental application around SyllabAI.**

This is **not** a second production frontend. It is the playground where learning-surface ideas
get prototyped in hours against **real** SyllabAI content, tested with real learners/agents, and
promoted into the production architecture (`syllabai-web` / `syllabai-core`) only if the evidence
supports it. Failed experiments should be deletable in minutes.

## What is inside

| Surface | Route | What it demonstrates |
|---|---|---|
| Courses directory | `/courses` | All **39 Edexcel IAL/IGCSE courses** in the registry; each gets its own Learning Hub |
| Learning Hub (per course) | `/courses/igcse-chemistry` | SaveMyExams-style per-subject hub: persistent sidebar, numbered spec topic tree with progress rings, resource cards, Strengths & Weaknesses tab |
| Revision Notes (hub) | `/courses/igcse-chemistry/revision-notes` | Numbered topic accordion index → note reader (provenance block, guided-study "Ask about this", helpfulness vote, build-on-this-topic cross-links) |
| Exam Questions (hub) | `/courses/igcse-chemistry/exam-questions` | Bank index → set page with difficulty tabs + question grid → player with Save, full screen, self-score "How did you do?", full-screen mark-scheme modal (`[N mark]` AND-joined points), MCQ instant marking where option text exists |
| Flashcards (hub) | `/courses/igcse-chemistry/flashcards` | Per-sub-topic decks with the flip / Still learning / Know loop |
| Knowledge Graph | `/knowledge-graph` | Official curriculum anchor (layered SVG, ported from `syllabai-web`) + T-C11 concept web with provenance |
| Graph Explorer (OpenHuman) | `/graph-explorer` | The operator's OpenHuman interaction-grammar visualizer hosted **byte-faithful** (v75 default: edge explainer, lasso selection, minimap; v76/v77 switcher) + decoupled `canonicalKG` data artifact — Phase 1 of `docs/KNOWLEDGE_GRAPH_VISUALIZER_INTEGRATION.md` |
| Practice | `/practice` | Part-level player with confidence/self-doubt telemetry (production attempt shape) |
| Tutor | `/tutor?q=…&spec=4CH1-1.1` | Grounded AI tutor: retrieval → sufficiency gate → cited answer / honest refusal; **anchored** entry points from notes ("Ask about this") and questions ("Question help") |
| Learner Overlay | `/learner` | **SIMULATED** BKT-style state over curriculum truth |
| Experiments | `/experiments` | Isolated, deletable prototypes (`kg-navigation`, `semantic-search`) |

Legacy top-level routes (`/revision-notes`, `/exam-questions`, `/flashcards`) redirect into the
pilot course's hub with query strings (`?spec=4CH1-1.1`) preserved.

### The Learning Hub model (ported from SaveMyExams UX research)

`research/sme/` holds the 25-screenshot live walkthrough of savemyexams.com behind the design
(full report: `download/SaveMyExams_UX_Feature_Research.docx`). Key ported decisions:

- **One canonical tree.** SME's numbered topic tree is, in SyllabAI terms, the official
  specification tree (`src/lib/spec-tree.ts` builds it from the imported curriculum — no second
  taxonomy). It drives the sidebar, the URLs, the index pages and the progress rings.
- **Progress is a browser-local overlay** (`src/lib/progress.ts`, labelled `SIMULATED`): notes
  read, question self-scores / MCQ marks, and flashcard ratings live in `localStorage` per
  course. SME gates progress writes behind accounts; the demo is honest about having none.
  Nothing ever writes to canonical content.
- **39-course registry, one pilot.** `content/courses.json` registers all 39 subjects (mirroring
  what is downloaded in `syllabai-resources`); only the 4CH1 pilot has a committed bundle, and
  every other hub renders an honest "import pending" state instead of fake content. Drop a
  validated bundle under `content/<slug>/` and the hub activates with no code changes.

The bundled corpus (committed under `content/`) is a curated subset of
[`SyllabAI/syllabai-resources`](https://github.com/SyllabAI/syllabai-resources) imported by
`scripts/import_content.py`: **215 curriculum nodes · 396 skeleton edges · 113 T-C11 graph nodes ·
275 concept edges · 9 revision notes · 58 exam questions · 39 flashcards**, with provenance tiers
(`RULE_DERIVED`, `AI_SUGGESTED`, `DEMO_DERIVED`, `SIMULATED`) preserved end-to-end.

## Why this repository exists

The production system is sophisticated and multi-agent, which creates friction for rapid
experimentation (Render cold starts, production iteration costs, coordination overhead).
`syllabai-demo` deliberately optimizes for **speed of experimentation, visual quality,
integration flexibility, and low friction** — see `docs/ARCHITECTURE.md`.

## Run it

```bash
pnpm install        # or bun install / npm install
pnpm dev            # http://localhost:3000  (or: bun run dev)
```

Zero configuration is required to start: the app boots in `mock` data mode (the bundled real
corpus) with the sandbox-default AI provider. Configure integrations via env vars when you want
them — see `.env.example`.

### Environment variables (all optional)

| Variable | Effect |
|---|---|
| `DEMO_DATA_MODE` | Force a data source: `mock` \| `neon` \| `core-api` |
| `NEON_DATABASE_URL` / `DATABASE_URL` | Postgres URL → activates the `neon` provider (Drizzle read models) |
| `SYLLABAI_CORE_BASE_URL` | e.g. `https://syllabai-core.onrender.com` → activates the `core-api` provider |
| `SYLLABAI_CORE_TOKEN` | Optional pilot JWT for authenticated core reads |
| `DEMO_AI_PROVIDER` | Force a provider: `groq` \| `openrouter` \| `gemini` \| `freellm` \| `zai` \| `mock` |
| `GROQ_API_KEY` / `OPENROUTER_API_KEY` / `GEMINI_API_KEY` / `FREELLM_API_KEY` | Provider keys (server-only, never bundled) |
| `GROQ_API_KEY_MODEL` etc. | Optional per-provider model override |

Provider resolution is automatic: the first configured provider wins, with a deterministic
offline `mock` fallback so the demo never breaks.

## The experiment ladder

Every surface reads through the `DemoDataProvider` seam (`src/lib/data/`), so the same UI runs
against progressively richer backends without rewrites:

```text
Mock data → Local/static data → Neon-backed data → syllabai-core API → AI-enhanced
```

```tsx
// anywhere in a page or experiment
const provider = getDataProvider();     // server-side
const notes = await provider.revisionNotes();
```

## Adding an experiment

Create `src/app/experiments/<your-idea>/page.tsx`, use the provider seam + contracts, keep
writes confined to the SIMULATED overlay, and delete it when the question is answered.
Full guide: `docs/EXPERIMENTS.md`.

## Deployment (Vercel)

```bash
git push        # → Vercel → live demo
```

No special infrastructure: Next.js App Router + Neon HTTP driver + server-side AI calls all run
on the standard Vercel Node runtime. Set env vars in the Vercel dashboard; never commit keys.

## Non-negotiable boundaries

- syllabai-core + the operator corpora remain the **only** canonical educational truth
- `SpecificationPoint` codes (e.g. `4CH1-1.25`) are first-class anchors — never reinvented
- retrieval-derived graphs (T-C11) are shown with their real provenance, never silently promoted
- learner state is an overlay; the demo's overlay is explicitly `SIMULATED`
- chat/AI output never mutates canonical KG or mastery
- provider infrastructure never leaks into the semantic contract

## Docs

- `docs/ARCHITECTURE.md` — how the demo connects to syllabai-core / Neon / providers / the graph
- `docs/REPOSITORY_MAP.md` — where the relevant implementations live across the SyllabAI org
- `docs/EXPERIMENTS.md` — the experiment protocol
