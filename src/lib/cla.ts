/**
 * Contextual Learning Assistant (CLA) — explicitly-anchored orchestration.
 *
 * The demo twin of syllabai-core's ClaService, in three context kinds. The
 * defining difference from the free Tutor (`lib/tutor.ts`) is EXPLICIT,
 * SERVER-RESOLVED CONTEXT:
 *
 *   free Tutor: question → whole-corpus retrieval → answer/refusal
 *   CLA:        question + an anchored context → evidence bounded to THAT
 *               context → mode-aware answer/refusal
 *
 * Contexts (each resolved fail-closed from opaque refs — never client-asserted):
 *   REVISION_NOTE  one revision note (the note reader's CLA island)
 *   SPEC_TOPIC     one spec-tree topic (the standalone assistant tab; the
 *                  demo twin of production's KG_TOPIC) — evidence is the
 *                  notes joined to the topic's spec points
 *   EXAM_QUESTION  one exam-bank question — HINT grounds on joined notes +
 *                  the question's own parts (never the scheme); CHECK adds
 *                  the mark scheme and is attempt-gated (the demo twin of
 *                  core's ClaLeakagePolicy 409)
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
import type { RevisionNote, ExamQuestion } from "@/lib/contracts";

/** Modes valid on a REVISION_NOTE context (core ResponseMode subset). */
export type ClaNoteMode = "EXPLAIN" | "SUMMARIZE";

/** All four production modes — HINT/CHECK are rejected for note contexts. */
export const CLA_MODES = ["EXPLAIN", "SUMMARIZE", "HINT", "CHECK"] as const;
export type ClaMode = (typeof CLA_MODES)[number];

/** Typed, honest failure — the route maps each code to an HTTP status. */
export class ClaError extends Error {
  constructor(
    readonly code:
      | "context_not_found"
      | "mode_not_valid_for_context"
      | "attempt_required",
    message: string,
  ) {
    super(message);
  }
}

export interface ClaNoteContextView {
  kind: "REVISION_NOTE";
  /** exactly as the server resolved it — echoed to the client, never asserted by it */
  course: string;
  noteId: string;
  noteTitle: string;
  specPointCodes: string[];
  subtopicTitle: string | null;
  url: string;
}

/**
 * SPEC_TOPIC — the standalone assistant's topic anchor (the demo twin of
 * production's KG_TOPIC): one spec-tree topic of one course, resolved
 * fail-closed; evidence is bounded to the revision notes joined to that
 * topic's spec points.
 */
export interface ClaTopicContextView {
  kind: "SPEC_TOPIC";
  course: string;
  topicCode: string;
  topicTitle: string;
  /** every spec point under the topic (display cap rides with the client) */
  specPointCodes: string[];
  url: string;
}

/**
 * EXAM_QUESTION — anchored to one exam-bank question, resolved fail-closed.
 * HINT grounds on the joined note sections + the question's own parts
 * (never the scheme); CHECK additionally grounds on the mark scheme and is
 * attempt-gated (the demo twin of core's ClaLeakagePolicy 409).
 */
export interface ClaQuestionContextView {
  kind: "EXAM_QUESTION";
  course: string;
  questionId: string;
  topicSlug: string | null;
  label: string;
  specPointCodes: string[];
  /** server ECHO of the client's attempt assertion (local progress store) —
   *  the demo is honest that this is asserted, not verified */
  attempted: boolean;
  url: string | null;
}

export type ClaContextView =
  | ClaNoteContextView
  | ClaTopicContextView
  | ClaQuestionContextView;

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
  /** the resolved mode — every production mode is reachable across contexts */
  mode: ClaMode;
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
      // a provider that THREW did not answer — never credit it as if it had
      // (the footer must not read "Answered by zai · glm" over a failure)
      provider: "unavailable",
      model: null,
      refused: true,
      evidenceCount: segments.length,
      latencyMs: Date.now() - started,
    };
  }
}

// ── SPEC_TOPIC context (standalone assistant tab) ────────────────────────

export interface ClaTopicTurnRequest {
  course: string;
  topicCode: string;
  mode: ClaNoteMode;
  question: string;
  history: AiMessage[];
}

/** Corpus-order cap — a topic's notes can be large; the anchor stays bounded. */
const TOPIC_SEGMENT_CAP = 24;

const TOPIC_SYSTEM_PROMPT = `You are the SyllabAI Contextual Learning Assistant (CLA), anchored to ONE specification topic of the learner's course.

Rules:
1. Ground every substantive claim in the numbered EVIDENCE chunks — they are sections of the revision notes joined to the anchored topic's spec points, and nothing else. Cite them inline as [1], [2] …
2. If the joined notes do not cover what is asked, say so plainly and suggest the free Tutor tab for whole-corpus questions. Never invent spec-point codes, mark schemes, or content.
3. Use the canonical specification-point code format when referencing curriculum anchors, exactly as the evidence states them.
4. Keep the tone warm, precise and exam-focused. Short paragraphs, then bullets. Maximum ~250 words unless asked otherwise.
5. You are a DEMO surface: never claim to mutate learner state, mastery, or the knowledge graph. You do not grade; you explain.`;

/** Fail-closed: unknown course/topic → typed 404; evidence bounded to the topic's notes. */
export async function resolveTopicContext(
  course: string,
  topicCode: string,
): Promise<{ context: ClaTopicContextView; segments: IndexedSegment[] }> {
  const hub = await loadHubCourse(course);
  const topic = hub?.index.topicByCode.get(topicCode);
  if (!hub || !topic) {
    throw new ClaError(
      "context_not_found",
      `No spec topic ${topicCode} in course ${course} — the server resolves the context and refuses unknown refs (fail-closed).`,
    );
  }
  const index = await getCorpusIndex();
  const { subtopicOfSpecPoint, topicOfSubtopic } = hub.index;
  const segments = index.segments
    .filter(
      (s) =>
        s.kind === "REVISION_NOTE" &&
        s.specPointCode !== null &&
        topicOfSubtopic.get(subtopicOfSpecPoint.get(s.specPointCode) ?? "") === topicCode,
    )
    .slice(0, TOPIC_SEGMENT_CAP);
  const context: ClaTopicContextView = {
    kind: "SPEC_TOPIC",
    course,
    topicCode,
    topicTitle: topic.title,
    specPointCodes: topic.subtopics.flatMap((s) => s.specPointCodes),
    url: `/courses/${course}/specification`,
  };
  return { context, segments };
}

export async function claTopicTurn(req: ClaTopicTurnRequest): Promise<ClaTurnResult> {
  if (req.mode !== "EXPLAIN" && req.mode !== "SUMMARIZE") {
    throw new ClaError(
      "mode_not_valid_for_context",
      `Mode ${req.mode} is a question-context mode (attempt-gated in production). A topic context accepts EXPLAIN and SUMMARIZE only.`,
    );
  }
  const started = Date.now();
  const { context, segments } = await resolveTopicContext(req.course, req.topicCode);
  return groundedTurn({
    started,
    context,
    mode: req.mode,
    question: req.question,
    history: req.history,
    segments,
    scopeGate: true,
    systemPrompt: TOPIC_SYSTEM_PROMPT,
    modeBrief: MODE_BRIEF[req.mode],
    anchorLabel: `the topic "${context.topicTitle}"`,
    emptyEvidenceNote:
      "No revision notes are joined to this topic's spec points yet, so there is nothing to ground on.",
  });
}

// ── EXAM_QUESTION context (standalone assistant tab) ─────────────────────

export interface ClaQuestionTurnRequest {
  course: string;
  questionId: string;
  mode: ClaMode;
  question: string;
  history: AiMessage[];
  /** the client's attempt assertion from the local progress store — echoed, never verified */
  attempted: boolean;
}

const QUESTION_SEGMENT_CAP = 16;

const QUESTION_SYSTEM_PROMPT = `You are the SyllabAI Contextual Learning Assistant (CLA), anchored to ONE exam question the learner is working on.

Rules:
1. Ground every substantive claim in the numbered EVIDENCE chunks. Evidence is: sections of the revision notes joined to the question's spec points, the question's own parts, and (CHECK mode only) the mark scheme. Cite them inline as [1], [2] …
2. If the evidence does not cover what is asked, say so plainly. Never invent spec-point codes, mark schemes, or content.
3. Keep the tone warm, precise and exam-focused. Short paragraphs, then bullets. Maximum ~250 words unless asked otherwise.
4. You are a DEMO surface: never claim to mutate learner state, mastery, or the knowledge graph. You do not grade into the record; you explain.`;

const QUESTION_MODE_BRIEF: Record<ClaMode, string> = {
  EXPLAIN:
    "MODE EXPLAIN: teach the underlying material this question tests, from the joined note sections. Define terms precisely and keep exam-focus.",
  SUMMARIZE:
    "MODE SUMMARIZE: compress the joined material into its key points, preserving every spec-point anchor; do not add material that is not in the evidence.",
  HINT:
    "MODE HINT: scaffolding only. Nudge the learner's approach — first steps, what to look at, which concept applies. NEVER state the final answer, never quote or reveal the mark scheme, and never work the whole question through.",
  CHECK:
    "MODE CHECK: the learner has attempted this question and describes what they answered. Give full feedback against the mark scheme: what their description gets right, what it misses, and the model answer summary. Cite the scheme parts.",
};

function questionLabel(q: ExamQuestion): string {
  const md = q.parts[0]?.problemMd ?? "";
  return (
    md
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("!["))[0]
      ?.slice(0, 220) ?? "this question"
  );
}

/** Fail-closed: unknown course/question → typed 404. */
export async function resolveQuestionContext(
  course: string,
  questionId: string,
): Promise<{
  context: ClaQuestionContextView;
  question: ExamQuestion;
  noteSegments: IndexedSegment[];
}> {
  const hub = await loadHubCourse(course);
  if (!hub) {
    throw new ClaError("context_not_found", `No course ${course} — the server resolves the context (fail-closed).`);
  }
  let topicSlug: string | null = null;
  let question: ExamQuestion | null = null;
  for (const t of hub.questionTopics) {
    const q = t.questions.find((x) => x.id === questionId);
    if (q) {
      question = q;
      topicSlug = t.slug;
      break;
    }
  }
  if (!question) {
    throw new ClaError(
      "context_not_found",
      `No exam question ${questionId} in course ${course} — the server resolves the context and refuses unknown refs (fail-closed).`,
    );
  }
  const codes = [...new Set(question.parts.flatMap((p) => p.specPointCodes))];
  const index = await getCorpusIndex();
  const noteSegments = index.segments
    .filter((s) => s.kind === "REVISION_NOTE" && s.specPointCode !== null && codes.includes(s.specPointCode))
    .slice(0, QUESTION_SEGMENT_CAP);
  const context: ClaQuestionContextView = {
    kind: "EXAM_QUESTION",
    course,
    questionId,
    topicSlug,
    label: questionLabel(question),
    specPointCodes: codes,
    attempted: false,
    url: topicSlug ? `/courses/${course}/exam-questions/${topicSlug}#q-${questionId}` : null,
  };
  return { context, question, noteSegments };
}

export async function claQuestionTurn(req: ClaQuestionTurnRequest): Promise<ClaTurnResult> {
  const started = Date.now();
  const { context, question, noteSegments } = await resolveQuestionContext(req.course, req.questionId);
  context.attempted = req.attempted;

  // the leakage gate — the demo twin of core's ClaLeakagePolicy: CHECK is
  // post-attempt feedback; without an attempt it 409s with guidance
  if (req.mode === "CHECK" && !req.attempted) {
    throw new ClaError(
      "attempt_required",
      "Attempt this question first, then CHECK unlocks full feedback — the answer-leakage gate keeps hints and checks from leaking the mark scheme.",
    );
  }

  const letter = (i: number) => `(${String.fromCharCode(97 + i)})`;
  const stemBlocks = question.parts.map((p, i) => ({
    label: `Question part ${letter(i)} — ${p.marks} mark${p.marks === 1 ? "" : "s"}`,
    ref: p.id,
    specPointCode: p.specPointCodes[0] ?? null,
    text: p.problemMd.slice(0, 700),
  }));
  const schemeBlocks =
    req.mode === "CHECK"
      ? question.parts
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => p.solutionMd)
          .map(({ p, i }) => ({
            label: `Mark scheme — part ${letter(i)}`,
            ref: p.id,
            specPointCode: p.specPointCodes[0] ?? null,
            text: (p.solutionMd ?? "").slice(0, 800),
          }))
      : [];

  // EXPLAIN/SUMMARIZE ground on the joined notes only; with none joined there
  // is nothing validated to teach from — refuse rather than improvise. HINT
  // and CHECK still work: the question's own parts / scheme are evidence.
  if ((req.mode === "EXPLAIN" || req.mode === "SUMMARIZE") && noteSegments.length === 0) {
    return {
      answer:
        `No revision notes are joined to this question's spec points${context.specPointCodes.length ? ` (${context.specPointCodes.join(", ")})` : ""}, so there is nothing validated to ${req.mode === "EXPLAIN" ? "explain" : "summarise"} from — refusing rather than improvising.\n\n` +
        `HINT works from the question itself, and CHECK unlocks full mark-scheme feedback once you've attempted it.`,
      mode: req.mode,
      context,
      citations: stemBlocks.map((b, i) => ({
        index: i + 1,
        label: b.label,
        kind: "QUESTION_PART" as const,
        ref: b.ref,
        specPointCode: b.specPointCode,
        url: context.url,
        score: 0,
      })),
      provider: resolveAiProvider().id,
      model: resolveAiProvider().model,
      refused: true,
      evidenceCount: 0,
      latencyMs: Date.now() - started,
    };
  }

  return groundedTurn({
    started,
    context,
    mode: req.mode,
    question: req.question,
    history: req.history,
    segments: noteSegments,
    extraBlocks: [...stemBlocks, ...schemeBlocks],
    scopeGate: false,
    systemPrompt: QUESTION_SYSTEM_PROMPT,
    modeBrief: QUESTION_MODE_BRIEF[req.mode],
    anchorLabel: `the exam question "${context.label.slice(0, 80)}"`,
    emptyEvidenceNote: "",
  });
}

// ── shared grounded completion (topic + question turns) ──────────────────

interface GroundedAsk {
  started: number;
  context: ClaContextView;
  mode: ClaMode;
  systemPrompt: string;
  modeBrief: string;
  question: string;
  history: AiMessage[];
  segments: IndexedSegment[];
  /** stem / mark-scheme blocks — cited as QUESTION_PART after the note sections */
  extraBlocks?: { label: string; ref: string; specPointCode: string | null; text: string }[];
  scopeGate: boolean;
  /** the anchored context, for refusal copy */
  anchorLabel: string;
  /** honest refusal when the context carries no evidence at all */
  emptyEvidenceNote: string;
}

async function groundedTurn(input: GroundedAsk): Promise<ClaTurnResult> {
  const { started, context, mode, question, history, segments, extraBlocks = [] } = input;
  const index = await getCorpusIndex();
  const provider = resolveAiProvider();

  const citations: TutorCitation[] = [
    ...segments.map((s, i) => ({
      index: i + 1,
      label: s.title,
      kind: "REVISION_NOTE" as const,
      ref: s.ref,
      specPointCode: s.specPointCode,
      url: s.url,
      score: 0,
    })),
    ...extraBlocks.map((b, i) => ({
      index: segments.length + i + 1,
      label: b.label,
      kind: "QUESTION_PART" as const,
      ref: b.ref,
      specPointCode: b.specPointCode,
      url: context.kind === "EXAM_QUESTION" ? context.url : null,
      score: 0,
    })),
  ];

  // lexical scope gate — free questions only; catches cross-topic asks honestly
  if (input.scopeGate) {
    const scores = segments.map((s) => segmentScore(index, s, question));
    const best = Math.max(...scores, 0);
    if (best < CLA_SCOPE_THRESHOLD) {
      return {
        answer:
          `The joined notes don't cover that — I'm refusing rather than guessing.\n\n` +
          `I can only answer from ${input.anchorLabel}${
            input.emptyEvidenceNote ? ` — ${input.emptyEvidenceNote}` : ""
          }. ` +
          `Try asking about the anchored material, or use the free Tutor tab — it searches the whole bundled corpus.`,
        mode,
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
  }

  const evidenceBlock = [
    ...segments.map(
      (s, i) =>
        `[${i + 1}] (note section${s.specPointCode ? ` · ${s.specPointCode}` : ""}) ${s.title}\n${s.text.slice(0, 900)}`,
    ),
    ...extraBlocks.map(
      (b, i) =>
        `[${segments.length + i + 1}] (question part${b.specPointCode ? ` · ${b.specPointCode}` : ""}) ${b.label}\n${b.text}`,
    ),
  ].join("\n\n");

  const messages: AiMessage[] = [
    { role: "system", content: `${input.systemPrompt}\n\n${input.modeBrief}` },
    ...history.slice(-6),
    {
      role: "user",
      content: `ANCHORED CONTEXT: ${input.anchorLabel}\n\nLEARNER QUESTION:\n${question}\n\nEVIDENCE (cite by number):\n${evidenceBlock}`,
    },
  ];

  try {
    const result = await provider.complete({ messages, temperature: 0.25, maxTokens: 900 });
    return {
      answer: result.text,
      mode,
      context,
      citations,
      provider: result.provider,
      model: result.model,
      refused: false,
      evidenceCount: segments.length + extraBlocks.length,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    return {
      answer:
        `The AI provider call failed (${e instanceof Error ? e.message.slice(0, 140) : "unknown"}), so here is the honest fallback: the evidence I grounded on is listed below. No answer was fabricated.`,
      mode,
      context,
      citations,
      // a provider that THREW did not answer — never credit it as if it had
      provider: "unavailable",
      model: null,
      refused: true,
      evidenceCount: segments.length + extraBlocks.length,
      latencyMs: Date.now() - started,
    };
  }
}
