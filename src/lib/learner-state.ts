"use client";

/**
 * Learner overlay derivation — KG phase 1 (derivation), extended in phase 2.
 *
 * The v77 renderer ships a dormant learner-state engine: GRAPH_CONTRACT v1.0
 * declares a per-spec-point `learnerOverlay` (mastery / confidence / fluency /
 * evidence / reviewDue / misconception), and the student lens already paints
 * mastery bands (55/70/80), review flags and a full next-best-action scorer
 * off it. The engine was fed nothing — an embedded OpenHuman *sample* map lit
 * up whatever point codes happened to collide, which is neither honest nor
 * course-aware.
 *
 * This module feeds the engine from the demo's only learner evidence source:
 * the browser-local progress overlay (lib/progress.ts — SIMULATED by design,
 * never written to canonical content). Derivation follows the honesty rules
 * the web workbench pins for its measured-fact surfaces:
 *
 *   - mastery comes from MARKED attempts only (self-scores and MCQ marks,
 *     marks-weighted). Reading notes or rating flashcards is self-report —
 *     it never produces a mastery number.
 *   - no evidence at all → mastery null → the renderer shows its own
 *     "Not measured" state (gray ring, no band). Nothing is invented.
 *   - notes read / flashcards rated contribute to `evidence` (exposure —
 *     the renderer's thin-evidence heuristic), not to mastery.
 *   - `reviewDue` is the forgetting-decay model (lib/forgetting.ts): a point
 *     is due when its Ebbinghaus-decayed effective mastery crosses the band
 *     threshold above where it was demonstrated (τ = 30/90/365 days — demo
 *     parameters, same shape as the web workbench's nightly job).
 *   - confidence / fluency / misconception stay null (attempt-slider
 *     telemetry and the SME pitfall pipeline are later phases).
 *
 * The result is pushed into the iframe over postMessage (`syllabai-kg:learner`)
 * by the knowledge-graph host; the renderer gates its embedded sample off the
 * moment a live overlay arrives. Phase 2 layers the My State / History drawer
 * on top of the same derivation (lib/kg-learner-state.ts) — this module keeps
 * the shared pieces: the content bridge, the per-point accumulators and the
 * overlay build itself.
 */
import { useCourseProgress, type CourseProgress } from "./progress";
import { isReviewDue } from "./forgetting";

/** One spec point's learner state — shapes exactly match the renderer's
 *  GRAPH_CONTRACT v1.0 learnerOverlay declaration. */
export interface LearnerOverlayEntry {
  mastery: number | null;
  confidence: number | null;
  fluency: number | null;
  evidence: number;
  reviewDue: boolean;
  misconception: string | null;
}

export interface LearnerOverlayStats {
  /** points with at least one marked attempt (renderer: colored + scored) */
  measured: number;
  /** points with any evidence at all (attempts, exposure) */
  touched: number;
  total: number;
  attempts: number;
  notesRead: number;
  flashcards: number;
  /** typed answer drafts whose question was never self-scored */
  awaitingMarks: number;
  reviewDue: number;
}

export interface LearnerOverlay {
  entries: Record<string, LearnerOverlayEntry>;
  stats: LearnerOverlayStats;
}

export interface LearnerBridge {
  course: string;
  codePrefix: string | null;
  totalPoints: number;
  pointIds: string[];
  noteCodes: Record<string, string[]>;
  questionCodes: Record<string, string[]>;
  partParent: Record<string, string>;
  flashcardCodes: Record<string, string[]>;
}

// ── bridge fetch (per-course, in-process cache) ─────────────────────────

const bridgeCache = new Map<string, Promise<LearnerBridge | null>>();

/** Fetch (and memoize) the content-id → spec-point bridge for one course. */
export function fetchBridge(course: string): Promise<LearnerBridge | null> {
  const hit = bridgeCache.get(course);
  if (hit) return hit;
  const promise = fetch(`/api/kg-learner-bridge?course=${encodeURIComponent(course)}`)
    .then((res) => (res.ok ? (res.json() as Promise<LearnerBridge>) : null))
    .catch(() => null);
  bridgeCache.set(course, promise);
  return promise;
}

// ── derivation ──────────────────────────────────────────────────────────

/** Strip a bundle's "4CH1-" style prefix; IAL bundles carry bare codes. */
export function normalizeCode(code: string, prefix: string | null): string {
  if (prefix && code.startsWith(`${prefix}-`)) return code.slice(prefix.length + 1);
  return code;
}

/** Per-point accumulation detail — what the phase-2 drawer builds its
 *  stored→effective mastery rows and review queue from. */
export interface PointDetail {
  pointId: string;
  /** null = no marked attempt on this point (exposure only) */
  mastery: number | null;
  attempts: number;
  exposure: number;
  /** last evidence of ANY kind (display: "last activity") */
  lastAt: number;
  /** last MARKED attempt — the decay anchor (reading a note is exposure,
   *  not practice: it must not refresh the memory-decay clock) */
  lastAttemptAt: number;
  reviewDue: boolean;
}

export interface LearnerModel extends LearnerOverlay {
  /** per-point detail for every touched point (empty if no evidence) */
  details: PointDetail[];
}

interface Accumulator {
  weightedSum: number;
  weight: number;
  attempts: number;
  lastAt: number;
  lastAttemptAt: number;
  exposure: number;
}

export function buildOverlay(
  progress: CourseProgress,
  bridge: LearnerBridge,
  now: number,
): LearnerModel {
  const pointIds = new Set(bridge.pointIds);
  const acc = new Map<string, Accumulator>();

  const accumulate = (
    rawCodes: string[] | undefined,
    apply: (a: Accumulator) => void,
  ) => {
    if (!rawCodes) return;
    for (const raw of rawCodes) {
      const id = normalizeCode(raw, bridge.codePrefix);
      if (!pointIds.has(id)) continue;
      let a = acc.get(id);
      if (!a) {
        a = { weightedSum: 0, weight: 0, attempts: 0, lastAt: 0, lastAttemptAt: 0, exposure: 0 };
        acc.set(id, a);
      }
      apply(a);
    }
  };

  let attempts = 0;

  // marked attempts — the only mastery evidence (honesty rule, see header)
  for (const [questionId, event] of Object.entries(progress.selfScores)) {
    if (event.max <= 0) continue;
    attempts += 1;
    const signal = Math.min(1, Math.max(0, event.score / event.max));
    const weight = event.max; // a 6-mark part is stronger evidence than a 1-mark one
    accumulate(bridge.questionCodes[questionId], (a) => {
      a.weightedSum += signal * weight;
      a.weight += weight;
      a.attempts += 1;
      a.lastAt = Math.max(a.lastAt, event.at);
      a.lastAttemptAt = Math.max(a.lastAttemptAt, event.at);
    });
  }
  for (const [questionId, event] of Object.entries(progress.mcqAnswers)) {
    attempts += 1;
    const signal = event.correct ? 1 : 0;
    accumulate(bridge.questionCodes[questionId], (a) => {
      a.weightedSum += signal;
      a.weight += 1;
      a.attempts += 1;
      a.lastAt = Math.max(a.lastAt, event.at);
      a.lastAttemptAt = Math.max(a.lastAttemptAt, event.at);
    });
  }

  // exposure — evidence strength only, never mastery
  let notesRead = 0;
  for (const [noteId, event] of Object.entries(progress.notesRead)) {
    notesRead += 1;
    accumulate(bridge.noteCodes[noteId], (a) => {
      a.exposure += 0.25;
      a.lastAt = Math.max(a.lastAt, event.at);
    });
  }
  let flashcards = 0;
  for (const [cardId, event] of Object.entries(progress.flashcards)) {
    flashcards += 1;
    accumulate(bridge.flashcardCodes[cardId], (a) => {
      a.exposure += 0.5;
      a.lastAt = Math.max(a.lastAt, event.at);
    });
  }

  // typed drafts on questions that were never self-scored → "awaiting marks"
  let awaitingMarks = 0;
  for (const partId of Object.keys(progress.typedAnswers)) {
    const parentId = bridge.partParent[partId];
    if (parentId && !progress.selfScores[parentId]) awaitingMarks += 1;
  }

  const entries: Record<string, LearnerOverlayEntry> = {};
  const details: PointDetail[] = [];
  let measured = 0;
  let reviewDueCount = 0;
  for (const [pointId, a] of acc) {
    const hasAttempts = a.attempts > 0;
    const mastery = hasAttempts ? Math.round((a.weightedSum / a.weight) * 100) : null;
    // decay-model review flag (phase 2): due once effective mastery — decayed
    // from the last MARKED attempt, not from exposure — crosses the threshold
    // above where the point was demonstrated
    const reviewDue =
      mastery != null && a.lastAttemptAt > 0 && isReviewDue(mastery, a.lastAttemptAt, now);
    if (mastery != null) measured += 1;
    if (reviewDue) reviewDueCount += 1;
    entries[pointId] = {
      mastery,
      confidence: null,
      fluency: null,
      evidence: Math.round((a.attempts + a.exposure) * 100) / 100,
      reviewDue,
      misconception: null,
    };
    details.push({
      pointId,
      mastery,
      attempts: a.attempts,
      exposure: a.exposure,
      lastAt: a.lastAt,
      lastAttemptAt: a.lastAttemptAt,
      reviewDue,
    });
  }

  return {
    entries,
    details,
    stats: {
      measured,
      touched: acc.size,
      total: bridge.totalPoints,
      attempts,
      notesRead,
      flashcards,
      awaitingMarks,
      reviewDue: reviewDueCount,
    },
  };
}

// ── shared empty stats (server snapshot / bridge failure) ───────────────

export const emptyStats: LearnerOverlayStats = {
  measured: 0,
  touched: 0,
  total: 0,
  attempts: 0,
  notesRead: 0,
  flashcards: 0,
  awaitingMarks: 0,
  reviewDue: 0,
};
