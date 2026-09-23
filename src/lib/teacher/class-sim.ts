import type { CourseBundle } from "../courses";
import { buildSpecTreeIndex, subtopicOfQuestionSet } from "../spec-tree";

/**
 * Class evidence for the teacher lens (TEACHER-2) — deterministic SAMPLE
 * cohort generation + per-subtopic aggregation.
 *
 * Spec source: syllabai/syllabai TEACHER_ARCHITECTURE.md §13 + §15 and the
 * production ClassIntelligenceView evidence semantics:
 *   - class understanding bands come from aggregated learner mastery;
 *   - aggregation must expose DISTRIBUTIONS (proficient / developing /
 *     struggling), never a single misleading average;
 *   - NOT_TAUGHT is a teaching-coverage overlay state, semantically distinct
 *     from LOW_MASTERY (the coverage toggle lives client-side, per teacher).
 *
 * Topology comes from the same buildSpecTreeIndex the student hub uses —
 * identical subtopic codes, order and the synthetic "general" rows — so the
 * teacher lens and student surfaces can never drift apart.
 *
 * Demo discipline: the cohort is SIMULATED, deterministically seeded per
 * course so every render agrees. Where the corpus learner-sim has anchored
 * spec-point state (currently the 4CH1 pilot's measured points), the cohort
 * is pulled toward it (`hasSimEvidence`). Every surface built on this module
 * must carry the SAMPLE disclosure.
 */

export const SAMPLE_CLASS_SIZE = 24;

export type UnderstandingBand = "strong" | "good" | "developing" | "weak" | "critical";

export interface SubtopicMisconception {
  code: string;
  title: string;
  probability: number;
  evidenceCount: number;
}

export interface SubtopicAggregate {
  code: string;
  label: string;
  title: string;
  sectionCode: string;
  sectionTitle: string;
  /** Question-set slugs anchored to this subtopic (Test Builder input). */
  setSlugs: string[];
  /** Mean mastery of the SAMPLE cohort (0–1). */
  meanMastery: number;
  /** Share of the cohort at mastery >= 0.75 (percent). */
  proficientPct: number;
  /** Share at 0.45–0.75 (percent). */
  developingPct: number;
  /** Share below 0.45 (percent). */
  strugglingPct: number;
  band: UnderstandingBand;
  misconceptions: SubtopicMisconception[];
  /** True when the corpus learner-sim anchors this subtopic (not just the seeded cohort). */
  hasSimEvidence: boolean;
  /**
   * Anchor mean (mean of the corpus sim spec-point masteries) when anchored,
   * else null. Exposed so client-side sims can replicate the per-student
   * draws EXACTLY (roster.ts) — the RNG sequence per subtopic is: drift,
   * then base (only drawn when unanchored).
   */
  anchorMean: number | null;
  questionCount: number;
  totalMarks: number;
}

export interface ClassSection {
  code: string;
  title: string;
  subtopics: SubtopicAggregate[];
}

export interface ClassOverview {
  course: {
    slug: string;
    label: string;
    subject: string;
    code: string;
    level: string;
    board: string;
    syllabusVersion: string;
  };
  className: string;
  students: number;
  sections: ClassSection[];
  classMean: number;
  weakest: { code: string; title: string; meanMastery: number } | null;
  /** Subtopics with anchored sim evidence (count). */
  anchoredSubtopics: number;
}

// ── deterministic PRNG (mulberry32) + string hash ─────────────────────────
// Exported so client-side sims (roster.ts) replicate the exact same draws —
// one PRNG truth for every SAMPLE surface.

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ── bands (TEACHER_ARCHITECTURE §13.1) ────────────────────────────────────

export function bandOf(mastery: number): UnderstandingBand {
  if (mastery >= 0.75) return "strong";
  if (mastery >= 0.6) return "good";
  if (mastery >= 0.45) return "developing";
  if (mastery >= 0.3) return "weak";
  return "critical";
}

// ── cohort + aggregation ──────────────────────────────────────────────────

const aggregateCache = new Map<string, ClassOverview>();

export function buildClassOverview(bundle: CourseBundle): ClassOverview {
  const slug = bundle.meta.slug;
  const cached = aggregateCache.get(slug);
  if (cached) return cached;

  const index = buildSpecTreeIndex(bundle.curriculum);

  // question sets anchored per subtopic code (same mapping the hub uses)
  const setsBySubtopic = new Map<string, string[]>();
  const setBySlug = new Map(bundle.questionTopics.map((t) => [t.slug, t]));
  for (const t of bundle.questionTopics) {
    const code = subtopicOfQuestionSet(t, index);
    if (code) {
      const list = setsBySubtopic.get(code) ?? [];
      list.push(t.slug);
      setsBySubtopic.set(code, list);
    }
  }

  // anchor: corpus learner-sim mastery per spec point → mean per subtopic
  const simByCode = new Map(bundle.simLearner.skillStates.map((s) => [s.code, s]));

  // misconception pool → deterministic assignment to subtopics (SAMPLE)
  const misconceptions = bundle.simLearner.misconceptionStates;

  const sections: ClassSection[] = [];
  let classSum = 0;
  let classN = 0;
  let weakest: ClassOverview["weakest"] = null;
  let anchored = 0;

  for (const topic of index.tree.topics) {
    const subtopics: SubtopicAggregate[] = topic.subtopics.map((sub, j) => {
      const setSlugs = setsBySubtopic.get(sub.code) ?? [];
      const sets = setSlugs.map((s) => setBySlug.get(s)).filter((s) => s !== undefined);
      const questionCount = sets.reduce((a, s) => a + s.questions.length, 0);
      const totalMarks = sets.reduce(
        (a, s) => a + s.questions.reduce((x, q) => x + q.totalMarks, 0),
        0,
      );

      const sims = sub.specPointCodes
        .map((c) => simByCode.get(c)?.mastery)
        .filter((m): m is number => typeof m === "number");
      const hasSimEvidence = sims.length > 0;
      if (hasSimEvidence) anchored += 1;
      const anchorMean = hasSimEvidence ? sims.reduce((a, b) => a + b, 0) / sims.length : null;

      // per-student mastery, deterministic per (course, subtopic, student)
      const rand = mulberry32(hashString(`${slug}:${sub.code}`));
      const masteries: number[] = [];
      for (let i = 0; i < SAMPLE_CLASS_SIZE; i++) {
        const drift = rand() * 0.4 - 0.2; // ±0.20 around the anchor
        const base = anchorMean ?? 0.18 + rand() * 0.62; // unanchored: 0.18–0.80 spread
        masteries.push(clamp01(base + drift));
      }
      const mean = masteries.reduce((a, b) => a + b, 0) / masteries.length;
      const proficient = masteries.filter((m) => m >= 0.75).length;
      const developing = masteries.filter((m) => m >= 0.45 && m < 0.75).length;
      const struggling = SAMPLE_CLASS_SIZE - proficient - developing;

      // misconceptions: 0–2 per subtopic, deterministic pick from the pool
      const mCount = Math.floor(rand() * 2.4); // 0–2, weighted toward 0–1
      const start = Math.floor(rand() * Math.max(1, misconceptions.length));
      const subMis: SubtopicMisconception[] = [];
      for (let k = 0; k < mCount && misconceptions.length > 0; k++) {
        const m = misconceptions[(start + k) % misconceptions.length];
        if (!subMis.some((x) => x.code === m.code)) {
          subMis.push({
            code: m.code,
            title: m.title,
            probability: Math.round((0.18 + rand() * 0.42) * 100) / 100,
            evidenceCount: 2 + Math.floor(rand() * 9),
          });
        }
      }

      classSum += mean;
      classN += 1;
      if (!weakest || mean < weakest.meanMastery) {
        weakest = { code: sub.code, title: sub.title, meanMastery: mean };
      }

      return {
        code: sub.code,
        label: sub.label,
        title: sub.title,
        sectionCode: topic.code,
        sectionTitle: topic.title,
        setSlugs,
        meanMastery: Math.round(mean * 1000) / 1000,
        proficientPct: Math.round((proficient / SAMPLE_CLASS_SIZE) * 100),
        developingPct: Math.round((developing / SAMPLE_CLASS_SIZE) * 100),
        strugglingPct: Math.round((struggling / SAMPLE_CLASS_SIZE) * 100),
        band: bandOf(mean),
        misconceptions: subMis,
        hasSimEvidence,
        anchorMean,
        questionCount,
        totalMarks,
      };
    });

    if (subtopics.length > 0) {
      sections.push({ code: topic.code, title: topic.title, subtopics });
    }
  }

  const overview: ClassOverview = {
    course: {
      slug,
      label: bundle.meta.label,
      subject: bundle.meta.subject,
      code: bundle.meta.code,
      level: bundle.meta.level,
      board: bundle.curriculum.board,
      syllabusVersion: bundle.curriculum.syllabusVersion,
    },
    className: `${bundle.meta.subject} 10A · SAMPLE cohort`,
    students: SAMPLE_CLASS_SIZE,
    sections,
    classMean: classN > 0 ? Math.round((classSum / classN) * 1000) / 1000 : 0,
    weakest,
    anchoredSubtopics: anchored,
  };
  aggregateCache.set(slug, overview);
  return overview;
}
