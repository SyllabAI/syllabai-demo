import { NextRequest } from "next/server";
import { z } from "zod";
import { tutorTurn, getCorpusIndex } from "@/lib/tutor";
import { retrieve } from "@/lib/ai/retrieval";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  question: z.string().min(1).max(600),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(12)
    .default([]),
});

/**
 * POST /api/ai/chat — the ONLY AI entry point the browser may use.
 * Provider calls happen server-side behind the AIProvider abstraction; no
 * provider key or endpoint is ever exposed to the client (brief §11/§20).
 *
 * Response: text/event-stream with `citations`, `meta`, `delta`, `done` events.
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        // 1) evidence preflight — citations stream before generation starts
        const index = await getCorpusIndex();
        const pre = retrieve(index, parsed.question);
        send("citations", { citations: pre.citations, sufficient: pre.sufficient });

        // 2) grounded generation (or honest refusal)
        const turn = await tutorTurn({
          question: parsed.question,
          history: parsed.history.map((h) => ({ role: h.role, content: h.content })),
        });
        send("meta", {
          provider: turn.provider,
          model: turn.model,
          refused: turn.refused,
          evidenceCount: turn.evidenceCount,
        });

        // 3) stream the answer in small chunks (uniform UX across providers)
        const chunks = turn.answer.match(/[\s\S]{1,48}/g) ?? [];
        for (const c of chunks) {
          send("delta", { text: c });
          await new Promise((r) => setTimeout(r, 12));
        }
        send("done", { ok: true });
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
