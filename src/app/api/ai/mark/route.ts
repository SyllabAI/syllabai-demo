import { NextRequest } from "next/server";
import { z } from "zod";
import { getProviderPool } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ai/mark — SME-style "Mark my answer" for structured questions.
 *
 * The learner types an answer into the question workspace; the server-side
 * provider marks it strictly against the corpus mark scheme and returns a
 * suggested score plus per-point feedback. The suggestion is AI_SUGGESTED:
 * the client labels it as such and only writes it to the SIMULATED progress
 * overlay when the learner explicitly applies it.
 *
 * GET returns { available } so the player can hide the AI affordance when no
 * real provider is configured (keys never reach the client, §11/§20).
 */

const Body = z.object({
  problemMd: z.string().min(1).max(6000),
  solutionMd: z.string().min(1).max(6000),
  marks: z.number().int().min(1).max(20),
  answer: z.string().min(1).max(4000),
});

export async function GET() {
  const pool = getProviderPool().filter((p) => p.id !== "mock");
  return Response.json({ available: pool.length > 0 });
}

interface MarkResult {
  score: number;
  points: { point: string; achieved: "yes" | "no" | "unclear"; comment: string }[];
  overall: string;
}

function extractJson(text: string): MarkResult | null {
  // tolerant extraction: first { … last } (models occasionally fence or pad)
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const score = Number(raw.score);
    const overall = typeof raw.overall === "string" ? raw.overall : "";
    const pointsRaw = Array.isArray(raw.points) ? raw.points : [];
    const points = pointsRaw
      .map((p) => p as Record<string, unknown>)
      .filter((p) => typeof p.point === "string")
      .map((p) => ({
        point: String(p.point),
        achieved:
          p.achieved === "yes" || p.achieved === "no" || p.achieved === "unclear"
            ? (p.achieved as "yes" | "no" | "unclear")
            : ("unclear" as const),
        comment: typeof p.comment === "string" ? p.comment : "",
      }));
    if (!Number.isFinite(score) || points.length === 0) return null;
    return { score: Math.round(score), points, overall };
  } catch {
    return null;
  }
}

function buildPrompt(problemMd: string, solutionMd: string, marks: number, answer: string) {
  return `You are an experienced exam marker for Pearson Edexcel exam questions. Mark the student's typed answer strictly against the mark scheme.

QUESTION:
${problemMd}

MARK SCHEME (marking points are AND-joined; question is worth ${marks} mark${marks === 1 ? "" : "s"}):
${solutionMd}

STUDENT ANSWER:
${answer}

Marking rules:
1. Award marks ONLY where the mark scheme supports it. Do not invent extra marking points.
2. Judge each marking point separately: "yes" (clearly met), "no" (not met), or "unclear" (partially or ambiguous).
3. The score is the number of clearly-met points, capped at ${marks}. When in doubt between two scores, be conservative.
4. Be fair to differently-worded but scientifically equivalent answers.
5. Give encouraging, specific feedback about what earned marks and exactly what was missing.

Respond with ONLY a JSON object (no markdown fences, no prose):
{"score": <integer 0..${marks}>, "points": [{"point": "<mark scheme point (short)>", "achieved": "yes"|"no"|"unclear", "comment": "<one short sentence>"}], "overall": "<2-3 sentences of marker feedback>"}`;
}

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return Response.json(
      { ok: false, error: "invalid_body", detail: e instanceof Error ? e.message : "bad request" },
      { status: 400 },
    );
  }

  const pool = getProviderPool();
  const provider = pool.find((p) => p.id !== "mock");
  if (!provider) {
    return Response.json(
      { ok: false, error: "no_ai_provider", detail: "No AI provider key is configured on the server." },
      { status: 503 },
    );
  }

  try {
    const result = await provider.complete({
      messages: [
        {
          role: "user",
          content: buildPrompt(parsed.problemMd, parsed.solutionMd, parsed.marks, parsed.answer),
        },
      ],
      temperature: 0.1,
      maxTokens: 1200,
    });
    const marked = extractJson(result.text);
    if (!marked) {
      return Response.json(
        { ok: false, error: "unparseable_marking", detail: "The marker model did not return valid JSON." },
        { status: 502 },
      );
    }
    return Response.json({
      ok: true,
      score: Math.max(0, Math.min(parsed.marks, marked.score)),
      max: parsed.marks,
      points: marked.points,
      overall: marked.overall,
      provider: result.provider,
      model: result.model,
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: "provider_error",
        detail: e instanceof Error ? e.message.slice(0, 200) : "unknown provider failure",
      },
      { status: 502 },
    );
  }
}
