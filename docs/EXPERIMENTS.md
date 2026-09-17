# The Experiment Protocol

**Status: ACCEPTED**

An experiment is a **question**, not a feature. It lives in one folder, uses the same provider
seam as everything else, and is deletable without regret.

## Lifecycle

```text
PROPOSED  →  question + hypothesis recorded in the page footer
SEED      →  smallest UI that can produce evidence
RUNNING   →  humans/agents interact; findings appended with status discipline
DECIDED   →  PROMOTE (into permanent surfaces / production proposals) or DELETE
```

## Rules

1. **One folder**: `src/app/experiments/<slug>/page.tsx` (+ `client.tsx` if interactive). No
   experiment imports another experiment.
2. **Use the seams**: `getDataProvider()` for data, `/api/ai/chat` for AI, `@/lib/contracts`
   for shapes. If you need a new contract, extend `contracts.ts` — never redefine canonical
   semantics inside an experiment.
3. **Writes are confined to the SIMULATED overlay** (client/session state). Experiments never
   mutate canonical educational truth.
4. **Honesty**: keep provenance badges; label simulated data; record empty states as empty.
5. **Status discipline**: use PROPOSED / ACCEPTED / IMPLEMENTED / VERIFIED / INFERRED / REPORTED /
   UNVERIFIED / REJECTED in experiment notes. Code existing ≠ implemented ≠ verified.
6. **Leave a note**: when deleting an experiment that revealed something durable, record the
   finding in this file's decision log below before removing the folder.

## How to create one (checklist)

```bash
mkdir src/app/experiments/my-idea
```

- [ ] `page.tsx` — server component; fetch via `getDataProvider()`; pass props to client island
- [ ] `client.tsx` (optional) — interactive UI; reuse `components/provenance.tsx` badges
- [ ] Header: experiment name + question + current status badge
- [ ] Footer: findings log (dated, status-disciplined)
- [ ] Register in `src/app/experiments/page.tsx` EXPERIMENTS list
- [ ] Delete-ability check: nothing outside the folder references it (except the index entry)

## Seeded experiments

### kg-navigation — SEED

Question: *can the knowledge graph be the product's front door — one flow from spec point →
note → question — instead of a dashboard?*
Implementation: spec-point picker with cross-links into revision notes and filtered exam
questions. Finding so far: none recorded.

### semantic-search — SEED

Question: *what does whole-corpus search feel like before any semantic backend exists?*
Implementation: client-side BM25-lite over notes + question parts + concepts with kind filters
(reuses `@/lib/ai/retrieval`). Finding so far: none recorded.

## Decision log

| Date | Experiment | Finding | Status |
|---|---|---|---|
| 2026-09-17 | kg-navigation | seeded | SEED / UNVERIFIED |
| 2026-09-17 | semantic-search | seeded | SEED / UNVERIFIED |
