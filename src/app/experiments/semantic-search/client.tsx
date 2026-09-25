"use client";

/**
 * EXPERIMENT: semantic-search
 * Question: what does whole-corpus search feel like for a learner — before
 * any semantic backend exists?
 *
 * Implementation: the demo's lexical retriever (BM25-lite with SyllabAI-aware
 * reranking) runs client-side over the bundled corpus. When a real embedding
 * backend exists, swap the search function — the UI contract stays.
 *
 * STATUS: SEED (implementation exists; learning outcome not yet recorded).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search } from "lucide-react";
import type { ConceptGraph, ExamQuestionTopic, RevisionNote } from "@/lib/contracts";
import { tokenize, type CorpusIndex, type IndexedSegment } from "@/lib/ai/retrieval";
import { SpecChip } from "@/components/provenance";

function buildIndex(
  notes: RevisionNote[],
  topics: ExamQuestionTopic[],
  graph: ConceptGraph,
): CorpusIndex {
  const segments: IndexedSegment[] = [];
  for (const n of notes) {
    segments.push({
      kind: "REVISION_NOTE",
      ref: n.noteId,
      title: n.title,
      specPointCode: n.specPointCodes[0] ?? null,
      text: n.bodyMd.slice(0, 2500),
      tokens: new Map(),
      url: `/revision-notes/${n.noteId}`,
    });
  }
  for (const t of topics) {
    for (const q of t.questions) {
      for (const p of q.parts) {
        segments.push({
          kind: "QUESTION_PART",
          ref: p.id,
          title: `${t.name} · ${p.marks}-mark ${p.commandWord ?? "question"}`,
          specPointCode: p.specPointCodes[0] ?? null,
          text: p.problemMd ?? "",
          tokens: new Map(),
          url: `/exam-questions?spec=${p.specPointCodes[0] ?? ""}`,
        });
      }
    }
  }
  // NOTE: CONCEPT segments removed with the /knowledge-graph surface — their
  // result URL pointed there; notes + questions remain indexed.
  const df = new Map<string, number>();
  for (const s of segments) {
    const seen = new Set<string>();
    for (const tok of tokenize(`${s.title} ${s.text}`)) {
      if (seen.has(tok)) continue;
      seen.add(tok);
      df.set(tok, (df.get(tok) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [tok, count] of df) idf.set(tok, Math.log(1 + segments.length / count));
  for (const s of segments) {
    for (const tok of tokenize(`${s.title} ${s.text}`)) {
      s.tokens.set(tok, (s.tokens.get(tok) ?? 0) + 1);
    }
  }
  return { segments, idf };
}

const KIND_LABEL: Record<string, string> = {
  REVISION_NOTE: "note",
  QUESTION_PART: "question",
  CONCEPT: "concept",
};

export function SemanticSearchExperiment({
  notes,
  topics,
  graph,
}: {
  notes: RevisionNote[];
  topics: ExamQuestionTopic[];
  graph: ConceptGraph;
}) {
  const index = useMemo(() => buildIndex(notes, topics, graph), [notes, topics, graph]);
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<Set<string>>(new Set());

  const results = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const qTokens = tokenize(q);
    const scored = index.segments
      .map((s) => {
        let score = 0;
        for (const tok of qTokens) {
          const tf = s.tokens.get(tok);
          if (tf) score += (1 + Math.log(tf)) * (index.idf.get(tok) ?? 0);
          if (s.title.toLowerCase().includes(tok)) score += 0.4;
        }
        return { s, score };
      })
      .filter((r) => r.score > 0.3 && (kinds.size === 0 || kinds.has(r.s.kind)));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 12);
  }, [index, query, kinds]);

  const toggleKind = (k: string) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Search className="size-5 text-primary" aria-hidden />
          <span className="font-mono">semantic-search</span>
          <Badge variant="secondary" className="text-[10px]">
            SEED
          </Badge>
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Whole-corpus search: notes, question parts and concepts ({index.segments.length} segments)
          — lexical BM25-lite client-side. When a real embedding backend exists, swap the scorer;
          the UI contract stays.
        </p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search everything — e.g. “diffusion”, “electronic configuration”, “separation”…"
        className="w-full rounded-md border px-3.5 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
        aria-label="Search the corpus"
      />

      <div className="flex flex-wrap gap-1.5">
        {["REVISION_NOTE", "QUESTION_PART", "CONCEPT"].map((k) => (
          <button
            key={k}
            onClick={() => toggleKind(k)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              kinds.has(k) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
        {kinds.size > 0 && (
          <button onClick={() => setKinds(new Set())} className="px-1.5 text-xs text-muted-foreground underline">
            clear
          </button>
        )}
      </div>

      <div className="space-y-2">
        {results.map(({ s, score }) => (
          <Card key={`${s.kind}-${s.ref}`} className="py-0">
            <CardContent className="p-3.5">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {KIND_LABEL[s.kind]}
                </Badge>
                {s.specPointCode && <SpecChip code={s.specPointCode} />}
                <span className="text-xs text-muted-foreground">score {score.toFixed(2)}</span>
                <Link href={s.url ?? "#"} className="ml-auto text-xs underline underline-offset-2">
                  open →
                </Link>
              </div>
              <p className="text-sm font-medium">{s.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {s.text.replace(/[#*>|\-]/g, " ").replace(/\s+/g, " ").slice(0, 220)}
              </p>
            </CardContent>
          </Card>
        ))}
        {query.trim().length >= 2 && results.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Nothing in the bundled corpus matches “{query}” — an honest empty result.
          </p>
        )}
        {query.trim().length < 2 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Type at least 2 characters — try a concept, a command word, or a spec code like{" "}
            <span className="font-mono">4CH1-1.1</span>.
          </p>
        )}
      </div>
    </div>
  );
}
