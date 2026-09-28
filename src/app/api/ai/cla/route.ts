import { NextRequest } from "next/server";
import { z } from "zod";
import { CLA_MODES, ClaError, claTurn, claTopicTurn, claQuestionTurn } from "@/lib/cla";
import { getProviderPool } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

const History = z
  .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
  .max(12)
  .default([]);

/** note context — the note reader's CLA island (kind omitted ⇒ "note" for back-compat) */
const NoteBody = z.object({
  kind: z.literal("note").default("note"),
  course: z.string().min(1).max(80),
  noteId: z.string().min(1).max(80),
  mode: z.enum(["EXPLAIN", "SUMMARIZE"]),
  question: z.string().min(1).max(600),
  history: History,
  isQuickAction: z.boolean().default(false),
});

/** topic context — the standalone assistant tab (demo twin of KG_TOPIC) */
const TopicBody = z.object({
  kind: z.literal("topic"),
  course: z.string().min(1).max(80),
  topicCode: z.string().min(1).max(40),
  mode: z.enum(["EXPLAIN", "SUMMARIZE"]),
  question: z.string().min(1).max(600),
  history: History,
});

/** question context — HINT/CHECK live here; CHECK is attempt-gated (409) */
const QuestionBody = z.object({
  kind: z.literal("question"),
  course: z.string().min(1).max(80),
  questionId: z.string().min(1).max(80),
  mode: z.enum(CLA_MODES),
  question: z.string().min(1).max(600),
  history: History,
  attempted: z.boolean().default(false),
});

const Body = z.discriminatedUnion("kind", [NoteBody, TopicBody, QuestionBody]);

/**
 * POST /api/ai/cla — the explicitly-anchored CLA ask.
 *
 * Deliberately SYNCHRONOUS JSON (not SSE): the production contract is
 * `POST /api/v1/learners/me/cla/ask` → ClaAnswerView, so the demo mirrors
 * the production shape — answer, citations, the server-resolved context,
 * evidenceCount, provider, refused, latencyMs. The free Tutor keeps the
 * SSE experiment (/api/ai/chat); the two surfaces stay honest to their
 * different production behaviors.
 *
 * Context kinds (all resolved fail-closed server-side):
 *   note (default)     course + noteId       — the note reader's CLA island
 *   topic              course + topicCode    — the standalone assistant tab
 *   question           course + questionId   — HINT/CHECK; CHECK is
 *                       attempt-gated and 409s with guidance otherwise
 *
 * Fail-closed mapping: unknown course/note/topic/question → 404
 * context_not_found; HINT/CHECK on a note or topic context → 400
 * mode_not_valid_for_context; CHECK without an attempt → 409
 * attempt_required (the answer-leakage gate — the product working as
 * designed, rendered as guidance, never as error noise).
 */
export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Body>;
  try {
    const raw = (await req.json()) as Record<string, unknown>;
    if (raw && typeof raw === "object" && raw.kind === undefined) raw.kind = "note";
    parsed = Body.parse(raw);
  } catch (e) {
    return Response.json(
      { error: "invalid_body", detail: e instanceof Error ? e.message : "bad request" },
      { status: 400 },
    );
  }

  try {
    if (parsed.kind === "note") {
      // question-context modes are rejected at the boundary (and again inside
      // claTurn for direct lib callers — defense in depth)
      if (parsed.mode !== "EXPLAIN" && parsed.mode !== "SUMMARIZE") {
        return Response.json(
          {
            error: "mode_not_valid_for_context",
            detail:
              "HINT and CHECK are question-context modes (attempt-gated in production). This note context accepts EXPLAIN and SUMMARIZE only.",
          },
          { status: 400 },
        );
      }
      const result = await claTurn({
        course: parsed.course,
        noteId: parsed.noteId,
        mode: parsed.mode,
        question: parsed.question,
        history: parsed.history.map((h) => ({ role: h.role, content: h.content })),
        isQuickAction: parsed.isQuickAction,
      });
      return Response.json(result);
    }
    if (parsed.kind === "topic") {
      const result = await claTopicTurn({
        course: parsed.course,
        topicCode: parsed.topicCode,
        mode: parsed.mode,
        question: parsed.question,
        history: parsed.history.map((h) => ({ role: h.role, content: h.content })),
      });
      return Response.json(result);
    }
    const result = await claQuestionTurn({
      course: parsed.course,
      questionId: parsed.questionId,
      mode: parsed.mode,
      question: parsed.question,
      history: parsed.history.map((h) => ({ role: h.role, content: h.content })),
      attempted: parsed.attempted,
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof ClaError) {
      const status =
        e.code === "context_not_found"
          ? 404
          : e.code === "attempt_required"
            ? 409
            : 400;
      return Response.json({ error: e.code, detail: e.message }, { status });
    }
    return Response.json(
      { error: "cla_failed", detail: e instanceof Error ? e.message.slice(0, 200) : "unknown" },
      { status: 500 },
    );
  }
}

/** GET — provider transparency for the UI footer (mock never counts as configured). */
export async function GET() {
  const pool = getProviderPool().filter((p) => p.id !== "mock");
  return Response.json({ available: pool.length > 0, providers: pool.map((p) => p.id) });
}
