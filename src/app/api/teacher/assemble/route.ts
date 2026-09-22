import { NextResponse } from "next/server";
import { z } from "zod";
import { getCourseBundle } from "@/lib/courses";
import { buildSpecTreeIndex, subtopicOfQuestionSet } from "@/lib/spec-tree";
import { assembleTest } from "@/lib/teacher/test-assembly";

/**
 * POST /api/teacher/assemble
 *   { slug, subtopics: string[] (subtopic CODES), targetMarks?, maxQuestions? }
 *
 * Marks-aware deterministic test assembly from the committed question bank
 * (TEACHER-2 Test Builder). Subtopic codes are resolved to their anchored
 * question sets with the same subtopicOfQuestionSet mapping the student hub
 * uses, so teacher and student surfaces can never disagree about where a
 * question set lives. Assembly rules mirror the production TestBuilder P9:
 * greedy fill without exceeding the target, exact-fill then smallest
 * overshoot; max questions is ignored when a marks target is set.
 */
export const dynamic = "force-dynamic";

const Body = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  subtopics: z.array(z.string().min(1)).min(1).max(60),
  targetMarks: z.number().int().min(0).max(300).nullable().optional(),
  maxQuestions: z.number().int().min(1).max(50).nullable().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { slug, subtopics, targetMarks, maxQuestions } = parsed.data;
  const bundle = await getCourseBundle(slug);
  if (!bundle) {
    return NextResponse.json({ error: "no bundle for course" }, { status: 404 });
  }

  // subtopic codes → anchored question-set slugs
  const index = buildSpecTreeIndex(bundle.curriculum);
  const wanted = new Set(subtopics);
  const setSlugs = new Set<string>();
  for (const t of bundle.questionTopics) {
    const code = subtopicOfQuestionSet(t, index);
    if (code && wanted.has(code)) setSlugs.add(t.slug);
  }
  if (setSlugs.size === 0) {
    return NextResponse.json(
      { error: "none of the selected subtopics have questions" },
      { status: 422 },
    );
  }

  const test = assembleTest(bundle, setSlugs, {
    targetMarks: targetMarks ?? null,
    maxQuestions: maxQuestions ?? null,
  });

  return NextResponse.json({ test }, { headers: { "cache-control": "no-store" } });
}
