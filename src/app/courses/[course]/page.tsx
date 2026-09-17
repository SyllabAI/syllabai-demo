import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  FileText,
  FileQuestion,
  GraduationCap,
  ScrollText,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadHubCourse } from "@/lib/courses";
import { publicConfig } from "@/lib/config";
import { CourseHeader } from "@/components/hub/course-header";
import { FrameworkTags } from "@/components/hub/chrome";

export const dynamic = "force-dynamic";

/**
 * The per-subject Learning Hub (SME "Course Resources", research §4):
 * header block + specification card + resource cards in the two bands
 * (Revision / Exam Practice), each gated by what the corpus actually has.
 */
export default async function CourseHubPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const cfg = publicConfig();
  const { meta, stats } = hub;
  const base = `/courses/${meta.slug}`;
  const qual = `Edexcel ${meta.level} ${meta.subject}`;

  const resources = [
    {
      href: `${base}/revision-notes`,
      icon: BookOpen,
      title: "Revision Notes",
      desc: "Topic-anchored revision notes mapped to the official specification points.",
      count: stats.notes,
      countLabel: `${stats.notes} note${stats.notes === 1 ? "" : "s"}`,
      ready: stats.notes > 0,
    },
    {
      href: `${base}/exam-questions`,
      icon: FileQuestion,
      title: "Exam Questions",
      desc: "Exam-style questions by topic with mark schemes and self-marking.",
      count: stats.questions,
      countLabel: `${stats.questions} question${stats.questions === 1 ? "" : "s"} · ${stats.questionSets} set${stats.questionSets === 1 ? "" : "s"}`,
      ready: stats.questions > 0,
    },
    {
      href: `${base}/flashcards`,
      icon: CircleHelp,
      title: "Flashcards",
      desc: "Per-sub-topic recall decks generated from the note corpus (demo-derived).",
      count: stats.flashcards,
      countLabel: `${stats.flashcards} card${stats.flashcards === 1 ? "" : "s"}`,
      ready: stats.flashcards > 0,
    },
    {
      href: "#",
      icon: Target,
      title: "Target Test",
      desc: "Adaptive practice targeting your weakest topics — Phase C of the build plan.",
      count: 0,
      countLabel: "roadmap",
      ready: false,
    },
    {
      href: "#",
      icon: ScrollText,
      title: "Past Papers",
      desc: "Full past papers with mark schemes — not part of the pilot corpus yet.",
      count: 0,
      countLabel: "roadmap",
      ready: false,
    },
  ];

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <CourseHeader
        meta={meta}
        activeTab="resources"
        title={`${qual} Revision`}
        description={`Tools designed specifically for the ${qual} syllabus (${meta.code}): revision notes, exam-style questions and flashcards organised around the official specification tree — with provenance kept visible on every item.`}
      />

      {!hub.viaProvider && stats.notes + stats.questions === 0 ? (
        <Card className="mt-8">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="size-4 text-primary" aria-hidden />
              Content status: import pending
            </CardTitle>
            <CardDescription>
              This course is registered in the demo corpus (downloaded in{" "}
              <span className="font-mono text-xs">syllabai-resources</span>) but has no committed
              content bundle in this repository yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="leading-relaxed text-muted-foreground">
              The Learning Hub IA is live: when an import lands under{" "}
              <span className="font-mono text-xs">content/{meta.slug}/</span>, the topic tree,
              notes reader, question player and flashcard decks activate for this course with no
              further code changes. Nothing is simulated here — a hub with no corpus stays
              honestly empty.
            </p>
            <p>
              Explore the fully-loaded pilot course instead:{" "}
              <Link
                href="/courses/igcse-chemistry"
                className="font-medium text-primary underline underline-offset-2"
              >
                Edexcel IGCSE Chemistry (4CH1)
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* specification card (SME: spec download; SyllabAI: parsed spec deep-link) */}
          <Card className="mt-6">
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <div className="flex items-center gap-3">
                <FileText className="size-5 text-primary" aria-hidden />
                <div>
                  <p className="text-sm font-semibold">Specification {meta.code}</p>
                  <p className="text-xs text-muted-foreground">
                    Parsed specification points — the canonical tree powering this hub
                  </p>
                </div>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {stats.specPoints} spec points
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px]">
                  data: {cfg.dataMode}
                </Badge>
                <Link
                  href="/knowledge-graph"
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  View parsed spec <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* resource cards */}
          <section aria-label="Course resources" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((r) => {
              const inner = (
                <Card
                  className={
                    r.ready
                      ? "h-full transition-colors hover:border-primary/40"
                      : "h-full opacity-75"
                  }
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <r.icon className="size-4 text-primary" aria-hidden />
                      {r.title}
                      <ArrowRight
                        className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </CardTitle>
                    <CardDescription className="pt-1">
                      <FrameworkTags tags={["Edexcel", meta.level, meta.code]} />
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <CardDescription className="leading-relaxed">{r.desc}</CardDescription>
                    <p className="text-xs">
                      {r.ready ? (
                        <span className="font-medium text-foreground">{r.countLabel}</span>
                      ) : (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {r.countLabel}
                        </span>
                      )}
                    </p>
                  </CardContent>
                </Card>
              );
              return r.ready ? (
                <Link key={r.title} href={r.href} className="group focus-visible:outline-none">
                  {inner}
                </Link>
              ) : (
                <div key={r.title} aria-disabled title="Not part of the demo corpus yet">
                  {inner}
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
