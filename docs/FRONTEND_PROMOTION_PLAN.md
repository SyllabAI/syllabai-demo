# Frontend Promotion Plan — syllabai-demo → second production frontend

**Status:** PROPOSED (operator decision required)
**Date:** 2026-09-18
**Author:** syllabai-demo agent, per operator request
**Source of truth read:** `SyllabAI/syllabai` master pack — `MASTER_SPEC.md` v1.3 (§2, §4, §6, §7, §20–§22, §26, §29, §32–§35, §38, §39a), `MASTER_SPEC_ADDENDUM_1.4` (LIM), `DECISIONS.md` ADR-002/003/008/009/012/013/014/019/021/023, `PROJECT_CONTEXT.md` (repository set, execution scope)

---

## 1. What this app is today (verified state)

The Learning Hub app (repo `SyllabAI/syllabai-demo`, deployed at `syllabai-demo.vercel.app`) is a SaveMyExams-style per-subject workspace implementing ADR-014's subject-first product shape ahead of the main frontend: 39 course hubs on spec-point-anchored trees, revision-note reader, question player with self-marking + mark schemes, flashcard decks, strengths & weaknesses, an anchored grounded tutor (SSE, citations, honest refusal), knowledge/concept graph surfaces, KaTeX rendering, and provenance shown on every resource.

It currently runs **hermetically**: content from committed 75 MB corpus bundles read via `node:fs` at request time, learner state simulated in `localStorage` (clearly labelled `SIMULATED`), and server-side LLM calls via its own provider abstraction with frontend-held keys. That is exactly right for a demo and exactly wrong for a production frontend. The promotion is therefore less about features and more about **wiring, governance, and hardening**.

## 2. What the Master Spec requires of a production frontend

| # | Requirement | Spec ref |
|---|---|---|
| R1 | Next.js 16.x + React 19 + TypeScript, hosted on Vercel | §2.2, ADR-002 |
| R2 | Browser→backend over HTTPS to the Spring Boot API (`/api/v1`); DTOs at boundaries; typed API client generated from the canonical schema where practical | §2.2, §22, §29 |
| R3 | All AI calls flow through core's `LlmProvider`/`FailoverLlmChain` — frontends hold **no** LLM keys | §4, §26, ADR-009/023 |
| R4 | Identity: registration/login/session/RBAC; server-side authorization; consent + deletion/export workflows | §6.1, §20 |
| R5 | Learner state is core-owned (BKT/BDT/decay); attempts are Learning Evidence (append-only, §12 contract); overlays never mutate curriculum truth | §6.6, §11, §12, ADR-014/016 |
| R6 | Conversational surfaces read-only vs KG/mastery; emit interaction evidence only (signal classes, no transcripts in memory) | Addendum 1.4 |
| R7 | Security: TLS, output encoding, CSRF/XSS protection, rate limiting, audit logging, secrets via env only, no credentials in repos | §20 |
| R8 | Accessibility: WCAG 2.1 AA, keyboard, SR semantics, readable equations, reduced motion | §21 |
| R9 | Observability: structured logs, trace IDs, metrics, exception tracking, health checks | §32 |
| R10 | Testing: unit + contract + E2E critical journeys (register/login, attempt, tutor query, export/deletion) | §33 |
| R11 | CI/CD: GitHub Actions — lint → test → build → security checks → deploy | §34 |
| R12 | Definition of Done incl. tests, security, telemetry, docs, tracker row, verified UX, research semantics preserved | §38 |
| R13 | Feature management: flags for staged rollout | §35 |
| R14 | Repository governance: the 8-repo set is authoritative; repo-map changes need ADR-level decisions | §3, ADR-003/012, PROJECT_CONTEXT |

## 3. Gap analysis (demo vs requirements)

| Area | Spec | Demo today | Verdict |
|---|---|---|---|
| Stack (R1) | Next 16 + React 19 + TS | next 16.1.1 / react 19 / TS 5 | ✅ compliant |
| Spec-point semantics (R5) | first-class anchors, provenance, no invented numbering | canonical tree, provenance tiers, honest empty states | ✅ strongest asset |
| Tutor discipline (R6) | read-only vs truth, evidence events | anchored tutor, citations, refusal, no write path | ✅ Addendum 1.4-shaped |
| Data source (R2) | core `/api/v1` | 75 MB fs bundles + mock provider | ❌ ladder exists (`SYLLABAI_CORE_BASE_URL` → `core-api` provider) but not flipped |
| AI routing (R3) | core `LlmProvider` only | own server-side providers + keys in Vercel env | ❌ must become a proxy to core tutor endpoints; keys removed |
| Auth/identity (R4) | registration/login/RBAC/consent | none | ❌ hard blocker for "production" |
| Learner state (R5) | core BKT + attempt ledger | localStorage `SIMULATED` overlay | ❌ replace with core reads/writes; keep overlay only as labelled fallback |
| Attempt evidence (R5/§12) | append-only evidence contract | self-scores/MCQ marks in localStorage | ❌ must POST attempts; research fields (latency, self-doubt, timing) per §39a |
| Content licensing (ADR-013) | permissive-only embeds; SME corpus is operator-collected | SME notes/questions/flashcards rendered; images hotlinked from `raw.githubusercontent` | ⚠️ operator licensing decision required before public production |
| Scope (ADR-019) | Cycle-1 = 4CH1 only; bulk ingestion needs explicit decision | 39 courses imported from `syllabai-resources` | ⚠️ needs operator scope decision (keep 39 read-only? gate 38?) |
| HTML pipeline (R7) | output encoding | `rehype-raw` renders corpus HTML **unsanitized** | ❌ add `rehype-sanitize` allow-list (XSS surface) |
| Tests (R10) | unit/contract/E2E | none (only shell scripts) | ❌ |
| CI (R11) | GitHub Actions pipeline | none | ❌ |
| Observability (R9) | logs, traces, exception tracking | `/api/health` only | ❌ (Sentry-class + web vitals) |
| Accessibility (R8) | WCAG 2.1 AA | radix primitives, aria labels; no audit | ⚠️ audit pass needed |
| Performance/cost (§40) | tolerate cold starts, no local state | blanket `force-dynamic` + 75 MB traced bundle | ⚠️ ISR/cache + ADR-021 content packages (R2/CDN) instead of repo bundles |
| Branding | production identity | "experimental playground" framing, roadmap badges | ⚠️ rename + copy pass |
| Governance (R14) | 8-repo authoritative map | `syllabai-demo` absent from master pack | ❌ needs ADR + repo-map/tracker updates (ADR-008 rows) |

## 4. Governance decisions the operator must make first (Phase 0)

1. **Repo identity.** Promote in place (rename `syllabai-demo` → e.g. `syllabai-hub` / `syllabai-workspaces`) and register it in the master pack (README repo map + PROJECT_CONTEXT table + new ADR "second frontend repo"), or fold the Learning Hub code into `syllabai-web`. The spec's §29 structure (`features/`, `services/`, `types/`, `accessibility/`) is the target shape either way. Division of labor proposal: `syllabai-web` = auth shell + cross-subject dashboard + tutor/CLA; this app = ADR-014 subject workspaces (the F-164/F-165 surface).
2. **Content scope.** 39 hubs vs ADR-019's 4CH1-only Cycle-1 guard. Options: (a) production-launch 4CH1 + keep the other 38 behind a ` corpus-preview` flag; (b) amend scope explicitly. Either way the choice must be recorded (ADR + tracker rows).
3. **Licensing.** SME-derived corpus + hotlinked images under ADR-013: confirm institution/own-use posture covers serving this to real students, or move assets to owned storage and restrict corpus origin.
4. **Neon direct mode.** Recommend deprecating `neon` provider for production (frontend must not bypass the core domain layer); keep `core-api` + static content packages (ADR-021) as the only two modes.

## 5. Phased plan

### Phase 0 — Governance (no code)
ADR for the promotion; repo map + PROJECT_CONTEXT + tracker rows; licensing call; naming; scope decision (§4 above). Exit: ADR merged, tracker rows updated.

### Phase 1 — Hardening without backend dependency
1. `rehype-sanitize` allow-list (protocol-safe tags: sub/sup/katex-safe HTML) — closes the XSS gap.
2. CI: GitHub Actions (lint → `tsc` → `next build` → route smoke) — the type gate we enabled must run remotely.
3. Test suite: unit (spec-tree, progress math, contracts), contract tests against `syllabai-web` `types.ts` DTO fixtures, Playwright E2E for hub → note → attempt → deck → tutor-refusal journeys.
4. Accessibility audit + fixes (keyboard tree nav, SR labels on rings, reduced motion, equation readability).
5. Performance: replace blanket `force-dynamic` with per-route caching/ISR; move bundles out of the serverless trace into R2-backed content packages (ADR-021) or prebuilt JSON artifacts; image proxy/CDN off `raw.githubusercontent`.
6. Error tracking + web vitals; security headers; rate limiting on any remaining API routes.
7. Production naming/copy pass; hide roadmap items behind flags (§35).

Exit: green CI on main, E2E suite, a11y pass, sanitized pipeline, no fs bundle reads in the serverless path.

### Phase 2 — Core integration (the actual promotion)
1. Flip `DEMO_DATA_PROVIDER=core-api` + `SYLLABAI_CORE_BASE_URL`; wire every hub surface to `/api/v1` resources; DTO conformance checked by contract tests; remove fs bundle path from prod runtime.
2. Auth: login/register via core `AuthController`; session handling; server-side authorization on every protected surface (§20); consent + account deletion/export entry points.
3. Attempts & learner state: self-marks/MCQ/flashcard ratings → `AttemptController` evidence writes; mastery/rings/Strengths & Weaknesses read `LearnerStateController` (BKT); retire `SIMULATED` overlay (keep as dev-only labelled fallback).
4. Tutor: proxy to `/api/v1/tutor/query` + `/stream`; delete frontend provider abstraction + LLM keys from Vercel; keep anchoring/citation UI; emit interaction-evidence events per Addendum 1.4 (signal classes, deterministic anchors).
5. Telemetry: learning-log fields (response latency, self-doubt flag, keystroke/dwell timing) per §39a exit criteria; timed-vs-untimed construct (F-162) plumbed through the question player.

Exit: hub runs end-to-end against `syllabai-core` on Render with zero frontend-held AI keys; attempts visible in core; tutor answers carry core-issued citations.

### Phase 3 — Production ops
Feature flags for staged rollout; observability dashboards (AI latency/cost live in core; frontend adds exception tracking + retrieval/tutor UX metrics); retention/consent workflows; minor/guardian consent before real pilot students; load/cold-start validation (§40); DoD checklist (§38) per feature row.

## 6. Definition of Done for the promotion itself

- [ ] ADR merged; repo map, PROJECT_CONTEXT, tracker rows updated (ADR-008 discipline)
- [ ] CI green (lint, typecheck, build, tests) on the promoted repo
- [ ] E2E critical journeys pass against a core deployment
- [ ] Sanitized HTML pipeline; security headers; rate limits; no secrets in repo/env beyond session config
- [ ] WCAG 2.1 AA audit recorded
- [ ] Licensing + scope decisions recorded
- [ ] No frontend-held LLM keys; all AI via core
- [ ] Learning-log research fields captured for pilot surfaces
- [ ] User-visible behavior verified (browser walkthrough evidence pack)

## 7. Immediate smallest next steps

1. Operator answers the four Phase-0 questions (repo identity, scope, licensing, neon).
2. We execute Phase 1 unilaterally (sanitize, CI, tests, a11y, perf, naming) — no core dependency.
3. In parallel: point `SYLLABAI_CORE_BASE_URL` at a Render `syllabai-core` deployment and smoke-test the existing `core-api` provider to size the Phase-2 DTO work.
