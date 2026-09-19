import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CircleHelp, ExternalLink, FileQuestion, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadHubCourse } from "@/lib/courses";
import { Markdown } from "@/components/markdown";
import { Breadcrumbs } from "@/components/hub/chrome";
import { ResourcePanel } from "@/components/hub/resource-panel";
import { NoteFootnote } from "./note-footnote";

export const dynamic = "force-dynamic";

/**
 * Note reader — SME page anatomy (research §5.3 + flow crawl fig. flow-04):
 * breadcrumb trail, two-tone title, exam-code pill, slim trust meta row
 * (exam board · updated · source) in place of the authorship block, guided-
 * study banner, standardised body, and the build-on-this-topic cross-links +
 * prev/next footer. The resource topic panel (SME's second column) mounts
 * left with the active note highlighted.
 */
export default async function NoteReaderPage({
  params,
}: {
  params: Promise<{ course: string; noteId: string }>;
}) {
  const { course: slug, noteId } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const note = hub.notes.find((n) => n.noteId === noteId);
  if (!note) notFound();

  const { meta } = hub;
  const subtopicCode = hub.noteSubtopic[note.noteId] ?? null;
  const subtopic = subtopicCode ? hub.index.subtopicByCode.get(subtopicCode) : null;
  const topic = subtopic ? hub.index.topicByCode.get(subtopic.topicCode) : null;
  const base = `/courses/${meta.slug}`;

  const index = hub.notes.findIndex((n) => n.noteId === note.noteId);
  const prev = hub.notes[index - 1];
  const next = hub.notes[index + 1];

  const anchorSpec = note.specPointCodes[0] ?? null;
  const askHref = `/tutor?q=${encodeURIComponent(
    `Explain "${note.title}" and what specification ${anchorSpec ?? ""} requires`,
  )}${anchorSpec ? `&spec=${encodeURIComponent(anchorSpec)}` : ""}`;

  // the corpus bodies often repeat the page title as a leading H1 (+ H2) —
  // drop those duplicates so the reader sees one title, like SME (one H1 +
  // content headings). Also strip raw spec-point IDs (spcpt_…) from the
  // visible body: anchor codes stay in the data layer, not the learner face.
  const title = note.title.trim().toLowerCase();
  let bodyMd = note.bodyMd.replace(/^\s*#\s+([^\n]+)\n?/, (m, t: string) =>
    t.trim().toLowerCase() === title ? "" : m,
  );
  bodyMd = bodyMd.replace(/^\s*##\s+([^\n]+)\n+/, (m, t: string) =>
    t.trim().toLowerCase() === title ? "" : m,
  );
  bodyMd = bodyMd.replace(/\s*`?spcpt_[A-Za-z0-9_-]+`?\s*·\s*/g, " ");

  return (
    <div className="flex w-full">
      <ResourcePanel variant="notes" />
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <article className="mx-auto max-w-3xl space-y-5">
          <Breadcrumbs
            items={[
              { label: meta.level, href: "/courses" },
              { label: meta.subject, href: base },
              { label: "Revision Notes", href: `${base}/revision-notes` },
              ...(topic ? [{ label: `${topic.number}. ${topic.title}` }] : []),
              { label: note.title },
            ]}
          />

          <header className="space-y-3">
            <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">
              {note.title}{" "}
              <span className="text-muted-foreground">
                (Edexcel {meta.level} {meta.subject})
              </span>
            </h1>
            {/* trust meta — the SyllabAI analogue of SME's authorship block */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              <span>
                Exam board <span className="font-medium text-foreground">Pearson Edexcel</span> ·{" "}
                {meta.level}
              </span>
              <span aria-hidden>·</span>
              <span>
                Updated <span className="font-medium text-foreground">{note.updatedAt.slice(0, 10)}</span>
              </span>
              {note.sourceUrl && (
                <a
                  href={note.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
                >
                  Source <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </div>
          </header>

          {/* guided study banner (SME anatomy) — anchors the grounded tutor */}
          {note.guidedStudy && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="size-4 text-primary" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Guided study available on this topic</p>
                <p className="text-xs text-muted-foreground">
                  Chat with the AI tutor about this topic — answers cite the corpus and say so
                  when evidence is thin.
                </p>
              </div>
              <Button asChild size="sm" className="gap-1.5">
                <a href={askHref}>Ask about this</a>
              </Button>
            </div>
          )}

          <Markdown>{bodyMd}</Markdown>

          <NoteFootnote course={meta.slug} noteId={note.noteId} subtopic={subtopicCode} />

          {/* build on this topic (SME cross-links) */}
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-sm font-semibold">Build on this topic</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Link
                  href={subtopicCode ? hub.hrefs.questions[subtopicCode] ?? `${base}/exam-questions` : `${base}/exam-questions`}
                  className="group flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors hover:border-primary/40"
                >
                  <FileQuestion className="size-4 text-primary" aria-hidden />
                  <span className="text-[13px] font-medium">
                    Exam Questions
                    {subtopic ? <span className="block text-xs font-normal text-muted-foreground">{subtopic.title}</span> : null}
                  </span>
                  <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
                <Link
                  href={subtopicCode ? hub.hrefs.flashcards[subtopicCode] ?? `${base}/flashcards` : `${base}/flashcards`}
                  className="group flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors hover:border-primary/40"
                >
                  <CircleHelp className="size-4 text-primary" aria-hidden />
                  <span className="text-[13px] font-medium">
                    Flashcards
                    {subtopic ? <span className="block text-xs font-normal text-muted-foreground">{subtopic.title}</span> : null}
                  </span>
                  <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </div>
            </CardContent>
          </Card>

          <nav className="flex items-center justify-between border-t pt-4" aria-label="Note pagination">
            {prev ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`${base}/revision-notes/${prev.noteId}`}>
                  <ArrowLeft className="size-4" aria-hidden /> {prev.title.slice(0, 24)}
                </Link>
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`${base}/revision-notes/${next.noteId}`}>
                  {next.title.slice(0, 24)} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <span />
            )}
          </nav>
        </article>
      </div>
    </div>
  );
}
