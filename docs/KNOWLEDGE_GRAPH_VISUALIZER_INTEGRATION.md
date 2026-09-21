# Knowledge-Graph Visualizer → syllabai-demo Integration Plan

**Date:** 2026-09-21 · **Visualizer:** OpenHuman builds v75 (default) / v76 / v77 — operator
prototype from
[`nawaf-al-hussain/FileUpload/syllabai-openhuman-edexcel-chemistry-kg`](https://github.com/nawaf-al-hussain/FileUpload/tree/main/syllabai-openhuman-edexcel-chemistry-kg)
· **Host:** this repo (`/graph-explorer`, Phase 1 shipped) · **Scope:** Edexcel International
GCSE Chemistry (4CH1)

---

## 1. Starting point

- **The visualizer** is a single self-contained HTML file (no dependencies, no network calls)
  evolved through an OpenHuman-inspired interaction grammar: exploration mode (v73: node explore
  menu, neighborhood expansion, connected-only subgraph, A-to-B path tracing, semantic zoom,
  exploration trail, type filters), an analysis layer (v74: multi-select, two-node compare panel,
  pins, saved views, camera fly-to), and relationship explanation + lasso + minimap (v75). v76
  (audit fixes) and v77 (regression fixes) exist beyond the linked v75.
- **The graph data** (`canonicalKG`) is embedded in the build: 1 Subject, 4 Sections, 28
  SubTopics, 182 SpecificationPoints, 2 ExamPapers — 257 edges of types `hier` / `pre` / `rel` /
  `assess`. It is the prototype's own hand-curated 4CH1 dataset.
- **The renderer contract already exists in the build:** `GRAPH_CONTRACT` v1.0 defines node
  types, edge types and the learner-overlay schema, and the source comments declare it "the
  boundary that the eventual Java/API projection should satisfy". `graphViewModel()` projects
  canonical data into renderer state; runtime physics fields never cross back. This contract is
  the single coupling point for everything below.
- **This repo already has graph surfaces with a different shape:** `/knowledge-graph` renders
  the official curriculum anchor (RULE_DERIVED spec skeleton) + the T-C11 concept web (113
  nodes / 275 edges, AI_SUGGESTED provenance) from the content bundles
  (`content/<slug>/concept-graph.json`), and `/learner` carries a SIMULATED BKT overlay over
  curriculum truth. The visualizer is a **third, richer navigation grammar** — not a replacement
  — and the plan keeps the layers distinct.

## 2. Architecture target

```
syllabai-resources (curricula + graph YAMLs + parsed official specs, 23 quals)
        │
        │  Phase 2: kg export (contract-validated, CI-gated)
        ▼
  canonicalKG JSON per qualification   (schema = GRAPH_CONTRACT, versioned)
        │                                    │
        │ static /kg/data/*.json (today)     │ data-provider lane (tomorrow)
        ▼                                    ▼
  syllabai-demo /graph-explorer       syllabai-demo surfaces (notes, questions,
  byte-faithful iframe host           flashcards, tutor, learner overlay)
        └─── same view-model contract; renderer never patched until Phase 3 ───┘
```

| Layer | Today (Phase 1) | Later |
|---|---|---|
| Data | prototype's embedded dataset; decoupled artifact at `/kg/data/canonicalKG.edexcel-chemistry-4ch1.json` (217 nodes / 257 edges, headlessly extracted and contract-validated) | per-qual export from `syllabai-resources`, reconciled with the T-C11 `concept-graph.json` bundles |
| Serving | Vercel static | provider lane (`getDataProvider()`) + optional `/api/kg/[qual]` |
| Renderer | byte-faithful builds in an iframe (v75/v76/v77 switcher) | componentized explorer fed via props; iframe removed |
| Learner state | build-internal synthetic overlay | `SimLearnerState` from the existing `/learner` BKT sim through `learnerOverlay` |
| Host chrome | `/graph-explorer` toolbar (build switcher, stats from artifact, about, fullscreen) | deep links into hub resources from node panels |

**Guiding principle:** builds stay byte-faithful until Phase 3. Hosting, data and product
questions are answered first; the renderer is touched exactly once — when it becomes a package.

## 3. Phases

### Phase 1 — hosted demo (SHIPPED in this repo)

- `/graph-explorer` route: full-bleed host with a slim toolbar — build switcher
  (v75 default · v76 · v77), stats chip fetched live from the decoupled artifact (proves the
  data path on every load), About popover with the interaction grammar, new-tab + fullscreen.
- Builds served byte-faithful from `public/kg/` (sha256-pinned in the artifact provenance).
- Wired in: AppShell "Demo prototypes" menu entry, cross-link button on `/knowledge-graph`,
  README surfaces table.
- **Exit criteria (met):** every v75 feature works from the deployed URL; switching builds is
  lossless; no build file is modified.
- *Retired in the per-course phase:* the original `/knowledge-graph` spec-canvas + T-C11
  concept-web surface was replaced by the OpenHuman explorer (see Phase 1.5); the old
  components (`spec-graph-canvas`, `concept-web`, `graph/layout`) are removed.

### Phase 1.5 — per-course knowledge graphs (SHIPPED 2026-09-21)

**Every course gets its own knowledge graph, and the OpenHuman visualizer becomes THE
knowledge-graph surface** — `/knowledge-graph` now renders it, replacing the old two-layer
canvas.

- **Exporter** (`scripts/kg_export.py`): `content/<slug>/curriculum.json` →
  `public/kg/data/<slug>.json` for all **49 registered courses** (+ `index.json` for the
  switcher). Families map 1:1 onto the contract — SUBJECT→Subject, TOPIC→Section,
  SUBTOPIC→SubTopic, SPEC_POINT→SpecificationPoint — in the build's own id conventions
  (`subject`, `sec1`, `1a`, `p:1.1`). Gates: contract types, unique ids, referential
  integrity, exactly one subtopic parent per point, strict numeric ordering. **Cross-check:
  the 4CH1 export reproduces the prototype's hand-curated hierarchy exactly (215 nodes /
  214 hier edges = 217−2 papers / 257−30 pre−5 rel−8 assess).**
- **Loader fork** (`public/kg/openhuman-course-explorer.html`, built by
  `scripts/build_kg_loader_fork.py` from the pinned v77): eight `const→var` patches on the
  module data tables + one `window.__KG_APPLY` hook in `makeBase()` + an appended loader
  block. `?course=<slug>` → fetch JSON → re-validate the contract in-build → swap tables →
  rebuild through the renderer's own `makeBase() → fitInitial() → bootSimulation()`
  pipeline. No param → inline 4CH1, byte-compatible. v75/v76/v77 remain byte-faithful.
- **Host** (`/knowledge-graph`): course switcher (49 courses grouped by subject),
  deep-linkable `?course=`, live counts chip from the loader's `postMessage` handshake,
  loading/error states, fullscreen/new-tab, cross-link to the `/graph-explorer` prototype
  lab.
- **Honest v1 data:** `hier` edges only — curriculum bundles carry no prerequisite, relation
  or paper metadata and none are invented. `pre`/`rel`/`assess` join when the data does
  (Phase 2 exporter reconciliation + practice-paper metadata).

### Phase 2 — data decoupling (syllabai-resources + this repo)

- `scripts/kg_export.py` in `syllabai-resources`: `graph/*.yaml` + parsed official specs → one
  canonicalKG JSON per qualification, with `meta.provenance` (source files, commit, issue refs).
- **Golden-sample regression:** the shipped artifact is the golden sample for 4CH1; the
  exporter's first run is diffed against it (node ids, edge triples, statements). Expect the
  exporter to be *authoritative* — the prototype's `pre`/`rel` edges (30/5) are hand-authored
  and must be re-derived from `concept_edges.yaml` + ratified c11/c12 mappings, with diffs
  reviewed rather than silently overwritten.
- Reconciliation with the app's T-C11 layer: `canonicalKG` (spec-tree navigation grammar) and
  `concept-graph.json` (concepts/misconceptions with provenance) are complementary; define the
  join (spec point ↔ concept) so Phase 3 can show both in one canvas.
- CI gate: node/edge type validation, referential integrity, spec-point coverage vs the
  official parse (182/182 for 4CH1) — extension of `graph_check.py`.
- Demo consumes the export via a forked loader build (fetch-JSON instead of inline literals);
  byte-faithful builds remain untouched.
- **Exit criteria:** `kg_export.py --qual 4CH1` passes the contract gate and the golden-sample
  diff is reviewed.

### Phase 3 — componentization (this repo)

- Extract the renderer into an internal component/package: data via props/fetch + postMessage
  bridge for host↔graph actions; the iframe disappears.
- Node panels deep-link into the hub: spec point → revision notes / exam questions /
  flashcards (the existing graph→resource→question navigation pattern).
- Qualification parameter: `/graph-explorer?course=<slug>` activated per content bundle as
  Phase 2 exports land (the 39-course registry pattern applies — honest "import pending" until
  then).
- **Exit criteria:** same interaction grammar, rendered in-app from provider data, for 4CH1.

### Phase 4 — product integration

- **Student:** learn / practice / path / tutor node actions wired to real demo surfaces; A-to-B
  path tracing becomes a guided study-plan view; "Ask about this" anchoring from node panels
  into the grounded AI tutor.
- **Learner overlay:** `SimLearnerState` (BKT sim) mapped onto the `learnerOverlay` contract —
  mastery/confidence/fluency/evidence/reviewDue/misconception — replacing the build's synthetic
  overlay. Simulated data stays labelled SIMULATED per demo discipline.
- **Teacher/coverage:** the build's coverage/class panels read from demo telemetry.
- **Provenance:** node/edge drawers cite resources artifacts (spec PDF pages, SME notes,
  ratified mappings) — the graph becomes an auditable navigation layer.
- **Exit criteria:** a learner can traverse the graph into any resource and back with learner
  state consistent across `/learner` and the explorer.

### Phase 5 — hardening & scale

- Accessibility pass on the host + packaged renderer (keyboard grammar exists from v56/57),
  touch ergonomics, mobile layout.
- Performance budget: today's 217-node graph is far inside budget; spatial index / PixiJS path
  when concept-level multi-qual graphs exceed ~10k nodes.
- Contract versioning policy (GRAPH_CONTRACT 2.0 review: concept nodes, point-level assessment
  edges), visual-regression tests on the explorer.

## 4. The frozen contract (GRAPH_CONTRACT v1.0)

| Node type | Meaning | Count (4CH1 artifact) |
|---|---|---|
| `Subject` | qualification root | 1 |
| `Section` | spec section (1–4) | 4 |
| `SubTopic` | numbered subtopic (e.g. 1c Atomic structure) | 28 |
| `SpecificationPoint` | official point (id like `1.5C`; C = Paper-2-only) | 182 |
| `ExamPaper` | Paper 1C (110 marks · 61.1%), Paper 2C (70 marks · 38.9%) | 2 |

| Edge type | Reading | Count (4CH1 artifact) |
|---|---|---|
| `hier` | containment, parent → child | 214 |
| `pre` | prerequisite, arrow points at the dependent — "secure the source before the target" | 30 (hand-authored — Phase 2 re-derivation) |
| `rel` | related/compare | 5 (hand-authored — Phase 2 re-derivation) |
| `assess` | assessed-by, subtopic → paper | 8 |

`learnerOverlay`: `mastery: number|null`, `confidence: number|null`, `fluency: number|null`,
`evidence: number`, `reviewDue: boolean`, `misconception: string|null`.

Invariants: renderer consumes the projected view model only; runtime fields
(`x/y/vx/vy/homeX/homeY/rx`) never enter canonical data; every view-model build re-validates
types and edge endpoints.

## 5. Files in this repo

| Path | What |
|---|---|
| `src/app/knowledge-graph/page.tsx` + `client.tsx` | per-course host: course switcher (49 courses), `?course=` deep link, live counts via loader handshake, fullscreen/new-tab |
| `src/app/graph-explorer/page.tsx` + `client.tsx` | prototype build lab: toolbar (build switcher, live stats, About, fullscreen/new-tab) + byte-faithful iframe canvas |
| `src/components/layout/app-shell.tsx` | nav entries (Knowledge Graph + Demo prototypes) + full-bleed layout branch for both graph surfaces |
| `public/kg/openhuman-course-explorer.html` | data-decoupled loader fork of v77 (`?course=<slug>` → swap tables → rebuild); built by `scripts/build_kg_loader_fork.py` |
| `public/kg/v75-explainer-lasso-minimap.html` | default build (sha256 `65cc973e…`) |
| `public/kg/v76-audit-fixes.html` | audit-fix build (sha256 `2636ddc0…`) |
| `public/kg/v77-regression-fixes.html` | latest build (sha256 `d485753b…`) |
| `public/kg/data/<slug>.json` | per-course canonicalKG exports (49 courses, `scripts/kg_export.py` from curriculum bundles) |
| `public/kg/data/canonicalKG.edexcel-chemistry-4ch1.json` | decoupled golden-sample artifact: provenance + contract + 217 nodes / 257 edges |
| `scripts/kg_export.py` | per-course exporter + validation gates |
| `scripts/build_kg_loader_fork.py` | fork builder (patches + loader block, refuses to build on any patch mismatch) |
| `docs/KNOWLEDGE_GRAPH_VISUALIZER_INTEGRATION.md` | this plan |

## 6. Open decisions (owner: Nawaf)

1. **Default build cadence** — v75 is the linked reference and ships as default; v77 is the
   latest regression-fixed build. Auto-adopt future builds or promote manually via the switcher?
2. **Authoritative `pre`/`rel` source** — re-derive from `syllabai-resources` in Phase 2 and
   accept the diffs, or keep the prototype's hand-authored edges as canon for the demo?
3. **Point-level assessment edges** — join `assessment_objectives.yaml` for per-point exam
   metadata in the panel grammar?
4. **Saved views** — device-local `localStorage` (current) vs account-scoped persistence when
   accounts exist.
5. **Layer merge** — when (and how) should the T-C11 concept web and the OpenHuman navigation
   grammar share one canvas in Phase 3?
