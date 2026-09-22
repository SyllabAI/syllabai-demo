import { NextResponse } from "next/server";
import { getCourseBundle, listCourses } from "@/lib/courses";
import { buildClassOverview } from "@/lib/teacher/class-sim";

/**
 * GET /api/teacher/course-data?slug=<course>
 *
 * One payload for the two teacher lens surfaces (TEACHER-2):
 *   - `bank`: subtopic question-bank stats for the Test Builder tree;
 *   - `class`: the SAMPLE cohort aggregate for the Class knowledge graph
 *     (see src/lib/teacher/class-sim.ts for the evidence semantics).
 * Data comes from the committed course bundles — no invented content.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug") ?? "";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  const bundle = await getCourseBundle(slug);
  if (!bundle) {
    return NextResponse.json({ error: "no bundle for course" }, { status: 404 });
  }

  const overview = buildClassOverview(bundle);

  const bank = {
    totalQuestions: bundle.questionTopics.reduce((a, t) => a + t.questions.length, 0),
    totalMarks: bundle.questionTopics.reduce(
      (a, t) => a + t.questions.reduce((x, q) => x + q.totalMarks, 0),
      0,
    ),
  };

  const courses = await listCourses();
  const switchable = courses
    .filter((c) => c.hasBundle)
    .map((c) => ({ slug: c.slug, label: c.label, code: c.code, level: c.level }));

  return NextResponse.json(
    { class: overview, bank, switchable },
    { headers: { "cache-control": "no-store" } },
  );
}
