import { NextResponse } from "next/server";
import { getCourseBundle } from "@/lib/courses";
import { buildSpecTreeIndex, subtopicOfQuestionSet } from "@/lib/spec-tree";

/**
 * GET /api/teacher/validation-queue?slug=<course>
 *
 * The Phase 2 AI-content validation queue (TEACHER_MODE_PLAN §5): the pilot
 * pipeline marks AI-authored model solutions for teacher validation before
 * they count toward mastery. This endpoint surfaces REAL corpus items that
 * carry an AI-authored solution (problemMd authored against the spec,
 * solutionMd = model answer) for the selected course, deterministically and
 * spread across subtopics — the teacher approves / edits / rejects each one
 * (ContentReview, plan §4). Nothing is invented: the excerpts come from the
 * committed bundle; only the "needs review" workflow is the demo step.
 */
export const dynamic = "force-dynamic";

const QUEUE_LIMIT = 10;

function excerpt(md: string, max: number): string {
  const flat = md.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

interface QueueItem {
  resourceId: string;
  kind: "solution";
  courseId: string;
  courseLabel: string;
  courseCode: string;
  topicSlug: string;
  topicName: string;
  subCode: string;
  subTitle: string;
  href: string;
  part: {
    resourceId: string;
    questionId: string;
    partId: string;
    commandWord: string | null;
    questionType: string | null;
    marks: number;
    problemExcerpt: string;
    solutionExcerpt: string;
  };
}

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

  const index = buildSpecTreeIndex(bundle.curriculum);

  // round-robin across question sets so the queue spans subtopics, not just
  // the first set — deterministic (corpus order), no randomness
  const perSet: {
    topicSlug: string;
    topicName: string;
    subCode: string;
    subTitle: string;
    items: QueueItem["part"][];
  }[] = [];

  for (const topic of bundle.questionTopics) {
    const code = subtopicOfQuestionSet(topic, index);
    const sub = code ? index.subtopicByCode.get(code) : undefined;
    const items: QueueItem["part"][] = [];
    for (const q of topic.questions) {
      for (const p of q.parts) {
        if (!p.solutionMd) continue;
        items.push({
          resourceId: `${slug}/${topic.slug}/${q.id}/${p.id}`,
          questionId: q.id,
          partId: p.id,
          commandWord: p.commandWord,
          questionType: p.questionType,
          marks: p.marks,
          problemExcerpt: excerpt(p.problemMd, 200),
          solutionExcerpt: excerpt(p.solutionMd, 260),
        });
      }
    }
    if (items.length > 0) {
      perSet.push({
        topicSlug: topic.slug,
        topicName: topic.name,
        subCode: sub?.code ?? "—",
        subTitle: sub?.title ?? topic.name,
        items,
      });
    }
  }

  // round-robin pick: one part per set per pass, corpus order preserved
  const picked: QueueItem[] = [];

  let pass = 0;
  while (picked.length < QUEUE_LIMIT) {
    let advanced = false;
    for (const set of perSet) {
      if (picked.length >= QUEUE_LIMIT) break;
      const item = set.items[pass];
      if (item) {
        advanced = true;
        picked.push({
          resourceId: item.resourceId,
          kind: "solution",
          courseId: bundle.meta.slug,
          courseLabel: bundle.meta.label,
          courseCode: bundle.meta.code,
          topicSlug: set.topicSlug,
          topicName: set.topicName,
          subCode: set.subCode,
          subTitle: set.subTitle,
          href: `/courses/${slug}/exam-questions/${set.topicSlug}`,
          part: item,
        });
      }
    }
    if (!advanced) break;
    pass += 1;
  }

  return NextResponse.json(
    {
      course: { slug: bundle.meta.slug, label: bundle.meta.label, code: bundle.meta.code },
      items: picked,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
