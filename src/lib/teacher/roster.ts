import { SAMPLE_CLASS_SIZE, hashString, mulberry32 } from "./class-sim";

/**
 * Roster + assignment-completion sim for the teacher Assignments surface
 * (TEACHER-2 Phase 2, demo-truth).
 *
 * Spec source: syllabai/syllabai TEACHER_ARCHITECTURE.md §6 (build → assign →
 * collect → review) and the TEACHER_MODE_PLAN §4 Assignment data model.
 *
 * Demo discipline (non-negotiable):
 *   - The roster is a SAMPLE cohort: 24 deterministic students with the SAME
 *     per-subtopic masteries the Class knowledge graph aggregates — replicated
 *     here draw-for-draw from the class-sim RNG (one PRNG truth), so a student
 *     who is "weak" in the class lens is weak here too.
 *   - Completion + scores are SIMULATED, deterministically seeded per
 *     (assignment, student), correlated to that student's mastery — never a
 *     real attempt event. Every surface built on this module must carry the
 *     SAMPLE disclosure.
 */

export const SAMPLE_STUDENT_NAMES = [
  "Amara K.",
  "Ben N.",
  "Chen W.",
  "Dina F.",
  "Elias M.",
  "Farah S.",
  "Gabriel O.",
  "Hana T.",
  "Ivan P.",
  "Jade R.",
  "Kofi A.",
  "Lena V.",
  "Marcus D.",
  "Nadia H.",
  "Omar B.",
  "Priya G.",
  "Quinn L.",
  "Rania Z.",
  "Samuel E.",
  "Tara Y.",
  "Umar J.",
  "Vera C.",
  "Wesley K.",
  "Yara N.",
] as const;

export interface RosterStudent {
  index: number;
  name: string;
  /** Per-subtopic mastery (0–1), keyed by subtopic code. */
  mastery: Record<string, number>;
  /** Mean mastery across the subtopics passed to buildRoster (0–1). */
  meanMastery: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Rebuild the per-student masteries behind the class aggregates.
 * MUST match class-sim's draw order exactly: per subtopic, seeded
 * mulberry32(hash(`${slug}:${code}`)), then per student — drift first,
 * base only when unanchored.
 */
export function buildRoster(
  courseSlug: string,
  subtopics: { code: string; anchorMean: number | null }[],
): RosterStudent[] {
  const mastery: Record<string, number>[] = SAMPLE_STUDENT_NAMES.map(() => ({}));
  for (const sub of subtopics) {
    const rand = mulberry32(hashString(`${courseSlug}:${sub.code}`));
    for (let i = 0; i < SAMPLE_CLASS_SIZE; i++) {
      const drift = rand() * 0.4 - 0.2; // ±0.20 around the anchor
      const base = sub.anchorMean ?? 0.18 + rand() * 0.62; // unanchored: 0.18–0.80 spread
      mastery[i][sub.code] = clamp01(base + drift);
    }
  }
  return SAMPLE_STUDENT_NAMES.map((name, i) => {
    const values = subtopics.map((s) => mastery[i][s.code]).filter((v) => typeof v === "number");
    const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return { index: i, name, mastery: mastery[i], meanMastery: mean };
  });
}

// ── assignment completion sim ──────────────────────────────────────────────

export type SubmissionState = "complete" | "late" | "missing";

export interface SimulatedSubmission {
  studentIndex: number;
  state: SubmissionState;
  /** Marks achieved (null when missing). */
  score: number | null;
  /** Deterministic pseudo-timestamp, null when missing. */
  submittedAt: string | null;
}

export interface AssignmentSimInput {
  id: string;
  marksTotal: number;
  dueAt: string;
  subtopicCodes: string[];
}

/**
 * Deterministic per-(assignment, student) completion + score, correlated to
 * the student's mean mastery over the assignment's subtopics: stronger
 * students are likelier to submit on time and score closer to their mastery.
 */
export function simulateSubmissions(
  assignment: AssignmentSimInput,
  students: RosterStudent[],
): SimulatedSubmission[] {
  const dueMs = Date.parse(assignment.dueAt);
  const DAY = 24 * 60 * 60 * 1000;
  return students.map((student) => {
    const values = assignment.subtopicCodes
      .map((c) => student.mastery[c])
      .filter((v): v is number => typeof v === "number");
    const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : student.meanMastery;
    const rand = mulberry32(hashString(`${assignment.id}:${student.index}`));
    const completeProb = Math.min(0.97, Math.max(0.15, 0.35 + 0.6 * mean));
    if (rand() >= completeProb) {
      return { studentIndex: student.index, state: "missing" as const, score: null, submittedAt: null };
    }
    const late = rand() < 0.18;
    const score = Math.round(clamp01(mean + rand() * 0.3 - 0.15) * assignment.marksTotal);
    const offset = late ? (1 + Math.floor(rand() * 3)) * DAY : -(1 + Math.floor(rand() * 6)) * DAY;
    const submittedAt = Number.isFinite(dueMs) ? new Date(dueMs + offset).toISOString() : null;
    return {
      studentIndex: student.index,
      state: late ? ("late" as const) : ("complete" as const),
      score,
      submittedAt,
    };
  });
}

export function summarizeSubmissions(subs: SimulatedSubmission[]) {
  const complete = subs.filter((s) => s.state === "complete").length;
  const late = subs.filter((s) => s.state === "late").length;
  const missing = subs.filter((s) => s.state === "missing").length;
  const scored = subs.filter((s) => typeof s.score === "number");
  const meanScore =
    scored.length > 0
      ? Math.round(
          (scored.reduce((a, s) => a + (s.score ?? 0), 0) / scored.length) * 10,
        ) / 10
      : null;
  return { complete, late, missing, meanScore };
}
