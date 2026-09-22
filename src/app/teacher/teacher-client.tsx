"use client";

/**
 * Teacher workspace — the planned teacher-mode home, rendered as a mockup
 * (TEACHER-1). Two honest layers:
 *
 *   1. What you'd see: identity chip (from the mock identity store), a
 *      sample-data KPI strip, and the six planned modules.
 *   2. What it needs: every module is labelled Planned with its phase, and
 *      a data-foundation strip names the three real gaps (accounts,
 *      server-side progress, write path) that block real analytics.
 *
 * Sample values are marked SAMPLE — demo discipline forbids presenting
 * invented numbers as live data.
 */
import Link from "next/link";
import {
  ArrowRight,
  Atom,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileText,
  Info,
  LayoutDashboard,
  LogIn,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { clearIdentity, useIdentity } from "@/lib/identity";

const MODULES = [
  {
    icon: LayoutDashboard,
    title: "Cohort overview",
    desc: "Classes at a glance: engagement, recent activity, at-risk flags based on missed sessions and stalled progress.",
    phase: "Phase 1",
    needs: "accounts · server-side progress",
  },
  {
    icon: BarChart3,
    title: "Spec-point mastery heatmap",
    desc: "Per-student mastery against the official spec spine (all 49 courses already have one) — the teacher view of the knowledge graph.",
    phase: "Phase 1",
    needs: "attempt events on the server",
  },
  {
    icon: ClipboardCheck,
    title: "Assignments & Target Tests",
    desc: "Build an assignment from any question set or paper, set a due date, watch completion stream in. Reuses the Target Test roadmap item.",
    phase: "Phase 2",
    needs: "assignment + attempt write APIs",
  },
  {
    icon: ShieldCheck,
    title: "AI content validation",
    desc: "Review, correct and approve AI-generated notes, marks and flashcards before students rely on them. The 'teacher validation' step the corpus pipeline already anticipates.",
    phase: "Phase 2",
    needs: "approval workflow + audit trail",
  },
  {
    icon: FileText,
    title: "Reports & exports",
    desc: "Per-student and per-class progress reports, exported for parents and school records.",
    phase: "Phase 3",
    needs: "stable analytics schema",
  },
  {
    icon: Settings,
    title: "Roster & settings",
    desc: "Invite students, manage classes, link courses, control what learners can see.",
    phase: "Phase 3",
    needs: "RBAC + invite flow",
  },
] as const;

const KPIS = [
  { label: "Classes", value: "3", hint: "sample" },
  { label: "Students", value: "68", hint: "sample" },
  { label: "Avg. spec mastery", value: "54%", hint: "sample" },
  { label: "Needs attention", value: "7", hint: "sample" },
] as const;

export function TeacherClient() {
  const identity = useIdentity();
  const isTeacher = identity?.role === "teacher";

  return (
    <div className="space-y-8">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 text-[10px] font-normal">
              <Atom className="size-3" aria-hidden />
              Teacher mode · mockup
            </Badge>
            <Badge variant="secondary" className="text-[10px] font-normal">
              Planned
            </Badge>
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Teacher workspace
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The planned home for the teacher side of SyllabAI. This page is the mockup: it shows
            the intended modules and what each one needs before it can exist. Full plan in{" "}
            <a
              href="https://github.com/SyllabAI/syllabai-demo/blob/main/docs/TEACHER_MODE_PLAN.md"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline underline-offset-2"
            >
              docs/TEACHER_MODE_PLAN.md
            </a>
            .
          </p>
        </div>

        {/* identity chip — from the mock identity store */}
        {identity ? (
          <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {identity.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{identity.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {identity.email} · signed in as {identity.role}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 h-8 text-xs text-muted-foreground"
              onClick={() => clearIdentity()}
            >
              Sign out
            </Button>
          </div>
        ) : (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/login">
              <LogIn className="size-3.5" aria-hidden />
              Sign in as a teacher
            </Link>
          </Button>
        )}
      </div>

      {/* role guard — gentle, it is a mockup */}
      {identity && !isTeacher && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
          <span>
            You are signed in as a <strong>student</strong>. This workspace is the teacher mode —
            switch role from the{" "}
            <Link href="/login" className="font-medium underline underline-offset-2">
              sign-in page
            </Link>
            .
          </span>
        </div>
      )}

      {/* KPI strip — explicitly sample data */}
      <section aria-labelledby="cohort-kpis">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="cohort-kpis" className="text-sm font-semibold">
            Cohort snapshot
          </h2>
          <span className="text-[11px] text-muted-foreground">
            SAMPLE data — real analytics need accounts + server-side progress
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {KPIS.map((kpi) => (
            <Card key={kpi.label} className="py-0">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{kpi.value}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  {kpi.hint}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* planned modules */}
      <section aria-labelledby="planned-modules">
        <h2 id="planned-modules" className="text-sm font-semibold">
          Planned modules
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module) => (
            <Card
              key={module.title}
              className="py-0 transition-shadow hover:shadow-md"
            >
              <CardContent className="flex h-full flex-col p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex size-9 items-center justify-center rounded-md bg-muted">
                    <module.icon className="size-4 text-foreground" aria-hidden />
                  </span>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {module.phase}
                  </Badge>
                </div>
                <h3 className="mt-3 text-sm font-semibold">{module.title}</h3>
                <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {module.desc}
                </p>
                <p className="mt-3 border-t pt-2.5 font-mono text-[10px] text-muted-foreground/80">
                  needs: {module.needs}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* data-foundation strip */}
      <section aria-labelledby="data-foundation">
        <Card className="border-dashed bg-muted/40 py-0">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background">
              <Database className="size-4 text-muted-foreground" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="data-foundation" className="text-sm font-semibold">
                Data foundation still to build
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Student progress currently lives in browser localStorage and is labelled
                SIMULATED. Teacher analytics need three things the demo does not have yet: real
                accounts with roles (the login mockup is the front door), server-side attempt
                events replacing the local progress overlay, and write APIs in the data-provider
                seam ({" "}
                <span className="font-mono">src/lib/data/</span>) that today is read-only. None of
                the modules above can ship on real data until these land.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* CTA row */}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild className="gap-1.5">
          <Link href="/dashboard">
            Explore the student experience
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-1.5">
          <Link href="/courses">
            <ClipboardList className="size-4" aria-hidden />
            Browse all 49 courses
          </Link>
        </Button>
      </div>
    </div>
  );
}
