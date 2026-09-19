import { notFound } from "next/navigation";
import { loadHubCourse } from "@/lib/courses";
import { collectPastPapers, findPastPaper, paperEstTime } from "@/lib/past-papers";
import { Breadcrumbs, ExamCodePill } from "@/components/hub/chrome";
import { ResourcePanel } from "@/components/hub/resource-panel";
import { Badge } from "@/components/ui/badge";
import { QuestionPlayer } from "@/app/courses/[course]/exam-questions/[topicSlug]/question-player";

export const dynamic = "force-dynamic";

/**
 * One past paper (Task 22) — a partial reconstruction built strictly from
 * questions whose parts attest this session + paper number (sourcePaper),
 * played back in original paper order. The reconstruction framing is shown
 * up front, next to the paper reference.
 */
export default async function PastPaperPage({
  params,
}: {
  params: Promise<{ course: string; paperKey: string }>;
}) {
  const { course: slug, paperKey } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();

  const paper = findPastPaper(collectPastPapers(hub.questionTopics), paperKey);
  if (!paper) notFound();

  const { meta } = hub;

  return (
    <div className="flex w-full">
      <ResourcePanel variant="questions" />
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-5">
        <Breadcrumbs
          items={[
            { label: meta.level, href: "/courses" },
            { label: meta.subject, href: `/courses/${meta.slug}` },
            { label: "Past Papers", href: `/courses/${meta.slug}/past-papers` },
            { label: paper.number },
          ]}
        />

        <header className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="max-w-2xl text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              {paper.number} — {paper.date}{" "}
              <span className="text-muted-foreground">
                (Edexcel {meta.level} {meta.subject}): Past Paper
              </span>
            </h1>
            <ExamCodePill code={meta.code} />
          </div>
          <p className="text-sm text-muted-foreground">
            {paper.questions.length} questions · {paper.totalMarks} marks ·{" "}
            {paperEstTime(paper.totalMarks)}
          </p>
          <Badge variant="secondary" className="font-medium">
            Reconstructed — {paper.questions.length} question
            {paper.questions.length === 1 ? "" : "s"} held from this paper, in paper order
          </Badge>
        </header>

        <QuestionPlayer
          course={meta.slug}
          topicName={`${paper.number} — ${paper.date}`}
          topicSlug={paper.key}
          subtopicCode={null}
          subtopicTitle={null}
          questions={paper.questions}
        />
        </div>
      </div>
    </div>
  );
}
