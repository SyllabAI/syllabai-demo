import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, CircleHelp, ExternalLink, FileQuestion, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadHubCourse } from "@/lib/courses";
import { Markdown } from "@/components/markdown";
import { SpecChip } from "@/components/provenance";
import { Breadcrumbs } from "@/components/hub/chrome";
import { NoteFootnote } from "./note-footnote";

export const dynamic = "force-dynamic";

/**
 * Note reader — SME page anatomy ported (research §5.3, figure 4): title
 * with the qualification in parentheses, exam-code context, provenance block
 * in place of the authorship block, guided-study banner with an Ask-about-
 * this anchor, standardised body, and the three-part footer (helpfulness
 * vote, build-on-this-topic cross-links, prev/next).
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

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
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
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <BookOpen className="size-3.5" aria-hidden /> Revision Note
          </p>
          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">
            {note.title}{" "}
            <span className="text-muted-foreground">
              (Edexcel {meta.level} {meta.subject})
            </span>
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {note.specPointCodes.map((c) => (
              <Link key={c} href={`${base}/exam-questions?subtopic=${subtopicCode ?? ""}`}>
                <SpecChip code={c} />
              </Link>
            ))}
            <Badge variant="outline" className="font-mono text-[10px]">
              {note.noteId}
            </Badge>
          </div>
        </header>

        {/* provenance block — the SyllabAI analogue of SME's authorship block */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-[13px]">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Corpus</p>
              <p className="font-medium">SaveMyExams (pilot-licensed, SME attestation)</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Exam board</p>
              <p className="font-medium">Pearson Edexcel · {meta.level}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Updated</p>
              <p className="font-medium">{note.updatedAt.slice(0, 10)}</p>
            </div>
            {note.sourceUrl && (
              <a
                href={note.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-[13px] text-primary underline underline-offset-2"
              >
                source <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </CardContent>
        </Card>

        {/* guided study banner (SME anatomy) — anchors the grounded tutor */}
        {note.guidedStudy && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Guided study available on this topic</p>
              <p className="text-xs text-muted-foreground">
                Understand this topic with a grounded AI tutor — answers cite the bundled corpus
                and refuse when evidence is thin.
              </p>
            </div>
            <Button asChild size="sm" className="gap-1.5">
              <a href={askHref}>
                <Sparkles className="size-3.5" aria-hidden /> Ask about this
              </a>
            </Button>
          </div>
        )}

        <Markdown>{note.bodyMd}</Markdown>

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
  );
}
