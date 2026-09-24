"use client";

/**
 * Test Builder — teacher workspace (TEACHER-2, UX hardening pass).
 *
 * Demo implementation of TEACHER_ARCHITECTURE.md §6 with the production
 * TestBuilderView (P9) interaction rules:
 *   flow: choose subject → choose content (topic tree) → target (marks /
 *   question count) → generate → preview → print; a class-weakness lane
 *   proposes targets from the SAMPLE cohort evidence with transparent
 *   reasons (never a composite score), and every assembled question keeps
 *   its corpus provenance (subtopic, spec points, source paper).
 * Export = browser print (print CSS hides the app chrome); saved tests
 * persist locally for reuse.
 *
 * UX pass (2026-09-24), calibrated against the saved Save My Exams
 * Test Builder references (/TestBuilder *.html in the SME corpus repo):
 *   - editing controls no longer destroys the assembled preview — the paper
 *     goes stale and an "update preview" banner appears (SME: "Changes have
 *     been made → Update preview");
 *   - sticky generate bar + scroll-to-preview on assemble;
 *   - weakness lane capped at a top-6 signal with expand;
 *   - student copy / teacher copy print modes (SME: Questions / Mark scheme
 *     tabs) — the student handout drops provenance, spec codes, tier notes
 *     and the key, and gains answer space lines (SME: "Answer space");
 *   - per-question move up/down/remove in the preview (SME parity);
 *   - test name flows onto the paper header (SME: "Test name");
 *   - segmented marks / question-count mode with plain-language helpers;
 *   - saved tests in a popover with per-item delete + save confirmation;
 *   - subject dropdown grouped by qualification, deduped, sorted.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ClipboardList,
  FileText,
  Loader2,
  Printer,
  Save,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Markdown } from "@/components/markdown";
import { TeacherNav } from "@/components/teacher/teacher-nav";
import { useSavedTests } from "@/lib/teacher/stores";
import type { TeacherCourseData } from "@/lib/teacher/types";
import type { AssembledTest } from "@/lib/teacher/test-assembly";
import type { SwitchableCourse } from "@/lib/teacher/types";

const REASON_LABELS: Record<string, string> = {
  LOW_MEAN_MASTERY: "low class mastery",
  ACTIVE_MISCONCEPTION_PRESENT: "active misconceptions",
};

const WEAK_LANE_CAP = 6;

interface WeakTarget {
  code: string;
  title: string;
  reasons: string[];
  meanMastery: number;
  misconceptionCount: number;
  questionCount: number;
}

/** Corpus choice strings sometimes glue two "Label: value" segments together
 *  ("…: copperPositive electrode: …") — a camel-boundary space is a strict,
 *  conservative repair (choices only; prose is untouched). */
function normalizeChoiceText(s: string): string {
  return s.replace(/([a-z])([A-Z][a-z])/g, "$1 $2");
}

function capDifficulty(d: string | null): string | null {
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : null;
}

/** Student handouts drop the tier note ("Separate: Chemistry Only") —
 *  it is captured as a markdown heading ("#### Separate: …"). */
function stripTierLines(md: string): string {
  return md
    .split("\n")
    .filter((line) => !/^#{0,6}\s*separate\b/i.test(line.trim()))
    .join("\n");
}

function pluralMarks(n: number): string {
  return `${n} mark${n === 1 ? "" : "s"}`;
}

export function TestBuilderClient({
  courses,
  initialCourse,
  initialSubtopics,
}: {
  courses: SwitchableCourse[];
  initialCourse: string | null;
  initialSubtopics: string[];
}) {
  const [course, setCourse] = useState<string | null>(initialCourse);
  // course payload lives in ONE course-tagged state; loading/error derive from
  // it (no synchronous setState in the fetch effect — react-hooks lint rules)
  const [state, setState] = useState<{
    course: string;
    data?: TeacherCourseData;
    error?: string;
  } | null>(null);
  const loading = course !== null && state?.course !== course;
  const data = state?.course === course ? state.data : undefined;
  const loadError = state?.course === course ? state.error : undefined;
  const preselectRef = useRef(initialSubtopics);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSubtopics));
  const [mode, setMode] = useState<"marks" | "count">("marks");
  const [targetMarks, setTargetMarks] = useState<string>("40");
  const [maxQuestions, setMaxQuestions] = useState<string>("20");
  const [test, setTest] = useState<AssembledTest | null>(null);
  const [stale, setStale] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(true);
  const [showAllWeak, setShowAllWeak] = useState(false);
  const [testName, setTestName] = useState("");
  const [studentCopy, setStudentCopy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [savedTestName, setSavedTestName] = useState("");
  const { tests, save, remove } = useSavedTests();
  const resultRef = useRef<HTMLElement | null>(null);

  // load the course payload (bank stats + class evidence) per course switch;
  // state updates happen only in async callbacks, never synchronously
  useEffect(() => {
    if (!course) return;
    let cancelled = false;
    fetch(`/api/teacher/course-data?slug=${encodeURIComponent(course)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`course data unavailable (${res.status})`);
        return (await res.json()) as TeacherCourseData;
      })
      .then((payload) => {
        if (cancelled) return;
        setState({ course, data: payload });
        // deep-linked subtopic codes (class-graph remediation) preselect once
        const codes = preselectRef.current;
        if (codes.length > 0) {
          preselectRef.current = [];
          const valid = new Set(
            payload.class.sections.flatMap((s) => s.subtopics.map((t) => t.code)),
          );
          setSelected((prev) => {
            const next = new Set(prev);
            for (const code of codes) if (valid.has(code)) next.add(code);
            return next;
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({ course, error: err instanceof Error ? err.message : "failed to load course" });
      });
    return () => {
      cancelled = true;
    };
  }, [course]);

  // class-weakness lane (TEACHER_ARCHITECTURE §6.3) — transparent reasons
  const weakTargets: WeakTarget[] = useMemo(() => {
    if (!data) return [];
    const out: WeakTarget[] = [];
    for (const section of data.class.sections) {
      for (const sub of section.subtopics) {
        const reasons: string[] = [];
        if (sub.band === "weak" || sub.band === "critical") reasons.push("LOW_MEAN_MASTERY");
        if (sub.misconceptions.some((m) => m.probability >= 0.3))
          reasons.push("ACTIVE_MISCONCEPTION_PRESENT");
        if (reasons.length > 0) {
          out.push({
            code: sub.code,
            title: sub.title,
            reasons,
            meanMastery: sub.meanMastery,
            misconceptionCount: sub.misconceptions.length,
            questionCount: sub.questionCount,
          });
        }
      }
    }
    return out.sort((a, b) => a.meanMastery - b.meanMastery);
  }, [data]);

  const allSubtopics = useMemo(
    () => data?.class.sections.flatMap((s) => s.subtopics) ?? [],
    [data],
  );

  const selectedMarks = useMemo(
    () =>
      allSubtopics
        .filter((s) => selected.has(s.code))
        .reduce((acc, s) => acc + s.totalMarks, 0),
    [allSubtopics, selected],
  );

  const visibleWeak = useMemo(
    () => (showAllWeak ? weakTargets : weakTargets.slice(0, WEAK_LANE_CAP)),
    [weakTargets, showAllWeak],
  );

  // selected subtopics the current fill left unrepresented (marks mode)
  const unrepresented = useMemo(() => {
    if (!test) return [];
    const covered = new Set(test.subtopics.map((s) => s.code));
    return [...selected]
      .filter((c) => !covered.has(c))
      .map((c) => allSubtopics.find((s) => s.code === c))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
  }, [test, selected, allSubtopics]);

  // subject dropdown: dedupe identical label+code pairs, group by
  // qualification, sort inside groups; "Ict" casing fix at display level
  const courseGroups = useMemo(() => {
    const seen = new Set<string>();
    const deduped: SwitchableCourse[] = [];
    for (const c of [...courses].sort(
      (a, b) =>
        (a.level + a.label).localeCompare(b.level + b.label) ||
        a.slug.localeCompare(b.slug),
    )) {
      const key = `${c.label}|${c.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(c.label === "Ict" ? { ...c, label: "ICT" } : c);
    }
    const groups = new Map<string, SwitchableCourse[]>();
    for (const c of deduped) {
      const list = groups.get(c.level) ?? [];
      list.push(c);
      groups.set(c.level, list);
    }
    return [...groups.entries()];
  }, [courses]);

  /** control edits make the assembled preview stale — never destroy it */
  function markStale() {
    setStale((prev) => (test && !prev ? true : prev));
  }

  function toggle(code: string) {
    markStale();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleAllWeak() {
    if (weakTargets.length === 0) return;
    markStale();
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = weakTargets.every((w) => next.has(w.code));
      for (const w of weakTargets) {
        if (allIn) next.delete(w.code);
        else next.add(w.code);
      }
      return next;
    });
  }

  const generate = useCallback(async () => {
    if (!course || selected.size === 0) return;
    setBuilding(true);
    setBuildError(null);
    try {
      const res = await fetch("/api/teacher/assemble", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: course,
          subtopics: [...selected],
          // clamp to the API's accepted ranges (marks ≤ 300, questions ≤ 50)
          // so an out-of-range keystroke degrades gracefully instead of a 400
          targetMarks:
            mode === "marks"
              ? Math.min(300, Math.max(1, Number(targetMarks) || 0)) || null
              : null,
          maxQuestions:
            mode === "count"
              ? Math.min(50, Math.max(1, Number(maxQuestions) || 20))
              : null,
        }),
      });
      const payload = (await res.json()) as { test?: AssembledTest; error?: string };
      if (!res.ok || !payload.test) throw new Error(payload.error ?? "assembly failed");
      setTest(payload.test);
      setStale(false);
      setShowKey(true);
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "failed to assemble test";
      setBuildError(
        raw === "invalid payload"
          ? "The settings are out of range — use a marks target of 1–300 or up to 50 questions."
          : raw,
      );
    } finally {
      setBuilding(false);
    }
  }, [course, selected, mode, targetMarks, maxQuestions]);

  function onSaveTest() {
    if (!course || selected.size === 0) return;
    const meta = courses.find((c) => c.slug === course);
    save({
      name:
        savedTestName.trim() ||
        testName.trim() ||
        `${meta?.label ?? course} — ${selected.size} subtopic${selected.size === 1 ? "" : "s"}`,
      course,
      courseCode: meta?.code ?? "",
      subtopics: [...selected],
      targetMarks: mode === "marks" ? Number(targetMarks) || null : null,
      maxQuestions: mode === "count" ? Number(maxQuestions) || null : null,
    });
    setSavedTestName("");
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2200);
  }

  function onLoadSaved(id: string) {
    const t = tests.find((x) => x.id === id);
    if (!t) return;
    setCourse(t.course);
    setSelected(new Set(t.subtopics));
    setMode(t.targetMarks !== null ? "marks" : "count");
    setTargetMarks(t.targetMarks !== null ? String(t.targetMarks) : "40");
    setMaxQuestions(t.maxQuestions !== null ? String(t.maxQuestions) : "20");
    setTest(null);
    setStale(false);
  }

  function moveQuestion(i: number, dir: -1 | 1) {
    setTest((prev) => {
      if (!prev) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.questions.length) return prev;
      const qs = [...prev.questions];
      [qs[i], qs[j]] = [qs[j], qs[i]];
      return { ...prev, questions: qs };
    });
  }

  function removeQuestion(i: number) {
    setTest((prev) => {
      if (!prev) return prev;
      const qs = prev.questions.filter((_, k) => k !== i);
      return { ...prev, questions: qs, totalMarks: qs.reduce((a, q) => a + q.marks, 0) };
    });
  }

  const current = courses.find((c) => c.slug === course);
  const paperTitle = testName.trim() || `${test?.course.subject ?? current?.label ?? ""} — class test`;

  return (
    <div className="space-y-6">
      <TeacherNav />

      <header className="space-y-1.5 print:hidden">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-[10px] font-normal">
            <ClipboardList className="size-3" aria-hidden />
            Assessment · teacher
          </Badge>
          <Badge variant="secondary" className="text-[10px] font-normal">
            TEACHER_ARCHITECTURE §6
          </Badge>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Test Builder</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Assemble a printable test from the committed question bank — validated corpus content
          only, provenance retained on every part. Target the class&apos;s weakest areas from the
          SAMPLE cohort evidence, set a marks target, and print a clean student handout or the full
          teacher copy with the answer key.
        </p>
      </header>

      <Card className="py-0 print:hidden">
        <CardContent className="space-y-5 p-5">
          {/* subject + mode controls */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tb-course">Subject</Label>
              <div className="relative">
                <select
                  id="tb-course"
                  value={course ?? ""}
                  onChange={(e) => {
                    setCourse(e.target.value || null);
                    setSelected(new Set());
                    setTest(null);
                    setStale(false);
                  }}
                  className="h-9 w-full appearance-none rounded-md border bg-background pr-8 pl-3 text-sm"
                >
                  {courseGroups.map(([level, list]) => (
                    <optgroup key={level} label={level}>
                      {list.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.label} ({c.code})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Targeting</Label>
              <div
                role="group"
                aria-label="Targeting mode"
                className="flex h-9 items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={mode === "marks"}
                  onClick={() => {
                    if (mode !== "marks") {
                      setMode("marks");
                      markStale();
                    }
                  }}
                  className={`h-8 flex-1 rounded-[5px] px-2 text-xs font-medium transition-colors ${
                    mode === "marks"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Total marks
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "count"}
                  onClick={() => {
                    if (mode !== "count") {
                      setMode("count");
                      markStale();
                    }
                  }}
                  className={`h-8 flex-1 rounded-[5px] px-2 text-xs font-medium transition-colors ${
                    mode === "count"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Question count
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {mode === "marks"
                  ? "fill up to this total — if it can’t be hit exactly, the closest total just above is used"
                  : "include at most this many questions, smallest marks first"}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={mode === "marks" ? "tb-target" : "tb-max"}>
                {mode === "marks" ? "Target marks" : "Max questions"}
              </Label>
              <Input
                id={mode === "marks" ? "tb-target" : "tb-max"}
                type="number"
                min={1}
                max={mode === "marks" ? 300 : 50}
                value={mode === "marks" ? targetMarks : maxQuestions}
                onChange={(e) => {
                  markStale();
                  if (mode === "marks") setTargetMarks(e.target.value);
                  else setMaxQuestions(e.target.value);
                }}
                className="h-9"
              />
              <p className="text-xs text-muted-foreground">
                {selected.size} of {allSubtopics.length} selected · {selectedMarks} marks in
                selection
              </p>
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> loading course bank…
            </div>
          )}
          {loadError && (
            <Alert variant="destructive">
              <AlertTitle>Course data unavailable</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          )}

          {data && (
            <>
              {/* class-weakness lane — top-N signal, expandable */}
              {weakTargets.length > 0 && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Target className="size-4 text-primary" aria-hidden />
                      Target class weaknesses
                      <span className="font-normal text-muted-foreground">
                        · {weakTargets.length} flagged, weakest first
                      </span>
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={toggleAllWeak}>
                        {weakTargets.every((w) => selected.has(w.code))
                          ? "Clear weak areas"
                          : "Select all weak areas"}
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Derived from the SAMPLE cohort evidence — reasons are transparent, no composite
                    score.
                  </p>
                  <div
                    className={`mt-2 space-y-1 ${showAllWeak ? "max-h-72 overflow-y-auto pr-1" : ""}`}
                  >
                    {visibleWeak.map((w) => (
                      <label
                        key={w.code}
                        className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selected.has(w.code)}
                          onCheckedChange={() => toggle(w.code)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="font-mono text-xs text-muted-foreground">{w.code}</span>{" "}
                          {w.title}{" "}
                          {w.reasons.map((r) => (
                            <Badge key={r} variant="outline" className="ml-1 h-4 px-1 text-[10px]">
                              {REASON_LABELS[r] ?? r}
                            </Badge>
                          ))}
                          <span className="block text-xs text-muted-foreground">
                            mean mastery {(w.meanMastery * 100).toFixed(0)}% ·{" "}
                            {w.misconceptionCount > 0 &&
                              `${w.misconceptionCount} misconception${w.misconceptionCount === 1 ? "" : "s"} · `}
                            {w.questionCount} validated question{w.questionCount === 1 ? "" : "s"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {weakTargets.length > WEAK_LANE_CAP && (
                    <button
                      type="button"
                      onClick={() => setShowAllWeak((v) => !v)}
                      className="mt-2 text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                    >
                      {showAllWeak
                        ? "Show fewer"
                        : `Show all ${weakTargets.length} weak areas (top ${WEAK_LANE_CAP} shown)`}
                    </button>
                  )}
                </div>
              )}

              {/* topic tree */}
              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  {selected.size} of {allSubtopics.length} subtopics selected · {selectedMarks}{" "}
                  marks in selection
                </p>
                <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border p-3">
                  {data.class.sections.map((section) => (
                    <div key={section.code}>
                      <p className="text-xs font-semibold text-muted-foreground">
                        <span className="font-mono">{section.code}</span> {section.title}
                      </p>
                      <div className="mt-1 space-y-0.5">
                        {section.subtopics.map((sub) => (
                          <label
                            key={sub.code}
                            className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={selected.has(sub.code)}
                              onCheckedChange={() => toggle(sub.code)}
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              <span className="font-mono text-xs text-muted-foreground">
                                {sub.code}
                              </span>{" "}
                              {sub.title}{" "}
                              <span className="text-xs text-muted-foreground">
                                · {sub.questionCount} question{sub.questionCount === 1 ? "" : "s"} ·{" "}
                                {sub.totalMarks} marks
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* sticky action bar — the generate control must never be off-screen */}
      <div className="sticky top-14 z-30 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 shadow-sm backdrop-blur print:hidden">
        <p className="text-xs text-muted-foreground">
          {selected.size > 0
            ? `${selected.size} subtopic${selected.size === 1 ? "" : "s"} selected · ${selectedMarks} marks in selection`
            : "Select subtopics below to build a test"}
          {stale && test ? " · preview out of date" : ""}
        </p>
        <span className="flex-1" />
        <Button onClick={generate} disabled={building || selected.size === 0} size="sm" className="h-9">
          <FileText className="size-4" aria-hidden />
          {building ? "Assembling…" : stale && test ? "Update preview" : "Generate test"}
        </Button>
      </div>

      {/* save / reuse */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Save className="size-4 text-muted-foreground" aria-hidden />
        <Input
          value={savedTestName}
          onChange={(e) => setSavedTestName(e.target.value)}
          placeholder="Name this selection to reuse it later…"
          className="h-8 max-w-xs text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={onSaveTest}
          disabled={selected.size === 0}
        >
          Save test
        </Button>
        {savedFlash && (
          <span className="text-xs font-medium text-emerald-600" role="status">
            Saved
          </span>
        )}
        {selected.size > 0 && course && (
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link
              href={`/teacher/assignments?course=${course}&subtopics=${[...selected].join(",")}`}
            >
              Assign this test
            </Link>
          </Button>
        )}
        <span className="flex-1" />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={tests.length === 0}>
              Saved tests ({tests.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-1.5">
            {tests.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">
                Nothing saved yet — name a selection above and press “Save test”.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {tests.map((t) => (
                  <li key={t.id} className="group flex items-center gap-1 rounded-md px-1 hover:bg-muted/60">
                    <button
                      type="button"
                      onClick={() => onLoadSaved(t.id)}
                      className="min-w-0 flex-1 py-1.5 text-left"
                    >
                      <span className="block truncate text-xs font-medium">{t.name}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {t.courseCode} ·{" "}
                        {t.targetMarks !== null
                          ? `target ${t.targetMarks} marks`
                          : `max ${t.maxQuestions ?? 20} questions`}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => remove(t.id)}
                      aria-label={`Delete saved test ${t.name}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {buildError && (
        <Alert variant="destructive" className="print:hidden">
          <AlertTitle>Could not assemble the test</AlertTitle>
          <AlertDescription>{buildError}</AlertDescription>
        </Alert>
      )}

      {/* ── assembled test paper (screen preview + print sheet) ── */}
      {test && (
        <section ref={resultRef} aria-label="Assembled test" className="space-y-3 scroll-mt-24">
          <div aria-live="polite" className="sr-only">
            {`Assembled test — ${test.questions.length} questions, ${test.totalMarks} marks`}
          </div>

          {stale && (
            <Alert className="border-amber-500/40 bg-amber-500/5 print:hidden">
              <AlertTitle>Preview is out of date</AlertTitle>
              <AlertDescription>
                The selection or targeting changed since this test was assembled — press “Update
                preview” above to rebuild it.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <h2 className="text-sm font-semibold">
              Assembled test — {test.questions.length} question
              {test.questions.length === 1 ? "" : "s"} · {test.totalMarks} marks
              {test.targetMarks ? ` (target ${test.targetMarks})` : ""}
            </h2>
            <span className="flex-1" />
            <Input
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              placeholder="Test name…"
              aria-label="Test name (printed on the paper)"
              className="h-8 w-44 text-xs"
            />
            <div
              role="group"
              aria-label="Print copy"
              className="flex h-8 items-center gap-0.5 rounded-md border p-0.5"
            >
              <button
                type="button"
                aria-pressed={!studentCopy}
                onClick={() => setStudentCopy(false)}
                className={`h-7 rounded-[5px] px-2 text-xs font-medium transition-colors ${
                  !studentCopy ? "bg-muted" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Teacher copy
              </button>
              <button
                type="button"
                aria-pressed={studentCopy}
                onClick={() => setStudentCopy(true)}
                className={`h-7 rounded-[5px] px-2 text-xs font-medium transition-colors ${
                  studentCopy ? "bg-muted" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Student copy
              </button>
            </div>
            {!studentCopy && (
              <Button variant="ghost" size="sm" onClick={() => setShowKey((v) => !v)}>
                {showKey ? "Hide answer key" : "Show answer key"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" aria-hidden />
              {studentCopy ? "Print handout" : "Print"}
            </Button>
          </div>

          {mode === "marks" && unrepresented.length > 0 && (
            <p className="text-xs text-muted-foreground print:hidden">
              With this target, {unrepresented.length} selected subtopic
              {unrepresented.length === 1 ? " didn’t" : "s didn’t"} make it into the fill (
              {unrepresented.map((s) => s.code).join(", ")}). Raise the target or switch to question
              count.
            </p>
          )}

          {test.subtopics.length > 0 && !studentCopy && (
            <div className="flex flex-wrap gap-1.5 print:hidden">
              {test.subtopics.map((s) => (
                <Badge key={s.code} variant="outline" className="text-[10px]">
                  {s.code} · {s.title}
                </Badge>
              ))}
            </div>
          )}

          {/* the paper */}
          <article className="space-y-4 rounded-lg border bg-card p-5 sm:p-8 print:border-0 print:shadow-none">
            <header className="border-b pb-3">
              <h3 className="font-display text-xl font-semibold">{paperTitle}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {test.course.label} ({test.course.code}) · {test.course.level} · total{" "}
                {pluralMarks(test.totalMarks)}
                {!studentCopy && test.targetMarks ? ` · target ${test.targetMarks}` : ""} · name:
                ______________
              </p>
            </header>

            {test.questions.map((q, qi) => (
              <div key={q.id} className="break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold">
                    Question {qi + 1}
                    <span className="ml-2 font-normal text-muted-foreground">
                      ({pluralMarks(q.marks)}
                      {!studentCopy && q.difficulty ? ` · ${capDifficulty(q.difficulty)}` : ""})
                    </span>
                  </p>
                  {!studentCopy && (
                    <span className="flex shrink-0 items-center gap-0.5 print:hidden">
                      <span className="mr-1 font-mono text-[10px] text-muted-foreground">
                        {q.subtopic.code}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label={`Move question ${qi + 1} up`}
                        disabled={qi === 0}
                        onClick={() => moveQuestion(qi, -1)}
                      >
                        <ArrowUp className="size-3" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label={`Move question ${qi + 1} down`}
                        disabled={qi === test.questions.length - 1}
                        onClick={() => moveQuestion(qi, 1)}
                      >
                        <ArrowDown className="size-3" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove question ${qi + 1}`}
                        onClick={() => removeQuestion(qi)}
                      >
                        <X className="size-3.5" aria-hidden />
                      </Button>
                    </span>
                  )}
                </div>
                {q.parts.map((p) => {
                  const hasChoices =
                    p.choices && p.choices.length > 0 && p.choices.some((c) => c.label && c.textMd.trim());
                  return (
                    <div key={p.id} className="mt-2 pl-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-medium text-muted-foreground">
                          ({String.fromCharCode(97 + p.order)}){" "}
                          {p.commandWord && <span className="normal-case">{p.commandWord}</span>}
                          {!studentCopy && p.specPointCodes.length > 0 && (
                            <span className="ml-1 font-mono text-[10px]">
                              · {p.specPointCodes.join(", ")}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">[{p.marks}]</span>
                      </div>
                      <Markdown className="mt-1 [overflow-wrap:anywhere]">
                        {studentCopy ? stripTierLines(p.problemMd) : p.problemMd}
                      </Markdown>
                      {/* option content may live in the stem (composite image/table) —
                          the student player's hasUsableChoices rule: render text rows
                          only when the corpus captured actual option text */}
                      {hasChoices && (
                        <ul className="mt-1.5 list-none space-y-1 pl-1">
                          {p.choices!.map((choice) => (
                            <li
                              key={choice.label}
                              className="text-[13px] [overflow-wrap:anywhere]"
                            >
                              <span className="font-medium">{choice.label})</span>{" "}
                              {normalizeChoiceText(choice.textMd)}
                            </li>
                          ))}
                        </ul>
                      )}
                      {!studentCopy &&
                        p.sourcePaper &&
                        (p.sourcePaper.date ||
                          p.sourcePaper.number ||
                          p.sourcePaper.questionNumber !== null) && (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            source:{" "}
                            {[p.sourcePaper.date, p.sourcePaper.number]
                              .filter(Boolean)
                              .join(" paper ")}
                            {p.sourcePaper.questionNumber !== null &&
                              ` · Q${p.sourcePaper.questionNumber}${p.sourcePaper.questionPart ?? ""}`}
                          </p>
                        )}
                      {studentCopy && !hasChoices && (
                        <div className="mt-4 space-y-4" aria-hidden>
                          <div className="border-b border-dotted border-muted-foreground/40" />
                          <div className="border-b border-dotted border-muted-foreground/40" />
                          <div className="border-b border-dotted border-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {!studentCopy && showKey && (
                  <details className="mt-2 rounded bg-muted/40 p-2 print:open">
                    <summary className="cursor-pointer text-xs font-medium">
                      Answer key — question {qi + 1}
                    </summary>
                    <div className="mt-1 space-y-2 pl-3">
                      {q.parts.map((p) => (
                        <div key={`key-${p.id}`}>
                          <p className="text-[11px] font-medium text-muted-foreground">
                            ({String.fromCharCode(97 + p.order)}) [{p.marks}]
                            {p.sourcePaper &&
                              (p.sourcePaper.date || p.sourcePaper.number) &&
                              ` · scheme from ${[p.sourcePaper.date, p.sourcePaper.number]
                                .filter(Boolean)
                                .join(" ")}`}
                          </p>
                          {p.solutionMd ? (
                            <Markdown className="[& _p]:text-xs [&]:[overflow-wrap:anywhere]">{p.solutionMd}</Markdown>
                          ) : (
                            <p className="text-xs italic text-muted-foreground">
                              mark scheme not captured for this part
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}

            {!studentCopy && (
              <footer className="border-t pt-2 text-[10px] leading-relaxed text-muted-foreground">
                Assembled by the syllabai-demo Test Builder from the committed, validated question
                corpus — every part cites its spec points and source paper. No AI-generated content
                is included. Assembled {new Date(test.generatedAt).toLocaleString()}.
              </footer>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
