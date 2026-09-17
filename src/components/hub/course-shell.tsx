"use client";

/**
 * CourseShell — the persistent per-course Learning Hub chrome (research §4).
 *
 * SME anatomy, ported 1:1 to SyllabAI semantics:
 *   - persistent left sidebar with three groups (Course / Revision / Exam
 *     Practice) and "Hide menu" collapse;
 *   - the sidebar's lower half switches to the current resource's numbered
 *     topic tree with per-sub-topic progress rings — one canonical tree
 *     (the specification tree) drives nav + progress everywhere;
 *   - Past Papers / Target Test stay visible but marked roadmap (no demo
 *     corpus → no fake links).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  CircleHelp,
  Compass,
  FileQuestion,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  ScrollText,
  Target,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronGlyph, NumberedLabel } from "@/components/hub/chrome";
import { ProgressRing } from "@/components/hub/progress-ring";
import { topicRing, useCourseProgress, type Course } from "@/lib/progress";
import type { SpecTree } from "@/lib/spec-tree";

export type SidebarVariant = "hub" | "notes" | "questions" | "flashcards";

export interface SidebarData {
  course: { slug: string; subject: string; level: string; code: string };
  tree: SpecTree;
  /** sub-topic code → per-resource counts */
  counts: Record<string, { notes: number; questions: number; flashcards: number }>;
  /** sub-topic code → canonical link per resource */
  hrefs: {
    notes: Record<string, string>;
    questions: Record<string, string>;
    flashcards: Record<string, string>;
  };
  /** noteId → sub-topic code (so the reader page can highlight its row) */
  noteSubtopic: Record<string, string | null>;
}

const ZERO = { notes: 0, questions: 0, flashcards: 0 };

export function CourseShell({
  data,
  children,
}: {
  data: SidebarData;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const course = data.course.slug as Course;

  const [open, setOpen] = useState(false); // mobile drawer
  const [hidden, setHidden] = useState(false); // desktop collapse ("Hide menu")

  const variant: SidebarVariant = useMemo(() => {
    if (pathname.includes("/revision-notes")) return "notes";
    if (pathname.includes("/exam-questions")) return "questions";
    if (pathname.includes("/flashcards")) return "flashcards";
    return "hub";
  }, [pathname]);

  // active sub-topic: explicit ?subtopic= → noteId mapping → first match
  const activeSubtopic = useMemo(() => {
    const q = params.get("subtopic");
    if (q) return q;
    const noteId = pathname.split("/revision-notes/")[1];
    if (noteId && data.noteSubtopic[noteId]) return data.noteSubtopic[noteId];
    return null;
  }, [params, pathname, data.noteSubtopic]);

  // auto-expand the topic containing the active row
  const activeTopic = useMemo(() => {
    if (!activeSubtopic) return null;
    return data.tree.topics.find((t) => t.subtopics.some((s) => s.code === activeSubtopic))?.code ?? null;
  }, [activeSubtopic, data.tree.topics]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastActiveTopic, setLastActiveTopic] = useState<string | null | undefined>(undefined);
  if (lastActiveTopic !== activeTopic) {
    // render-phase adjustment (React-endorsed): auto-expand the topic that
    // contains the active sub-topic; on first render default to the first
    // topic that actually has content
    setLastActiveTopic(activeTopic);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (activeTopic) {
        next.add(activeTopic);
      } else if (next.size === 0) {
        const first = data.tree.topics.find((t) =>
          t.subtopics.some((s) => {
            const k = data.counts[s.code] ?? ZERO;
            return k.notes + k.questions + k.flashcards > 0;
          }),
        );
        if (first) next.add(first.code);
      }
      return next;
    });
  }

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const progress = useCourseProgress(course);
  const savedCount = Object.keys(progress.saved).length;

  const base = `/courses/${data.course.slug}`;
  const indexHref: Record<SidebarVariant, string> = {
    hub: base,
    notes: `${base}/revision-notes`,
    questions: `${base}/exam-questions`,
    flashcards: `${base}/flashcards`,
  };
  const treeTitle: Record<SidebarVariant, string> = {
    hub: "Course topics",
    notes: "Revision Notes",
    questions: "Exam Questions",
    flashcards: "Flashcards",
  };

  const navGroups: {
    label: string;
    items: { href: string; label: string; icon: typeof BookOpen; disabled?: boolean; badge?: string; exact?: boolean; trailing?: React.ReactNode }[];
  }[] = [
    {
      label: "Course",
      items: [
        { href: base, label: "Course Resources", icon: LayoutDashboard, exact: pathname === base },
        { href: `${base}/strengths`, label: "Strengths & Weaknesses", icon: Compass, exact: pathname === `${base}/strengths` },
      ],
    },
    {
      label: "Revision",
      items: [
        { href: `${base}/revision-notes`, label: "Revision Notes", icon: BookOpen },
        { href: `${base}/flashcards`, label: "Flashcards", icon: CircleHelp },
      ],
    },
    {
      label: "Exam Practice",
      items: [
        { href: `${base}/exam-questions`, label: "Exam Questions", icon: FileQuestion },
        { href: `${base}/exam-questions/saved`, label: "Saved questions", icon: Bookmark, exact: pathname.endsWith("/saved"), trailing: savedCount > 0 ? (
          <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">{savedCount}</span>
        ) : undefined },
        { href: "#", label: "Target Test", icon: Target, disabled: true, badge: "roadmap" },
        { href: "#", label: "Past Papers", icon: ScrollText, disabled: true, badge: "roadmap" },
      ],
    },
  ];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        {hidden ? (
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setHidden(false)} aria-label="Show menu">
            <Menu className="size-4" aria-hidden />
          </Button>
        ) : (
          <>
            <span className="text-sm font-semibold tracking-tight">{data.course.subject}</span>
            <Button
              variant="ghost"
              size="sm"
              className="hidden h-8 gap-1.5 px-2 text-xs text-muted-foreground lg:inline-flex"
              onClick={() => setHidden(true)}
            >
              <PanelLeftClose className="size-4" aria-hidden /> Hide menu
            </Button>
            <Button variant="ghost" size="icon" className="size-8 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-4" aria-hidden />
            </Button>
          </>
        )}
      </div>

      {!hidden && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
          <nav aria-label="Course sections" className="space-y-4">
            {navGroups.map((g) => (
              <div key={g.label}>
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {g.label}
                </p>
                <ul className="space-y-0.5">
                  {g.items.map((item) => {
                    const active = item.disabled
                      ? false
                      : (item.exact ?? pathname.startsWith(item.href));
                    const inner = (
                      <>
                        <item.icon className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <Badge variant="outline" className="ml-auto shrink-0 px-1 text-[9px] uppercase text-muted-foreground">
                            {item.badge}
                          </Badge>
                        )}
                        {item.trailing}
                      </>
                    );
                    return (
                      <li key={item.label}>
                        {item.disabled ? (
                          <span
                            aria-disabled
                            title="Not part of the demo corpus yet"
                            className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground/60"
                          >
                            {inner}
                          </span>
                        ) : (
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                              active
                                ? "bg-primary/10 font-medium text-primary"
                                : "text-foreground/80 hover:bg-muted hover:text-foreground",
                            )}
                          >
                            {inner}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* resource-flavoured topic tree */}
          <div className="mt-5 border-t pt-4">
            <Link
              href={indexHref[variant]}
              onClick={() => setOpen(false)}
              className="group mb-2 flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              View all topics
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <p className="sr-only">{treeTitle[variant]} topics</p>
            <ul className="space-y-0.5" aria-label="Specification topic tree">
              {data.tree.topics.map((topic) => {
                const isOpen = expanded.has(topic.code);
                const ring = topicRing(progress, topic.subtopics.map((s) => s.code), new Map(Object.entries(data.counts)));
                const subCount = topic.subtopics.length;
                const label = `${subCount} Topics`;
                const metaRight =
                  variant === "notes"
                    ? `${topic.subtopics.reduce((a, s) => a + (data.counts[s.code]?.notes ?? 0), 0)} Revision Notes`
                    : variant === "questions"
                      ? `${topic.subtopics.reduce((a, s) => a + (data.counts[s.code]?.questions ?? 0), 0)} questions`
                      : variant === "flashcards"
                        ? `${topic.subtopics.reduce((a, s) => a + (data.counts[s.code]?.flashcards ?? 0), 0)} cards`
                        : `${topic.specPointCount} spec points`;
                return (
                  <li key={topic.code}>
                    <button
                      type="button"
                      onClick={() => toggle(topic.code)}
                      aria-expanded={isOpen}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] transition-colors hover:bg-muted",
                        activeTopic === topic.code && "bg-muted",
                      )}
                    >
                      <span className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/25" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <NumberedLabel number={topic.number} title={topic.title} />
                        <span className="block text-[11px] text-muted-foreground">
                          {label} · {metaRight}
                          {ring.percent > 0 ? ` · ${ring.percent}%` : ""}
                        </span>
                      </span>
                      <ChevronGlyph open={isOpen} />
                    </button>
                    {isOpen && (
                      <ul className="ml-[15px] space-y-0.5 border-l pl-2">
                        {topic.subtopics.map((sub) => {
                          const k = data.counts[sub.code] ?? ZERO;
                          const hasAny = k.notes + k.questions + k.flashcards > 0;
                          const href =
                            variant === "notes"
                              ? data.hrefs.notes[sub.code]
                              : variant === "questions"
                                ? data.hrefs.questions[sub.code]
                                : variant === "flashcards"
                                  ? data.hrefs.flashcards[sub.code]
                                  : data.hrefs.notes[sub.code] ?? data.hrefs.questions[sub.code] ?? undefined;
                          const countLabel =
                            variant === "questions"
                              ? `${k.questions} question${k.questions === 1 ? "" : "s"}`
                              : variant === "flashcards"
                                ? `${k.flashcards} card${k.flashcards === 1 ? "" : "s"}`
                                : `${k.notes} note${k.notes === 1 ? "" : "s"}`;
                          const row = (
                            <>
                              <ProgressRing course={course} subtopic={sub.code} counts={k} size={16} />
                              <span className="min-w-0 flex-1 truncate">{sub.title}</span>
                              {hasAny && (
                                <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">
                                  {countLabel}
                                </span>
                              )}
                            </>
                          );
                          return (
                            <li key={sub.code}>
                              {href ? (
                                <Link
                                  href={href}
                                  onClick={() => setOpen(false)}
                                  aria-current={activeSubtopic === sub.code ? "true" : undefined}
                                  className={cn(
                                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                                    activeSubtopic === sub.code
                                      ? "bg-primary/10 font-medium text-primary"
                                      : "text-foreground/75 hover:bg-muted hover:text-foreground",
                                  )}
                                >
                                  {row}
                                </Link>
                              ) : (
                                <span
                                  title="No resources for this sub-topic in the demo bundle yet"
                                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground/55"
                                >
                                  {row}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-14 left-0 w-72 border-r bg-background">{sidebar}</div>
        </div>
      )}

      {/* desktop sidebar */}
      <aside
        className={cn(
          "sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 border-r bg-background transition-all lg:block",
          hidden ? "w-0 overflow-hidden border-r-0" : "w-72",
        )}
        aria-label="Course navigation"
      >
        {sidebar}
      </aside>

      {/* content column */}
      <div className="min-w-0 flex-1">
        <div className="sticky top-14 z-30 flex items-center gap-2 border-b bg-background/90 px-4 py-2 backdrop-blur lg:hidden">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <Menu className="size-4" aria-hidden /> Menu
          </Button>
          <span className="truncate text-sm font-medium">{data.course.subject}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
