import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadHubCourse } from "@/lib/courses";
import { CourseHeader } from "@/components/hub/course-header";
import { Breadcrumbs, ExamCodePill } from "@/components/hub/chrome";
import { QuestionPlayer } from "./question-player";

export const dynamic = "force-dynamic";

/**
 * Question set page (SME, research §6.2): title pattern
 * "{Sub-topic} (Edexcel {level} {subject}): Exam Questions", exam-code pill,
 * meta line (questions · marks · est. time), then the player.
 */
export default async function QuestionSetPage({
  params,
}: {
  params: Promise<{ course: string; topicSlug: string }>;
}) {
  const { course: slug, topicSlug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const topic = hub.questionTopics.find((t) => t.slug === topicSlug);
  if (!topic) notFound();

  const { meta } = hub;
  const subtopicCode = Object.entries(hub.setsBySubtopic).find(([, slugs]) =>
    slugs.includes(topic.slug),
  )?.[0] ?? null;
  const subtopic = subtopicCode ? hub.index.subtopicByCode.get(subtopicCode) : null;

  const totalMarks = topic.questions.reduce((a, q) => a + q.totalMarks, 0);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <Breadcrumbs
          items={[
            { label: meta.level, href: "/courses" },
            { label: meta.subject, href: `/courses/${meta.slug}` },
            { label: "Exam Questions", href: `/courses/${meta.slug}/exam-questions` },
            { label: topic.name },
          ]}
        />
        <header className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="max-w-2xl text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              {topic.name}
              {topic.setName ? ` — ${topic.setName}` : ""}{" "}
              <span className="text-muted-foreground">
                (Edexcel {meta.level} {meta.subject}): Exam Questions
              </span>
            </h1>
            <ExamCodePill code={meta.code} />
          </div>
          <p className="text-sm text-muted-foreground">
            {topic.questions.length} questions · {totalMarks} marks · ≈ {totalMarks} min
            (demo estimate at 1 min/mark)
            {topic.schema ? (
              <>
                {" "}
                · schema <span className="font-mono text-xs">{topic.schema}</span>
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="ghost" className="gap-1.5 text-xs">
              <Link href={`/courses/${meta.slug}/exam-questions`}>
                <ArrowLeft className="size-3.5" aria-hidden /> All question sets
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Source: {topic.source.provider} · {topic.source.license}
            </p>
          </div>
        </header>

        <QuestionPlayer
          course={meta.slug}
          topicName={topic.name}
          topicSlug={topic.slug}
          subtopicCode={subtopicCode}
          subtopicTitle={subtopic?.title ?? null}
          questions={topic.questions}
        />
      </div>
    </div>
  );
}
