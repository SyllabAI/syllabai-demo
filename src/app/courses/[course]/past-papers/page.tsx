import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ScrollText } from "lucide-react";
import { loadHubCourse } from "@/lib/courses";
import { collectPastPapers, paperEstTime } from "@/lib/past-papers";
import { CourseHeader } from "@/components/hub/course-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Past Papers index (Task 22) — the real-provenance archive. Papers exist
 * ONLY where the corpus attests them (sourcePaper on question parts), and
 * every paper is labelled a partial reconstruction. Courses without
 * provenance get an honest empty state pointing at the question banks and
 * the deterministic practice papers.
 */
export default async function PastPapersPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();

  const { meta } = hub;
  const base = `/courses/${meta.slug}`;
  const papers = collectPastPapers(hub.questionTopics);
  const heldQuestions = papers.reduce((a, p) => a + p.questions.length, 0);

  // group by session label for a browsable archive (SME past-paper style)
  const bySession = new Map<string, typeof papers>();
  for (const p of papers) {
    const session = p.date;
    bySession.set(session, [...(bySession.get(session) ?? []), p]);
  }
  const sessions = [...bySession.entries()];

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <CourseHeader
        meta={meta}
        title={`Edexcel ${meta.level} ${meta.label} Past Papers`}
        crumb="Past Papers"
        description="Every question we hold from real Edexcel past papers, grouped by session and played back in original paper order — partial reconstructions, not the full official papers."
      >
        {papers.length > 0 && (
          <Badge variant="secondary" className="font-medium">
            {papers.length} papers · {heldQuestions} questions held
          </Badge>
        )}
      </CourseHeader>

      {papers.length === 0 ? (
        <Card className="border-dashed mt-6">
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ScrollText className="size-4 text-primary" aria-hidden />
              No past-paper provenance for this course yet.
            </p>
            <p className="text-sm text-muted-foreground">
              The questions in this bundle don&apos;t carry source-paper references. You can still
              practise by topic, or try the assembled practice papers — same questions, honest
              framing.
            </p>
            <div className="flex flex-wrap gap-2 text-sm font-semibold text-primary">
              <Link href={`${base}/exam-questions`} className="hover:underline">
                Browse topic questions →
              </Link>
              <Link href={`${base}/practice-papers`} className="hover:underline">
                Practice Papers →
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          {sessions.map(([session, group]) => (
            <section key={session} aria-label={session} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {session}
              </h2>
              <ul className="overflow-hidden rounded-xl border">
                {group.map((p, i) => (
                  <li key={p.key} className={i > 0 ? "border-t" : undefined}>
                    <Link
                      href={`${base}/past-papers/${p.key}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-sm font-semibold">{p.number}</span>
                        <span className="block text-xs text-muted-foreground">
                          {p.questions.length} question{p.questions.length === 1 ? "" : "s"} ·{" "}
                          {p.totalMarks} marks · {paperEstTime(p.totalMarks)}
                        </span>
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground/60"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
