"use client";

/**
 * Learner Overlay — the SIMULATED learner model viewer.
 *
 * Conceptual model preserved (brief §27): raw conversation → extracted
 * evidence → patterns → governed model → recommendations. The demo can only
 * SHOW the last two stages over simulated data; AI/chat output never mutates
 * anything here. Bands mirror production vocabulary (LOW/DEVELOPING/SECURE).
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { User } from "lucide-react";
import type { SimLearnerState } from "@/lib/contracts";
import { SimulatedBanner } from "@/components/provenance";

const bandClass: Record<string, string> = {
  SECURE: "bg-success",
  DEVELOPING: "bg-warn",
  LOW: "bg-destructive",
};

export function LearnerClient({ state }: { state: SimLearnerState }) {
  const [sort, setSort] = useState<"mastery" | "code">("mastery");

  const skills = useMemo(() => {
    const list = [...state.skillStates];
    list.sort((a, b) =>
      sort === "mastery"
        ? a.effectiveMastery - b.effectiveMastery
        : a.code.localeCompare(b.code),
    );
    return list;
  }, [state, sort]);

  const mean =
    state.skillStates.length > 0
      ? state.skillStates.reduce((a, s) => a + s.effectiveMastery, 0) / state.skillStates.length
      : 0;
  const active = state.misconceptionStates.filter((m) => m.active);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <User className="size-5 text-primary" aria-hidden />
          Learner Overlay
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          BKT-style mastery + misconception states displayed as an <em>overlay</em> on curriculum
          truth. In production this read model is served by{" "}
          <span className="font-mono text-xs">/api/v1/learners/me/state</span> from governed
          evidence; here it is a deterministic simulation so dashboard/UX experiments can run
          offline.
        </p>
      </div>

      <SimulatedBanner>
        {state.disclaimer} Learner id <span className="font-mono">{state.learnerId}</span> ·
        deterministic seed — the same overlay on every load.
      </SimulatedBanner>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="py-4">
          <CardContent className="px-4">
            <p className="text-2xl font-bold tabular-nums">{Math.round(mean * 100)}%</p>
            <p className="text-xs text-muted-foreground">mean effective mastery</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4">
            <p className="text-2xl font-bold tabular-nums">
              {state.skillStates.filter((s) => s.band === "SECURE").length}
            </p>
            <p className="text-xs text-muted-foreground">secure spec points</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4">
            <p className="text-2xl font-bold tabular-nums">{active.length}</p>
            <p className="text-xs text-muted-foreground">active misconceptions</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-sm">Skill states</CardTitle>
            <CardDescription>
              {state.skillStates.length} spec points · {sort === "mastery" ? "weakest first" : "by code"}
            </CardDescription>
          </div>
          <button
            onClick={() => setSort((s) => (s === "mastery" ? "code" : "mastery"))}
            className="rounded border px-2 py-1 text-xs transition-colors hover:bg-muted"
          >
            sort: {sort}
          </button>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {skills.map((s) => (
            <div key={s.nodeId} className="flex items-center gap-3">
              <span className="w-24 shrink-0 font-mono text-xs">{s.code}</span>
              <Progress value={s.effectiveMastery * 100} className="h-2 flex-1" aria-label={`${s.code} mastery`} />
              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(s.effectiveMastery * 100)}%
              </span>
              <span className="flex w-24 items-center justify-end gap-1.5 text-xs">
                <span className={`size-2 rounded-full ${bandClass[s.band] ?? "bg-muted-foreground/40"}`} aria-hidden />
                {s.band.toLowerCase()}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Misconception states</CardTitle>
          <CardDescription>
            T-C11 misconception nodes with simulated BDT-style probabilities
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {state.misconceptionStates.map((m) => (
            <div key={m.misconceptionNodeId} className="rounded-md border p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium leading-snug">{m.title}</span>
                {m.active && (
                  <Badge variant="outline" className="shrink-0 border-destructive/30 text-[10px] text-destructive">
                    active
                  </Badge>
                )}
              </div>
              <p className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                {m.code} · p={m.probability.toFixed(2)} · {m.evidenceCount} evidence
              </p>
              <Progress value={m.probability * 100} className="mt-1.5 h-1.5" aria-label={`${m.code} probability`} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
