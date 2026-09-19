"use client";

/**
 * Dashboard — the student's SME-style home (research §3-4 flow):
 *   1. My Subjects (added courses, one card each with resource counts)
 *   2. Add Subject (catalogue picker over the 39-course registry)
 *
 * The roster persists client-side (no auth in the demo); resource counts
 * come from /api/course-stats, which reads the committed bundles.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CircleHelp,
  FileQuestion,
  GraduationCap,
  ListTree,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMySubjects } from "@/lib/my-subjects";
import type { CourseMeta } from "@/lib/courses";

interface CourseStat {
  slug: string;
  hasBundle: boolean;
  topics: number;
  notes: number;
  questionSets: number;
  questions: number;
  flashcards: number;
}

const QUICK_ADD = ["igcse-chemistry-19", "igcse-physics-19", "igcse-biology-19", "ial-maths-20-pure-1"];

function StatChip({ icon: Icon, value, label }: { icon: typeof BookOpen; value: number | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={label}>
      <Icon className="size-3.5" aria-hidden />
      {value === null ? <Skeleton className="h-3 w-6" /> : <span className="font-medium text-foreground">{value}</span>}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function SubjectCard({
  meta,
  stat,
  onRemove,
}: {
  meta: CourseMeta;
  stat: CourseStat | undefined;
  onRemove: (slug: string) => void;
}) {
  const base = `/courses/${meta.slug}`;
  const counts = stat?.hasBundle
    ? { topics: stat.topics, notes: stat.notes, sets: stat.questionSets, cards: stat.flashcards }
    : null;

  return (
    <Card className="relative h-full border-primary/30 transition-colors hover:border-primary/60">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${meta.label} from my subjects`}
        onClick={() => onRemove(meta.slug)}
        className="absolute right-1.5 top-1.5 size-7 rounded-full text-muted-foreground hover:text-destructive"
      >
        <X className="size-4" aria-hidden />
      </Button>
      <CardContent className="flex h-full flex-col gap-3 p-4 pr-9">
        <div className="min-w-0">
          <Link href={base} className="group">
            <p className="truncate text-sm font-semibold group-hover:text-primary">{meta.label}</p>
          </Link>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {meta.code || "code pending"} · {meta.level}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {counts ? (
            <>
              <StatChip icon={ListTree} value={counts.topics} label="topics" />
              <StatChip icon={BookOpen} value={counts.notes} label="revision notes" />
              <StatChip icon={FileQuestion} value={counts.sets} label="question sets" />
              <StatChip icon={CircleHelp} value={counts.cards} label="flashcards" />
            </>
          ) : (
            <>
              <StatChip icon={ListTree} value={null} label="topics" />
              <StatChip icon={BookOpen} value={null} label="revision notes" />
              <StatChip icon={FileQuestion} value={null} label="question sets" />
              <StatChip icon={CircleHelp} value={null} label="flashcards" />
            </>
          )}
        </div>

        {meta.hasBundle ? (
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            <Button asChild size="sm" className="h-7 text-xs">
              <Link href={base}>Open hub</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <Link href={`${base}/revision-notes`}>Notes</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <Link href={`${base}/exam-questions`}>Questions</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <Link href={`${base}/flashcards`}>Flashcards</Link>
            </Button>
          </div>
        ) : (
          <p className="mt-auto pt-1 text-xs text-muted-foreground">Content import pending — hub not available yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardClient({ courses }: { courses: CourseMeta[] }) {
  const { slugs, has, add, remove } = useMySubjects();
  const [q, setQ] = useState("");
  const [stats, setStats] = useState<Record<string, CourseStat>>({});

  const bySlug = useMemo(() => {
    const m = new Map<string, CourseMeta>();
    for (const c of courses) m.set(c.slug, c);
    return m;
  }, [courses]);

  // valid roster = stored slugs that still exist in the registry
  const mySubjects = useMemo(
    () => slugs.filter((s) => bySlug.has(s)).map((s) => bySlug.get(s) as CourseMeta),
    [slugs, bySlug],
  );
  const slugsKey = mySubjects.map((c) => c.slug).join(",");

  useEffect(() => {
    if (!slugsKey) return;
    let cancelled = false;
    fetch(`/api/course-stats?slugs=${encodeURIComponent(slugsKey)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { stats?: Record<string, CourseStat> }) => {
        if (!cancelled && data.stats) setStats((prev) => ({ ...prev, ...data.stats }));
      })
      .catch(() => {
        /* keep previous stats; card falls back to skeletons */
      });
    return () => {
      cancelled = true;
    };
  }, [slugsKey]);

  const available = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return courses.filter(
      (c) =>
        !has(c.slug) &&
        (!needle ||
          c.label.toLowerCase().includes(needle) ||
          c.subject.toLowerCase().includes(needle) ||
          c.code.toLowerCase().includes(needle) ||
          c.level.toLowerCase().includes(needle)),
    );
  }, [courses, q, has]);

  const grouped = useMemo(() => {
    const g = new Map<string, CourseMeta[]>();
    for (const c of available) g.set(c.level, [...(g.get(c.level) ?? []), c]);
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [available]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Your subjects, one hub each. Add the courses you are studying to unlock their
          spec-anchored revision notes, exam questions and flashcards — the same flow as the
          reference product, backed by the SyllabAI corpus.
        </p>
      </header>

      {/* ---- My subjects ---- */}
      <section aria-label="My subjects" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">
            My subjects <span className="text-sm font-normal text-muted-foreground">· {mySubjects.length}</span>
          </h2>
        </div>

        {mySubjects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <p className="flex items-center gap-2 text-sm font-medium">
                <GraduationCap className="size-4 text-primary" aria-hidden />
                No subjects yet — add your first one below.
              </p>
              <p className="text-sm text-muted-foreground">
                Pick from the 39-course Edexcel registry, or start with a popular one:
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_ADD.filter((s) => bySlug.has(s)).map((slug) => {
                  const c = bySlug.get(slug) as CourseMeta;
                  return (
                    <Button key={slug} size="sm" variant="outline" className="gap-1.5" onClick={() => add(slug)}>
                      <Plus className="size-3.5" aria-hidden />
                      {c.label}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mySubjects.map((c) => (
              <SubjectCard key={c.slug} meta={c} stat={stats[c.slug]} onRemove={remove} />
            ))}
          </div>
        )}
      </section>

      {/* ---- Add subject ---- */}
      <section aria-label="Add subject" className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden />
          Add a subject
        </h2>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the 39-course registry by subject or exam code…"
          aria-label="Search courses to add"
          className="max-w-md"
        />
        {grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {q ? `No course matches “${q}”.` : "Every course in the registry is already in My subjects."}
          </p>
        ) : (
          grouped.map(([level, list]) => (
            <div key={level} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {level} <span className="font-normal">· {list.length}</span>
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => (
                  <Card key={c.slug} className="h-full">
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{c.label}</p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{c.code || "code pending"}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 gap-1.5"
                        onClick={() => add(c.slug)}
                        aria-label={`Add ${c.label} to my subjects`}
                      >
                        <Plus className="size-3.5" aria-hidden />
                        Add
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

    </div>
  );
}
