/**
 * Contextual Learning Assistant (CLA) — note-anchored orchestration.
 *
 * The demo twin of syllabai-core's ClaService step-1 slice, shrunk to the
 * note context (REVISION_NOTE). The defining difference from the free
 * Tutor (`lib/tutor.ts`) is EXPLICIT, SERVER-RESOLVED CONTEXT:
 *
 *   free Tutor: question → whole-corpus retrieval → answer/refusal
 *   CLA:        question + the note you are reading → evidence bounded to
 *               THAT note → mode-aware answer/refusal
 *
 * Production semantics preserved (core CLA contract):
 *   - fail-closed context resolution: the client passes opaque refs
 *     (course slug + noteId); the server resolves them and 404s unknowns —
 *     the context is never client-asserted (core ClaContextResolver §5);
 *   - mode vocabulary: EXPLAIN / SUMMARIZE are valid on a note context.
 *     HINT / CHECK are question-context modes (attempt-gated in production
 *     via ClaLeakagePolicy) and are rejected here with a typed error —
 *     the exam-question CLA surface arrives later, and the boundary is
 *     enforced in code, not in UI hints;
 *   - bounded evidence: the anchored note's chunks are the authoritative
 *     prior (core: "anchor KG node + its validated spec structure");
 *   - honest refusal: a free question the note cannot ground on is refused
 *     deterministically and pointed at the free Tutor — the tutor-parity
 *     boundary from core's leakage policy (KG_TOPIC contexts behave like
 *     the tutor; out-of-scope asks do not get guessed answers).
 *
 * Like the Tutor, the CLA never mutates learner state or the KG — output is
 * text + citations only. Production additionally emits a ClaInteractionEvent
 * per ask; the demo has no evidence pipeline yet, so nothing is recorded.
 */
import "server-only";
import type { AiMessage, TutorCitation } from "@/lib/contracts";
import { resolveAiProvider } from "./ai/providers";
import { tokenize, type CorpusIndex, type IndexedSegment } from "./ai/retrieval";
import { getCorpusIndex } from "./tutor";
import { loadHubCourse } from "@/lib/courses";
import type { RevisionNote } from "@/lib/contracts";

/** Modes valid on a REVISION_NOTE context (core ResponseMode subset). */
export type ClaNoteMode = "EXPLAIN" | "SUMMARIZE";

/** All four production modes — HINT/CHECK are rejected for note contexts. */
export const CLA_MODES = ["EXPLAIN", "SUMMARIZE", "HINT", "CHECK"] as const;
export type ClaMode = (typeof CLA_MODES)[number];

/** Typed, honest failure — the route maps each code to an HTTP status. */
export class ClaError extends Error {
  constructor(
    readonly code: "context_not_found" | "mode_not_valid_for_context",
    message: string,
  ) {
    super(message);
  }
}

export interface ClaContextView {
  kind: "REVISION_NOTE";
  /** exactly as the server resolved it — echoed to the client, never asserted by it */
  course: string;
  noteId: string;
  noteTitle: string;
  specPointCodes: string[];
  subtopicTitle: string | null;
  url: string;
}

export interface ClaTurnRequest {
  course: string;
  noteId: string;
  mode: ClaNoteMode;
  question: string;
  history: AiMessage[];
  /**
   * Quick actions (Definitions/Summary/Pitfalls/Exam help) are meta-asks
   * about the note as a whole, so their prompts need not lexically match the
   * note body — they are in-scope by construction and skip the scope gate.
   */
  isQuickAction?: boolean;
}

export interface ClaTurnResult {
  answer: string;
  mode: ClaNoteMode;
  context: ClaContextView;
  citations: TutorCitation[];
  provider: string;
  model: string | null;
  refused: boolean;
  evidenceCount: number;
  latencyMs: number;
}

/**
 * Lexical scope gate for FREE questions: the best BM25-lite score of the
 * question against the note's own segments. One distinctive content token
 * (idf ≈ 2–5) clears it; greetings/meta chatter does not. Deliberately LOW —
 * the gate exists to catch "asked about a different topic" honestly, not to
 * second-guess phrasing. Quick actions bypass it (in-scope by construction).
 */
const CLA_SCOPE_THRESHOLD = 1.0;

const MODE_BRIEF: Record<ClaNoteMode, string> = {
  EXPLAIN:
    "MODE EXPLAIN: teach the asked-for concept from the note. Define terms precisely, use the note's own wording and examples, and keep exam-focus.",
  SUMMARIZE:
    "MODE SUMMARIZE: compress the note into its key points. Preserve the note's structure and every spec-point anchor; do not add material that is not in the note.",
};

const SYSTEM_PROMPT = `You are the SyllabAI Contextual Learning Assistant (CLA) for Pearson Edexcel International GCSE Chemistry (4CH1), anchored to ONE revision note the learner is reading.

Rules:
1. Ground every substantive claim in the numbered EVIDENCE chunks provided — they are sections of the anchored note and nothing else. Cite them inline as [1], [2] …
2. If the note does not cover what is asked, say so plainly and suggest the free Tutor tab for wider corpus questions. Never invent spec-point codes, mark schemes, or content.
3. Use the canonical specification-point code format (e.g. 4CH1-3.14C) when referencing curriculum anchors, exactly as the note states them.
4. Keep the tone warm, precise and exam-focused. Short paragraphs, then bullets. Maximum ~250 words unless asked otherwise.
5. You are a DEMO surface: never claim to mutate learner state, mastery, or the knowledge graph. You do not grade; you explain.`;

interface NoteContext {
  note: RevisionNote;
  context: ClaContextView;
  segments: IndexedSegment[];
}

/** Fail-closed resolution: opaque refs in, resolved context out. */
export async function resolveNoteContext(course: string, noteId: string): Promise<NoteContext> {
  const hub = await loadHubCourse(course);
  const note = hub?.notes.find((n) => n.noteId === noteId);
  if (!hub || !note) {
    throw new ClaError(
      "context_not_found",
      `No revision note ${noteId} in course ${course} — the server resolves the context and refuses unknown refs (fail-closed).`,
    );
  }
  const subtopicCode = hub.noteSubtopic[note.noteId] ?? null;
  const subtopic = subtopicCode ? hub.index.subtopicByCode.get(subtopicCode) : null;
  const context: ClaContextView = {
    kind: "REVISION_NOTE",
    course,
    noteId: note.noteId,
    noteTitle: note.title,
    specPointCodes: note.specPointCodes,
    subtopicTitle: subtopic?.title ?? null,
    url: `/courses/${hub.meta.slug}/revision-notes/${note.noteId}`,
  };
  return { note, context, segments: [] };
}

/** The note's own chunks from the shared corpus index = the bounded evidence. */
async function noteSegments(course: string, noteId: string, note: RevisionNote): Promise<IndexedSegment[]> {
  const index: CorpusIndex = await getCorpusIndex();
  const segs = index.segments.filter((s) => s.kind === "REVISION_NOTE" && s.ref === noteId);
  if (segs.length > 0) return segs;
  // index misses (should not happen for bundled notes) — degrade to the raw
  // body as a single chunk rather than failing the anchored ask
  return [
    {
      kind: "REVISION_NOTE",
      ref: noteId,
      title: note.title,
      specPointCode: note.specPointCodes[0] ?? null,
      text: note.bodyMd.slice(0, 1500),
      tokens: new Map(),
      url: `/courses/${course}/revision-notes/${noteId}`,
    },
  ];
}

/** BM25-lite score of the question against one segment (idf from the corpus index). */
function segmentScore(index: CorpusIndex, seg: IndexedSegment, question: string): number {
  let score = 0;
  const seen = new Set<string>();
  for (const tok of tokenize(question)) {
    if (seen.has(tok)) continue;
    seen.add(tok);
    const tf = seg.tokens.get(tok) ?? 0;
    if (tf > 0) score += (index.idf.get(tok) ?? 1) * (1 + Math.log(tf));
  }
  return score;
}

export async function claTurn(req: ClaTurnRequest): Promise<ClaTurnResult> {
  const started = Date.now();
  if (req.mode !== "EXPLAIN" && req.mode !== "SUMMARIZE") {
    throw new ClaError(
      "mode_not_valid_for_context",
      `Mode ${req.mode} is a question-context mode (attempt-gated in production). This note context accepts EXPLAIN and SUMMARIZE only.`,
    );
  }
  const resolved = await resolveNoteContext(req.course, req.noteId);
  const { note, context } = resolved;
  const index = await getCorpusIndex();
  const segments = await noteSegments(req.course, req.noteId, note);

  const provider = resolveAiProvider();
  const citations: TutorCitation[] = segments.map((s, i) => ({
    index: i + 1,
    label: s.title,
    kind: "REVISION_NOTE",
    ref: s.ref,
    specPointCode: s.specPointCode,
    url: s.url,
    score: 0,
  }));

  // scope gate — free questions only (quick actions are in-scope by construction)
  const scores = segments.map((s) => segmentScore(index, s, req.question));
  const best = Math.max(...scores, 0);
  if (!req.isQuickAction && best < CLA_SCOPE_THRESHOLD) {
    return {
      answer:
        `This note doesn't cover that — I'm refusing rather than guessing, exactly like the production CLA (bounded context, honest refusal).\n\n` +
        `I can only answer from "${note.title}"${context.specPointCodes.length ? ` (${context.specPointCodes.join(", ")})` : ""}. ` +
        `Try one of the quick actions, ask about this note's topic, or use the free Tutor tab — it searches the whole bundled corpus.`,
      mode: req.mode,
      context,
      citations,
      provider: provider.id,
      model: provider.model,
      refused: true,
      evidenceCount: 0,
      latencyMs: Date.now() - started,
    };
  }
  for (const [i, s] of scores.entries()) citations[i].score = s;

  const evidenceBlock = segments
    .map((s, i) => `[${i + 1}] (note section${s.specPointCode ? ` · ${s.specPointCode}` : ""}) ${s.title}\n${s.text.slice(0, 900)}`)
    .join("\n\n");

  const messages: AiMessage[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${MODE_BRIEF[req.mode]}` },
    ...req.history.slice(-6),
    {
      role: "user",
      content: `ANCHORED NOTE: ${note.title}${context.specPointCodes.length ? ` (${context.specPointCodes.join(", ")})` : ""}\n\nLEARNER QUESTION:\n${req.question}\n\nEVIDENCE — sections of this note only (cite by number):\n${evidenceBlock}`,
    },
  ];

  try {
    const result = await provider.complete({ messages, temperature: 0.25, maxTokens: 900 });
    return {
      answer: result.text,
      mode: req.mode,
      context,
      citations,
      provider: result.provider,
      model: result.model,
      refused: false,
      evidenceCount: segments.length,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    return {
      answer:
        `The AI provider call failed (${e instanceof Error ? e.message.slice(0, 140) : "unknown"}), so here is the honest fallback: the note sections I grounded on are listed below. No answer was fabricated.`,
      mode: req.mode,
      context,
      citations,
      provider: provider.id,
      model: provider.model,
      refused: true,
      evidenceCount: segments.length,
      latencyMs: Date.now() - started,
    };
  }
}
