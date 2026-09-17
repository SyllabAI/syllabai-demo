"use client";

/**
 * EXPERIMENT: kg-navigation
 * Question: can the knowledge graph act as the product's front door — a
 * single flow graph → spec point → note → question — without a single
 * dashboard?
 *
 * STATUS: SEED (implementation exists; learning outcome not yet recorded).
 * Finding so far: none recorded — delete or promote after experimenting.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlaskConical } from "lucide-react";
import type { Curriculum, ExamQuestionTopic, RevisionNote } from "@/lib/contracts";
import { SpecChip } from "@/components/provenance";

export function KgNavigationExperiment({
  curriculum,
  notes,
  topics,
}: {
  curriculum: Curriculum;
  notes: RevisionNote[];
  topics: ExamQuestionTopic[];
}) {
  const [query, setQuery] = useState("");

  const specPoints = useMemo(
    () =>
      curriculum.nodes
        .filter((n) => n.family === "SPEC_POINT")
        .sort((a, b) => a.code.localeCompare(b.code)),
    [curriculum],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? specPoints.filter(
          (sp) => sp.title.toLowerCase().includes(q) || sp.code.toLowerCase().includes(q),
        )
      : specPoints;
    return base.slice(0, 12);
  }, [specPoints, query]);

  const [selected, setSelected] = useState<string | null>(null);
  const noteLinks = useMemo(
    () => (selected ? notes.filter((n) => n.specPointCodes.includes(selected)) : []),
    [notes, selected],
  );
  const questionCount = useMemo(
    () =>
      selected
        ? topics.reduce(
            (acc, t) =>
              acc +
              t.questions.filter((q) => q.parts.some((p) => p.specPointCodes.includes(selected)))
                .length,
            0,
          )
        : 0,
    [topics, selected],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <FlaskConical className="size-5 text-primary" aria-hidden />
          <span className="font-mono">kg-navigation</span>
          <Badge variant="secondary" className="text-[10px]">
            SEED
          </Badge>
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Pick a spec point from the curriculum anchor — the flow reveals everything connected to
          it (notes, questions) without leaving the context. Delete this experiment freely; the
          permanent architecture never depends on it.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Specification anchor</CardTitle>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter spec points…"
              className="w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              aria-label="Filter specification points"
            />
          </CardHeader>
          <CardContent className="max-h-80 space-y-1 overflow-y-auto">
            {matches.map((sp) => (
              <button
                key={sp.code}
                onClick={() => setSelected(sp.code)}
                className={`block w-full rounded px-2 py-1.5 text-left text-xs transition-colors ${
                  selected === sp.code ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
              >
                <span className="font-mono">{sp.code}</span>
                <span className="ml-2">{sp.title}</span>
              </button>
            ))}
            {matches.length === 0 && (
              <p className="p-2 text-xs text-muted-foreground">No match.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Connected material {selected && <SpecChip code={selected} />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!selected && (
              <p className="text-muted-foreground">
                Select a spec point to see its graph-driven context.
              </p>
            )}
            {selected && (
              <>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Revision notes ({noteLinks.length})
                  </p>
                  {noteLinks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None bundled — honest gap.</p>
                  ) : (
                    noteLinks.map((n) => (
                      <Link
                        key={n.noteId}
                        href={`/revision-notes/${n.noteId}`}
                        className="block rounded px-2 py-1 text-xs hover:bg-muted"
                      >
                        {n.title} <span className="font-mono text-[10px] text-muted-foreground">{n.noteId}</span>
                      </Link>
                    ))
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Exam questions ({questionCount})
                  </p>
                  {questionCount === 0 ? (
                    <p className="text-xs text-muted-foreground">None bundled — honest gap.</p>
                  ) : (
                    <Link
                      href={`/exam-questions?spec=${encodeURIComponent(selected)}`}
                      className="inline-block rounded border px-2.5 py-1.5 text-xs hover:bg-muted"
                    >
                      Open {questionCount} question{questionCount === 1 ? "" : "s"} →
                    </Link>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
