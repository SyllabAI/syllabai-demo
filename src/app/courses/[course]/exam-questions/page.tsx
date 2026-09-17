import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, FileQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { loadHubCourse } from "@/lib/courses";
import { CourseHeader } from "@/components/hub/course-header";
import { NumberedLabel } from "@/components/hub/chrome";

export const dynamic = "force-dynamic";

/**
 * Exam Questions bank index (SME pattern, research §6.1): question sets
 * grouped under their numbered topic, with count pills and a per-set link —
 * an exam-question analogue of the notes index, driven by the same tree.
 */
export default async function ExamQuestionsIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ course: string }>;
  searchParams: Promise<{ spec?: string }>;
}) {
  const { course: slug } = await params;
  const { spec } = await searchParams;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const { meta, stats } = hub;

  // legacy deep links used ?spec=4CH1-1.1 — jump straight to the set that
  // anchors that spec point when it has one canonical home
  const specSubtopic = spec ? hub.index.subtopicOfSpecPoint.get(spec) ?? null : null;
  const specSets = specSubtopic ? hub.setsBySubtopic[specSubtopic] ?? [] : [];
  if (spec && specSets.length > 0) {
    redirect(`/courses/${meta.slug}/exam-questions/${specSets[0]}`);
  }
  const base = `/courses/${meta.slug}`;

  const groups = hub.index.tree.topics
    .map((t) => ({
      topic: t,
      sets: hub.questionTopics.filter((set) => {
        // canonical home of the set is the sub-topic with the most anchored parts
        return hub.setsBySubtopic[
          t.subtopics.find((s) => hub.setsBySubtopic[s.code]?.includes(set.slug))?.code ?? ""
        ]?.includes(set.slug);
      }),
    }))
    .filter((g) => g.sets.length > 0);

  const unplaced = hub.questionTopics.filter(
    (set) => !groups.some((g) => g.sets.some((s) => s.slug === set.slug)),
  );

  const totalMarks = hub.questionTopics.reduce(
    (a, t) => a + t.questions.reduce((b, q) => b + q.totalMarks, 0),
    0,
  );

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <CourseHeader
        meta={meta}
        title={`Edexcel ${meta.level} ${meta.label} Exam Questions By Topic`}
        description={`Real exam-style questions organised by topic — ${stats.questions} questions across ${stats.questionSets} sets, with parts, command words, mark schemes and self-marking. Difficulty and timing metadata come straight from the corpus.`}
      />

      <div className="mt-6 space-y-5">
        {groups.map(({ topic, sets }) => (
          <section key={topic.code} aria-label={`Topic ${topic.number}: ${topic.title}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/25" aria-hidden />
              <h2 className="text-[15px] font-semibold">
                <NumberedLabel number={topic.number} title={topic.title} />
              </h2>
              <span className="text-xs text-muted-foreground">
                ·{" "}
                {topic.subtopics.reduce((a, s) => a + (hub.counts[s.code]?.questions ?? 0), 0)}{" "}
                questions
              </span>
            </div>
            <div className="ml-4 grid gap-2 border-l pl-3 sm:grid-cols-2">
              {sets.map((set) => {
                const marks = set.questions.reduce((b, q) => b + q.totalMarks, 0);
                const diffs = {
                  easy: set.questions.filter((q) => q.difficulty === "easy").length,
                  medium: set.questions.filter((q) => q.difficulty === "medium").length,
                  hard: set.questions.filter((q) => q.difficulty === "hard").length,
                };
                return (
                  <Link
                    key={set.slug}
                    href={`${base}/exam-questions/${set.slug}`}
                    className="group flex items-start gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                  >
                    <FileQuestion className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-snug group-hover:text-primary">
                        {set.name}
                        {set.setName ? ` — ${set.setName}` : ""}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">
                          {set.questions.length} questions
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {marks} marks
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          ≈ {marks} min
                        </Badge>
                        {(["easy", "medium", "hard"] as const)
                          .filter((d) => diffs[d] > 0)
                          .map((d) => (
                            <Badge key={d} variant="secondary" className="text-[10px] capitalize">
                              {diffs[d]} {d}
                            </Badge>
                          ))}
                      </span>
                      <span className="mt-1 block font-mono text-[10px] text-muted-foreground/70">
                        {set.topicId}
                      </span>
                    </span>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        {unplaced.length > 0 && (
          <section aria-label="Unplaced sets">
            <h2 className="mb-2 text-[15px] font-semibold">Other sets</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {unplaced.map((set) => (
                <Link
                  key={set.slug}
                  href={`${base}/exam-questions/${set.slug}`}
                  className="group flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                >
                  <FileQuestion className="size-4 text-primary" aria-hidden />
                  <span className="text-sm font-semibold group-hover:text-primary">{set.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{set.questions.length} questions</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {groups.length === 0 && unplaced.length === 0 && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No question sets imported for this course yet.
            </CardContent>
          </Card>
        )}

        {groups.length > 0 && (
          <p className="text-xs text-muted-foreground">
            ≈ {totalMarks} marks in total across the bank — the demo estimates ≈1 min per mark,
            a study heuristic, not exam board timing guidance.
          </p>
        )}
      </div>
    </div>
  );
}
