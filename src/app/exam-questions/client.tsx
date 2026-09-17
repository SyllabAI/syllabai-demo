"use client";

/**
 * Exam Questions — real imported SME question sets with parts, command
 * words, spec-point anchors and mark-scheme reveal.
 *
 * Content-gate discipline (brief §6/§9): the demo shows the upstream
 * validation status where it exists and never pretends demo-local visibility
 * equals teacher validation. In production, serving is gated by syllabai-core
 * (SUGGESTED never serves); this prototype surface is explicitly labelled.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Eye, EyeOff, ScrollText } from "lucide-react";
import type { ExamQuestionTopic } from "@/lib/contracts";
import { Markdown } from "@/components/markdown";
import { SpecChip } from "@/components/provenance";

export function ExamQuestionsClient({
  topics,
  specFilter,
}: {
  topics: ExamQuestionTopic[];
  specFilter: string | null;
}) {
  const [topicSlug, setTopicSlug] = useState(
    () => topics.find((t) => !specFilter || t.questions.some((q) => q.parts.some((p) => p.specPointCodes.includes(specFilter))))?.slug ?? topics[0]?.slug ?? "",
  );
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const topic = topics.find((t) => t.slug === topicSlug);

  const questions = useMemo(() => {
    if (!topic) return [];
    if (!specFilter) return topic.questions;
    return topic.questions.filter((q) => q.parts.some((p) => p.specPointCodes.includes(specFilter)));
  }, [topic, specFilter]);

  const toggle = (partId: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });

  const revealAll = () => {
    if (!topic) return;
    setRevealed(new Set(topic.questions.flatMap((q) => q.parts.map((p) => p.id))));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ScrollText className="size-5 text-primary" aria-hidden />
            Exam Questions
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Canonical <span className="font-mono text-xs">qstn_*</span> ids from the SME corpus
            (schema {topic?.schema ?? "syllabai.sme-exam-questions/1.1"}). In production this surface
            sits behind the syllabai-core serving gate — here it is a prototype reader with the
            provenance attached.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={topicSlug} onValueChange={setTopicSlug}>
            <SelectTrigger className="w-[240px]" aria-label="Question set">
              <SelectValue placeholder="Question set" />
            </SelectTrigger>
            <SelectContent>
              {topics.map((t) => (
                <SelectItem key={t.slug} value={t.slug}>
                  {t.name} ({t.questions.length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={revealAll}>
            <Eye className="size-4" aria-hidden /> Reveal all
          </Button>
        </div>
      </div>

      {specFilter && (
        <p className="text-sm text-muted-foreground">
          Filtered by spec point <SpecChip code={specFilter} /> — showing {questions.length} of{" "}
          {topic?.questions.length ?? 0} questions.
        </p>
      )}

      <div className="space-y-3">
        {questions.map((q, qi) => (
          <Card key={q.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">Q{qi + 1}</span>
                <Badge variant="outline" className="text-[10px]">
                  {q.totalMarks} marks
                </Badge>
                {q.difficulty && (
                  <Badge variant="secondary" className="text-[10px]">
                    {q.difficulty}
                  </Badge>
                )}
                <span className="font-mono text-[10px] text-muted-foreground">{q.id}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {q.parts.map((p) => {
                const open = revealed.has(p.id);
                return (
                  <div key={p.id} className="rounded-md border">
                    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        part {p.order + 1}
                      </Badge>
                      {p.commandWord && (
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {p.commandWord}
                        </Badge>
                      )}
                      <span>{p.marks} mark{p.marks === 1 ? "" : "s"}</span>
                      {p.specPointCodes.map((c) => (
                        <SpecChip key={c} code={c} />
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-7 gap-1 px-2 text-xs"
                        onClick={() => toggle(p.id)}
                        aria-expanded={open}
                      >
                        {open ? (
                          <>
                            <EyeOff className="size-3.5" aria-hidden /> Hide mark scheme
                          </>
                        ) : (
                          <>
                            <Eye className="size-3.5" aria-hidden /> Mark scheme
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="px-3 py-2.5">
                      <Markdown>{p.problemMd}</Markdown>
                      {p.solutionMd && (
                        <Collapsible open={open}>
                          <CollapsibleContent className="mt-3 border-t pt-3">
                            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Mark scheme / solution
                            </p>
                            <Markdown>{p.solutionMd}</Markdown>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
        {questions.length === 0 && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No question in this set maps to the selected spec point — honest empty state, the
              production surface behaves the same way.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
