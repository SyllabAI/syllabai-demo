"use client";

/**
 * TopicTree — the numbered specification tree (SME's resource topic panel,
 * research §4): numbered topics with per-resource counts, expandable
 * sub-topic rows with progress rings, active-row highlighting. Consumed by
 * the desktop ResourcePanel and the mobile course drawer — one canonical
 * tree drives nav + progress everywhere.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ChevronGlyph, NumberedLabel } from "@/components/hub/chrome";
import { ProgressRing } from "@/components/hub/progress-ring";
import { topicRing, useCourseProgress, type Course } from "@/lib/progress";
import { cn } from "@/lib/utils";
import {
  useCourseData,
  resourceIndexHref,
  type SidebarData,
  type SidebarVariant,
} from "@/components/hub/course-data-context";

const ZERO = { notes: 0, questions: 0, flashcards: 0 };

/** Resolve the sub-topic code the current URL is looking at. */
export function useActiveSubtopic(variant: SidebarVariant): string | null {
  const data = useCourseData();
  const pathname = usePathname();
  const params = useSearchParams();

  return useMemo(() => {
    const q = params.get("subtopic");
    if (q) return q;
    if (variant === "notes") {
      const noteId = pathname.split("/revision-notes/")[1];
      if (noteId && data.noteSubtopic[noteId]) return data.noteSubtopic[noteId];
      return null;
    }
    if (variant === "questions" || variant === "flashcards") {
      const map = data.hrefs[variant];
      const hit = Object.entries(map).find(([, href]) => href === pathname);
      return hit?.[0] ?? null;
    }
    return null;
  }, [params, pathname, data, variant]);
}

export function TopicTree({
  data,
  variant,
  activeSubtopic,
}: {
  data: SidebarData;
  variant: SidebarVariant;
  activeSubtopic: string | null;
}) {
  const course = data.course.slug as Course;
  const progress = useCourseProgress(course);

  // active topic auto-expansion (render-phase adjustment, React-endorsed)
  const activeTopic = useMemo(() => {
    if (!activeSubtopic) return null;
    return data.tree.topics.find((t) => t.subtopics.some((s) => s.code === activeSubtopic))?.code ?? null;
  }, [activeSubtopic, data.tree.topics]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastActiveTopic, setLastActiveTopic] = useState<string | null | undefined>(undefined);
  if (lastActiveTopic !== activeTopic) {
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

  return (
    <ul className="space-y-0.5" aria-label="Specification topic tree">
      {data.tree.topics.map((topic) => {
        const isOpen = expanded.has(topic.code);
        const ring = topicRing(progress, topic.subtopics.map((s) => s.code), new Map(Object.entries(data.counts)));
        const subCount = topic.subtopics.length;
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
                  {subCount} Topics · {metaRight}
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
  );
}

/** "View all topics →" card + tree, shared by the resource panel and drawer. */
export function TopicTreeWithIndex({
  variant,
  activeSubtopic,
}: {
  variant: SidebarVariant;
  activeSubtopic: string | null;
}) {
  const data = useCourseData();
  const base = `/courses/${data.course.slug}`;
  return (
    <div>
      <Link
        href={resourceIndexHref(base, variant)}
        className="group mb-3 flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
      >
        View all topics
        <ArrowRight
          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
      <TopicTree data={data} variant={variant} activeSubtopic={activeSubtopic} />
    </div>
  );
}
