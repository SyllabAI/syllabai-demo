import { notFound } from "next/navigation";
import { loadHubCourse } from "@/lib/courses";
import {
  corpusIndex,
  findCorpusPaper,
  sessionLabel as sessionLabelOf,
} from "@/lib/pastpapers-corpus";
import { Breadcrumbs, ExamCodePill } from "@/components/hub/chrome";
import { ResourcePanel } from "@/components/hub/resource-panel";
import { Badge } from "@/components/ui/badge";
import { PaperViewerClient } from "@/components/pastpapers/paper-viewer-client";

export const dynamic = "force-dynamic";

/**
 * One corpus paper — PDF viewer (view / split) and mock-exam runner.
 *
 * ?doc=qp|ms|split picks the initial document (view mode);
 * ?mode=mock starts the mock-exam flow (fullscreen QP + official timer).
 * The paper's identity is resolved strictly from the committed corpus index —
 * no paper exists here that the syllabai-pastpapers repo doesn't hold.
 */
export default async function CorpusPaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ course: string; session: string; paperDir: string }>;
  searchParams: Promise<{ doc?: string; mode?: string }>;
}) {
  const { course: slug, session, paperDir } = await params;
  const { doc, mode } = await searchParams;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();

  const paper = findCorpusPaper(slug, session, paperDir);
  if (!paper) notFound();

  const { meta } = hub;
  const docParam = doc === "ms" || doc === "split" ? doc : "qp";
  const mockMode = mode === "mock";

  return (
    <div className="flex w-full">
      <ResourcePanel variant="questions" />
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <Breadcrumbs
            items={[
              { label: meta.level, href: "/courses" },
              { label: meta.subject, href: `/courses/${meta.slug}` },
              { label: "Past Papers", href: `/courses/${meta.slug}/past-papers` },
              { label: `${sessionLabelOf(session)} · ${paper.ref}` },
            ]}
          />

          <header className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {paper.ref} — {sessionLabelOf(session)}
            </h1>
            <ExamCodePill code={meta.code} />
            <Badge variant="outline" className="text-[10px]">
              AI-IDENTIFIED corpus
            </Badge>
          </header>

          <PaperViewerClient
            course={meta.slug}
            paper={paper}
            sessionLabelStr={sessionLabelOf(session)}
            initialDoc={docParam}
            mode={mockMode ? "mock" : "view"}
            metaGeneratedAt={corpusIndex.meta.generatedAt}
          />
        </div>
      </div>
    </div>
  );
}
