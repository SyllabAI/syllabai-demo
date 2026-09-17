"use client";

/**
 * Knowledge Graph surface — two cooperating layers, never conflated:
 *
 *  1. OFFICIAL CURRICULUM ANCHOR (SpecGraphCanvas) — the RULE_DERIVED spec
 *     skeleton, verbatim titles, layered layout ported from syllabai-web.
 *  2. GRAPH-DERIVED layer (ConceptWeb) — T-C11 concepts/misconceptions with
 *     explicit AI_SUGGESTED provenance. Shown with its extraction passes.
 *
 * Learner mastery colours are SIMULATED and toggleable. Selecting a spec
 * point cross-links to its revision notes and exam questions (graph →
 * resource → question navigation is a first-class demo goal).
 */
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { BookOpen, HelpCircle, Network, ScrollText } from "lucide-react";
import type { ConceptGraph, Curriculum, SimLearnerState } from "@/lib/contracts";
import { SpecGraphCanvas } from "@/components/graph/spec-graph-canvas";
import { ConceptWeb } from "@/components/graph/concept-web";
import type { LayoutNode } from "@/components/graph/layout";
import { ProvenanceBadge, SpecChip } from "@/components/provenance";

interface Props {
  curriculum: Curriculum;
  graph: ConceptGraph;
  overlay: SimLearnerState;
}

export function KnowledgeGraphClient({ curriculum, graph, overlay }: Props) {
  const [overlayOn, setOverlayOn] = useState(true);
  const [selectedSpState, setSelectedSp] = useState<string | null>(null);
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const [webSize, setWebSize] = useState({ w: 900, h: 560 });

  // build layered structure from the spec skeleton
  const { layoutNodes, prereqEdges, childByParent } = useMemo(() => {
    const masteryByCode = new Map(overlay.skillStates.map((s) => [s.nodeId, s]));
    const nodes = new Map(curriculum.nodes.map((n) => [n.code, n]));
    const children = new Map<string, string[]>();
    for (const n of curriculum.nodes) {
      for (const p of n.parents) {
        children.set(p, [...(children.get(p) ?? []), n.code]);
      }
    }
    const layoutNodes: LayoutNode[] = curriculum.nodes.map((n) => {
      const m = masteryByCode.get(n.code);
      return {
        id: n.code,
        code: n.code,
        title: n.title,
        family: n.family,
        childIds: (children.get(n.code) ?? []).filter((c) => nodes.has(c)),
        value: overlayOn && m ? m.effectiveMastery : null,
        band: overlayOn && m ? m.band : null,
      };
    });
    const prereqEdges = curriculum.edges
      .filter((e) => e.relation === "REQUIRES_PREREQUISITE")
      .map((e) => ({ source: e.source, target: e.target }));
    const root = curriculum.nodes.find((n) => n.family === "SUBJECT") ?? curriculum.nodes[0];
    return { layoutNodes, prereqEdges, childByParent: children, rootId: root?.code };
  }, [curriculum, overlay, overlayOn]);

  const rootId = useMemo(
    () => curriculum.nodes.find((n) => n.family === "SUBJECT")?.code ?? curriculum.nodes[0]?.code ?? "",
    [curriculum],
  );

  // default focus = the spec point with the richest settled neighbourhood
  const defaultSp = useMemo(() => {
    const degree = new Map<string, number>();
    for (const e of graph.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestDegree = 0;
    for (const n of curriculum.nodes) {
      if (n.family !== "SPEC_POINT") continue;
      const d = degree.get(n.code) ?? 0;
      if (d > bestDegree) {
        best = n.code;
        bestDegree = d;
      }
    }
    return best;
  }, [curriculum, graph]);
  const selectedSp = selectedSpState ?? defaultSp;
  const activeFocus = focusNode ?? defaultSp;

  // responsive web size
  useEffect(() => {
    const update = () => {
      const w = Math.min(Math.max(window.innerWidth - 80, 340), 980);
      setWebSize({ w, h: w < 640 ? 480 : 560 });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const selectedLayoutNode = selectedSp
    ? curriculum.nodes.find((n) => n.code === selectedSp)
    : null;

  const conceptsAtFocus = useMemo(() => {
    if (!activeFocus) return [];
    return graph.nodes.filter(
      (n) =>
        n.code !== activeFocus &&
        graph.edges.some(
          (e) =>
            (e.source === activeFocus && e.target === n.code) ||
            (e.target === activeFocus && e.source === n.code),
        ),
    );
  }, [graph, activeFocus]);

  const focusEdges = useMemo(() => {
    if (!activeFocus) return [];
    return graph.edges.filter((e) => e.source === activeFocus || e.target === activeFocus);
  }, [graph, activeFocus]);

  const specPointOptions = useMemo(
    () => curriculum.nodes.filter((n) => n.family === "SPEC_POINT").sort((a, b) => a.code.localeCompare(b.code)),
    [curriculum],
  );

  const graphCodes = useMemo(() => {
    const set = new Set<string>();
    for (const e of graph.edges) {
      set.add(e.source);
      set.add(e.target);
    }
    for (const n of graph.nodes) set.add(n.code);
    return set;
  }, [graph]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Network className="size-5 text-primary" aria-hidden />
            Knowledge Graph
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Two distinct layers: the <span className="font-medium text-foreground">official curriculum
            anchor</span> (RULE_DERIVED spec skeleton) and the <span className="font-medium text-foreground">graph-derived
            layer</span> (T-C11 concepts/misconceptions). The visualization is a UI layer — it does
            not establish educational truth.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <Switch id="overlay" checked={overlayOn} onCheckedChange={setOverlayOn} aria-label="Toggle simulated mastery overlay" />
          <Label htmlFor="overlay" className="text-xs">
            mastery overlay <span className="font-mono text-[10px] text-fuchsia-600 dark:text-fuchsia-400">SIMULATED</span>
          </Label>
        </div>
      </div>

      <Tabs defaultValue="anchor">
        <TabsList>
          <TabsTrigger value="anchor">Curriculum anchor</TabsTrigger>
          <TabsTrigger value="concepts">Concept web (T-C11)</TabsTrigger>
        </TabsList>

        {/* ── anchor layer ── */}
        <TabsContent value="anchor" className="space-y-3">
          <SpecGraphCanvas
            nodes={layoutNodes}
            rootId={rootId}
            prerequisiteEdges={prereqEdges}
            selectedId={selectedSp}
            onSelect={(id) => {
              setSelectedSp(id);
              if (graphCodes.has(id)) setFocusNode(id);
            }}
            overlay={overlayOn}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" aria-hidden /> secure
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" aria-hidden /> developing
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-rose-500" aria-hidden /> low
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden /> not practised
            </span>
            <span>dashed = requires (prerequisite) · solid = part of</span>
          </div>
          {selectedLayoutNode && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {selectedLayoutNode.title}
                  <SpecChip code={selectedLayoutNode.code} />
                  <ProvenanceBadge tier={selectedLayoutNode.provenanceTier} />
                </CardTitle>
                <CardDescription>
                  {selectedLayoutNode.family} · {childByParent.get(selectedLayoutNode.code)?.length ?? 0} children
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/exam-questions?spec=${encodeURIComponent(selectedLayoutNode.code)}`}>
                    <ScrollText className="size-4" aria-hidden /> Exam questions
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/revision-notes?spec=${encodeURIComponent(selectedLayoutNode.code)}`}>
                    <BookOpen className="size-4" aria-hidden /> Revision notes
                  </Link>
                </Button>
                {graphCodes.has(selectedLayoutNode.code) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFocusNode(selectedLayoutNode.code)}
                  >
                    <Network className="size-4" aria-hidden /> Open in concept web
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── graph-derived layer ── */}
        <TabsContent value="concepts" className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Concept web · focus <span className="font-mono">{activeFocus ?? "—"}</span>
                </CardTitle>
                <CardDescription>
                  {graph.counts
                    ? Object.entries(graph.counts)
                        .map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`)
                        .join(" · ")
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0 pb-2">
                <ConceptWeb
                  graph={graph}
                  focus={activeFocus ?? ""}
                  focusTitle={
                    curriculum.nodes.find((n) => n.code === activeFocus)?.title ?? null
                  }
                  onSelect={(code) => setFocusNode(code)}
                  width={webSize.w}
                  height={webSize.h}
                />
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Spec points with settled graphs</CardTitle>
                  <CardDescription>select to re-centre the web</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-44 px-3 pb-3">
                    <div className="flex flex-wrap gap-1.5">
                      {specPointOptions
                        .filter((sp) => graphCodes.has(sp.code))
                        .map((sp) => (
                          <button
                            key={sp.code}
                            onClick={() => setFocusNode(sp.code)}
                            className={`rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                              activeFocus === sp.code
                                ? "border-primary bg-primary/10 text-primary"
                                : "hover:bg-muted"
                            }`}
                          >
                            {sp.code}
                          </button>
                        ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {activeFocus && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Neighbourhood detail</CardTitle>
                    <CardDescription className="font-mono text-[11px]">{activeFocus}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 p-3 pt-0 text-xs">
                    {conceptsAtFocus.length === 0 && (
                      <p className="text-muted-foreground">No settled neighbourhood — empty state, not fabricated content.</p>
                    )}
                    {conceptsAtFocus.map((c) => (
                      <button
                        key={c.code}
                        className="block w-full rounded-md border p-2 text-left transition-colors hover:bg-muted"
                        onClick={() => setFocusNode(c.code)}
                      >
                        <span className="flex items-center gap-1.5 font-medium">
                          {c.family === "MISCONCEPTION" && (
                            <HelpCircle className="size-3.5 text-rose-500" aria-hidden />
                          )}
                          {c.title}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          <ProvenanceBadge tier={c.provenanceTier} />
                          {c.specPoints.slice(0, 3).map((sp) => (
                            <SpecChip key={sp} code={sp} />
                          ))}
                        </span>
                      </button>
                    ))}
                    {focusEdges.length > 0 && (
                      <div className="pt-1 text-[11px] text-muted-foreground">
                        {focusEdges.length} edge{focusEdges.length === 1 ? "" : "s"} touch this node ·
                        vocabulary: {graph.edgeVocabulary?.split(":")[0] ?? "V2 enum"} · gate: operator
                        review
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
