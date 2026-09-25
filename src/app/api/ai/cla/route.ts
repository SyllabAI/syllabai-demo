import { NextRequest } from "next/server";
import { z } from "zod";
import { CLA_MODES, ClaError, claTurn } from "@/lib/cla";
import { getProviderPool } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  course: z.string().min(1).max(80),
  noteId: z.string().min(1).max(80),
  mode: z.enum(CLA_MODES),
  question: z.string().min(1).max(600),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(12)
    .default([]),
  isQuickAction: z.boolean().default(false),
});

/**
 * POST /api/ai/cla — the note-anchored CLA ask.
 *
 * Deliberately SYNCHRONOUS JSON (not SSE): the production contract is
 * `POST /api/v1/learners/me/cla/ask` → ClaAnswerView, so the demo mirrors
 * the production shape — answer, citations, the server-resolved context,
 * evidenceCount, provider, refused, latencyMs. The free Tutor keeps the
 * SSE experiment (/api/ai/chat); the two surfaces stay honest to their
 * different production behaviors.
 *
 * Fail-closed mapping: unknown course/note → 404 context_not_found;
 * HINT/CHECK on a note context → 400 mode_not_valid_for_context (they are
 * question-context modes, attempt-gated in production — the exam-question
 * CLA surface arrives later, and the boundary is enforced here in code).
 */
export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return Response.json(
      { error: "invalid_body", detail: e instanceof Error ? e.message : "bad request" },
      { status: 400 },
    );
  }

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

  try {
    const result = await claTurn({
      course: parsed.course,
      noteId: parsed.noteId,
      mode: parsed.mode,
      question: parsed.question,
      history: parsed.history.map((h) => ({ role: h.role, content: h.content })),
      isQuickAction: parsed.isQuickAction,
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof ClaError) {
      const status = e.code === "context_not_found" ? 404 : 400;
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
