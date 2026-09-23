# Teacher Mode Plan — SyllabAI demo → real

**Status:** Draft v1 (TEACHER-1) · 2026-09-22
**Owner:** syllabai-demo sessions · **Ships toward:** syllabai-core (identity + write APIs), syllabai-teacher-workbench (fold-in target)
**Front door already built:** `/login` (mock, role-split) + `/teacher` (planned-modules mockup), commit series TEACHER-1.

---

## 1. Why

The whole web app is single-role: a student home (`/dashboard`), course hubs, and
learner tools. The teacher side of SyllabAI lives only in sibling repos
(`syllabai-core` teacher controllers, `syllabai-teacher-workbench`). Before the
Cycle-1 pilot (IGCSE Chemistry 4CH1, ~50 retake students) can run with a teacher
in the loop, the web needs:

1. a **login** that makes the two roles explicit (teacher vs student),
2. a **teacher workspace** that answers "what does my cohort know?" without
   opening a database console,
3. the **data foundation** those views stand on (accounts, server-side
   progress, write path).

Everything in this plan is scoped to the demo shell first (honest mockups), then
promoted to canonical semantics in `syllabai/syllabai` ADRs and implemented
against `syllabai-core`.

## 2. Current state (audit, 2026-09-22)

| Area | State | Evidence |
|---|---|---|
| Auth | **None.** No login/signup/session/RBAC; `next-auth` in package.json but never imported; no middleware | `src/` grep; `docs/FRONTEND_PROMOTION_PLAN.md` flags identity as R4 hard blocker |
| User model | None (no users table; Drizzle read-models are content-only) | `src/lib/data/neon.ts` |
| Progress | Browser-localStorage overlay only, labelled SIMULATED | `src/lib/progress.ts`, `my-subjects.ts`, `last-opened.ts` |
| Teacher UI | None in code; teacher concepts only in docs of sibling repos | `docs/REPOSITORY_MAP.md` |
| Login mockup | **New.** `/login` role-split mockup writing `syllabai.identity.v1` | `src/app/login/`, `src/lib/identity.ts` |
| Teacher mockup | **New.** `/teacher` planned-modules page | `src/app/teacher/` |
| Content corpus | 49 courses × 7 JSON bundles, spec spine built for all (Stage 1) | `content/`, `154c7da` |

## 3. Information architecture (teacher mode)

```
/login                      role split (student | teacher)  → mock, later real
/teacher                    workspace home (cohort snapshot + module grid)
/teacher/classes            class list (pilot: one 4CH1 retake class)
/teacher/classes/[id]       roster + per-student progress table
/teacher/mastery            spec-point mastery heatmap (course × student)
/teacher/assignments        assignment list + builder (Phase 2)
/teacher/validation         AI-content approval queue (Phase 2)
/teacher/reports            exportable reports (Phase 3)
/teacher/settings           roster, invites, course links (Phase 3)
```

Rules carried over from the demo's IA discipline:

- Teacher chrome never leaks into student surfaces: the student keeps the
  header + course-shell model; teacher surfaces get their own compact sub-nav
  (same pattern as `course-shell`, no global sidebar).
- Every number that is not backed by a real attempt event is labelled
  SAMPLE/SIMULATED on-screen. Demo discipline is non-negotiable.

## 4. Data model (minimal, in core terms)

```
User        id, email, name, role: student|teacher, createdAt
Class       id, teacherId, courseId (registry slug), name, academicYear
Membership  classId, studentId, joinedAt
Assignment  id, classId, title, source (questionSet|paper|targetTest),
            specPointRefs[], dueAt, createdAt
AttemptEvent studentId, assignmentId?, courseId, specPoint, resourceId,
            kind (noteRead|mcqAnswer|typedAnswer|flashcardRating|selfScore),
            payload, correct?, createdAt
ContentReview resourceId, reviewerId, verdict (approved|edited|rejected),
            comment, createdAt
```

`AttemptEvent` is the whole game: it replaces the localStorage progress
overlay (`progress.ts`) with a server stream. The concept graph and spec spine
(already built for all 49 courses) give mastery = f(events per spec point) —
the same BKT simulation currently visualised in `/learner`, fed with real data.

## 5. Phasing

### Phase 0 — mockup (done in TEACHER-1)
- [x] `/login` role-split mockup, mock identity store, header Sign in/out
- [x] `/teacher` planned-modules mockup with sample KPI strip + needs-per-module

### Phase 1 — real accounts + first analytics
- Real auth in the demo (NextAuth credentials → JWT session; core-api token
  exchange later). Role from the user record, not from the login card.
- Server progress: `AttemptEvent` write API + client migration (write-through:
  keep localStorage as cache, emit events when online).
- `/teacher` home with real cohort snapshot for the pilot class.
- `/teacher/mastery` heatmap v1 for 4CH1 (spec spine × students).
- **Exit criteria:** teacher signs in, sees real per-student mastery for 4CH1,
  zero numbers on screen are invented.

### Phase 2 — teacher acts on the data
- Assignments: build from question set/paper, assign to class, due dates,
  completion tracking (reuse Target Test player scaffolding).
- AI content validation queue: teacher approves/edits AI-marked answers and
  AI-generated notes before they count (corpus pipeline already anticipates a
  teacher-validation step).
- **Exit criteria:** a teacher can run one full assignment cycle end-to-end.
- **Shipped (TEACHER-3, demo-truth, 2026-09-24):** both modules exist with the
  exit criteria satisfied *on the demo substrate* — build → assign → collect →
  review is runnable end-to-end:
  - `/teacher/assignments`: builder assembles against the REAL bank via the
    Test Builder API (counts on the assignment are actual numbers); assign to
    the SAMPLE class with a due date; completion + scores from the
    deterministic roster sim (`src/lib/teacher/roster.ts`) that replicates the
    class-sim per-student draws EXACTLY (one PRNG truth — a student weak in
    the class lens is weak here); roster table, close/reopen, "Build
    remediation test" deep-link (§16 loop), "Assign this test" from the Test
    Builder selection; assignments persist in `syllabai.assignments.v1`,
    completion is computed (never stored, cannot drift).
  - `/teacher/validation`: queue of REAL AI-authored model solutions from the
    bank (`GET /api/teacher/validation-queue`, round-robin across subtopics);
    approve / edit & approve / reject + comment → `ContentReview` records in
    `syllabai.contentReviews.v1` (local until the write path exists).
  - **Still Phase-1-gated:** completion/tracking numbers remain SAMPLE until
    real accounts + AttemptEvents exist; assignment distribution to real
    student inboxes and verdict enforcement in the pipeline need the write
    path. Auth-later plan: data shapes match plan §4, all writes behind
    versioned stores, `identity.ts` is the only role source — the Phase 1
    swap (NextAuth session + server stores) is mechanical.

**Status update (TEACHER-2, 2026-09-23):** the demo now implements the
canonical teacher surfaces from `syllabai/syllabai` TEACHER_ARCHITECTURE.md:
§5 resource access (subject-scoped links into the existing hub + "add topic
to Test Builder" affordances on the exam-questions index), §6 Test Builder
(`/teacher/test-builder` — marks-aware deterministic assembly from the
committed question bank, class-weakness lane with transparent reasons,
answer key, print export, locally saved tests), and §13 the class knowledge
graph (`/teacher/class-graph` — teaching-coverage overlay × understanding
bands, distributions not averages, misconceptions, remediation deep-link).
All class evidence is a deterministic SAMPLE cohort (labelled), anchored
where the corpus learner-sim has measured spec points.

### Phase 3 — operations
- Reports & exports (per student, per class, term view).
- Roster & settings: invites, multiple classes, RBAC hardening.
- Fold into `syllabai-teacher-workbench` / promote screens toward the
  production `syllabai-web`.

## 6. Migration path for existing demo behaviour

| Today (localStorage) | Becomes |
|---|---|
| `syllabai.mySubjects.v1` | `Membership` + student's course list server-side |
| `syllabai.lastOpened.v1` | derivable from `AttemptEvent` (latest per resource) |
| `syllabai-demo:progress:<course>` | `AttemptEvent` stream + mastery projection |
| `syllabai.identity.v1` (mock) | real session (NextAuth / core identity) |
| `/learner` SIMULATED overlay | same UI fed by real BKT inputs (Phase 1+) |

## 7. Open questions

1. Auth provider for the demo: NextAuth credentials (fast) vs deferring
   straight to `syllabai-core` identity (canonical but slower)?
2. Do teachers also need read access to the AI tutor transcripts of their
   students (safeguarding vs privacy)?
3. Heatmap granularity: spec point (fine) vs topic (coarser, calmer visuals)?
4. Should student-facing surfaces show "your teacher can see this" disclosure
   before Phase 1 ships to the pilot?
