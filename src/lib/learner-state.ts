"use client";

/**
 * Learner overlay derivation — KG phase 1.
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
 *   - `reviewDue` is a 7-day recency heuristic on measured points below
 *     strong mastery (the Ebbinghaus decay model lands in phase 2 — until
 *     then this stays a plainly-commented demo heuristic).
 *   - confidence / fluency / misconception stay null in phase 1 (attempt-
 *     slider telemetry and the SME pitfall pipeline are later phases).
 *
 * The result is pushed into the iframe over postMessage (`syllabai-kg:learner`)
 * by the knowledge-graph host; the renderer gates its embedded sample off the
 * moment a live overlay arrives.
 */
import { useEffect, useMemo, useState } from "react";
import { useCourseProgress, type CourseProgress } from "./progress";

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

interface LearnerBridge {
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

function fetchBridge(course: string): Promise<LearnerBridge | null> {
  const hit = bridgeCache.get(course);
  if (hit) return hit;
  const promise = fetch(`/api/kg-learner-bridge?course=${encodeURIComponent(course)}`)
    .then((res) => (res.ok ? (res.json() as Promise<LearnerBridge>) : null))
    .catch(() => null);
  bridgeCache.set(course, promise);
  return promise;
}

// ── derivation ──────────────────────────────────────────────────────────

const REVIEW_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // demo heuristic, see header
const STRONG_MASTERY = 80; // mirrors the renderer's LEARNER_THRESHOLDS

/** Strip a bundle's "4CH1-" style prefix; IAL bundles carry bare codes. */
function normalizeCode(code: string, prefix: string | null): string {
  if (prefix && code.startsWith(`${prefix}-`)) return code.slice(prefix.length + 1);
  return code;
}

interface Accumulator {
  weightedSum: number;
  weight: number;
  attempts: number;
  lastAt: number;
  exposure: number;
}

function buildOverlay(
  progress: CourseProgress,
  bridge: LearnerBridge,
  now: number,
): LearnerOverlay {
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
        a = { weightedSum: 0, weight: 0, attempts: 0, lastAt: 0, exposure: 0 };
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
  let measured = 0;
  let reviewDueCount = 0;
  for (const [pointId, a] of acc) {
    const hasAttempts = a.attempts > 0;
    const mastery = hasAttempts ? Math.round((a.weightedSum / a.weight) * 100) : null;
    const reviewDue =
      mastery != null && mastery < STRONG_MASTERY && now - a.lastAt > REVIEW_AFTER_MS;
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
  }

  return {
    entries,
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

// ── react binding ───────────────────────────────────────────────────────

export interface LearnerOverlayState {
  entries: Record<string, LearnerOverlayEntry>;
  stats: LearnerOverlayStats;
  /** bridge fetch failed — the host chip explains, the graph stays honest */
  bridgeError: boolean;
}

/**
 * Live learner overlay for one course: derives from the course's progress
 * store (reactive — any practice/notes/flashcard interaction re-derives and
 * the host re-posts into the iframe) joined against the content bridge.
 */
export function useLearnerOverlay(course: string): LearnerOverlayState | null {
  const progress = useCourseProgress(course);
  const [bridge, setBridge] = useState<LearnerBridge | null>(null);
  const [failed, setFailed] = useState(false);

  // reset derived-fetch state on course switch during render (react.dev —
  // "adjusting state when a prop changes"), then fetch below
  const [prevCourse, setPrevCourse] = useState(course);
  if (prevCourse !== course) {
    setPrevCourse(course);
    setBridge(null);
    setFailed(false);
  }

  useEffect(() => {
    let cancelled = false;
    fetchBridge(course).then((b) => {
      if (cancelled) return;
      if (b) setBridge(b);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [course]);

  return useMemo(() => {
    if (failed) return { entries: {}, stats: emptyStats, bridgeError: true };
    if (!bridge) return null;
    const derived = buildOverlay(progress, bridge, Date.now());
    return { entries: derived.entries, stats: derived.stats, bridgeError: false };
  }, [progress, bridge, failed]);
}

const emptyStats: LearnerOverlayStats = {
  measured: 0,
  touched: 0,
  total: 0,
  attempts: 0,
  notesRead: 0,
  flashcards: 0,
  awaitingMarks: 0,
  reviewDue: 0,
};
