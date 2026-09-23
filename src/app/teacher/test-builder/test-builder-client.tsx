"use client";

/**
 * Test Builder — teacher workspace (TEACHER-2).
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
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ClipboardList,
  FileText,
  Loader2,
  Printer,
  Save,
  Target,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface WeakTarget {
  code: string;
  title: string;
  reasons: string[];
  meanMastery: number;
  misconceptionCount: number;
  questionCount: number;
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
  const [targetMarks, setTargetMarks] = useState<string>("40");
  const [useMarksTarget, setUseMarksTarget] = useState(true);
  const [maxQuestions, setMaxQuestions] = useState<string>("20");
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [test, setTest] = useState<AssembledTest | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(true);
  const [savedTestName, setSavedTestName] = useState("");
  const { tests, save, remove } = useSavedTests();

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

  function toggle(code: string) {
    setTest(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleAllWeak() {
    if (weakTargets.length === 0) return;
    setTest(null);
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
          targetMarks: useMarksTarget ? Math.max(1, Number(targetMarks) || 0) || null : null,
          maxQuestions: useMarksTarget ? null : Math.max(1, Number(maxQuestions) || 20),
        }),
      });
      const payload = (await res.json()) as { test?: AssembledTest; error?: string };
      if (!res.ok || !payload.test) throw new Error(payload.error ?? "assembly failed");
      setTest(payload.test);
      setShowKey(includeAnswers);
    } catch (err: unknown) {
      setBuildError(err instanceof Error ? err.message : "failed to assemble test");
    } finally {
      setBuilding(false);
    }
  }, [course, selected, useMarksTarget, targetMarks, maxQuestions, includeAnswers]);

  function onSaveTest() {
    if (!course || selected.size === 0) return;
    const meta = courses.find((c) => c.slug === course);
    save({
      name:
        savedTestName.trim() ||
        `${meta?.label ?? course} — ${selected.size} subtopic${selected.size === 1 ? "" : "s"}`,
      course,
      courseCode: meta?.code ?? "",
      subtopics: [...selected],
      targetMarks: useMarksTarget ? Number(targetMarks) || null : null,
      maxQuestions: useMarksTarget ? null : Number(maxQuestions) || null,
    });
    setSavedTestName("");
  }

  function onLoadSaved(id: string) {
    const t = tests.find((x) => x.id === id);
    if (!t) return;
    setCourse(t.course);
    setSelected(new Set(t.subtopics));
    setUseMarksTarget(t.targetMarks !== null);
    setTargetMarks(t.targetMarks !== null ? String(t.targetMarks) : "40");
    setMaxQuestions(t.maxQuestions !== null ? String(t.maxQuestions) : "20");
    setTest(null);
  }

  const current = courses.find((c) => c.slug === course);

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
          SAMPLE cohort evidence, set a marks target, and print with or without the answer key.
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
                  }}
                  className="h-9 w-full appearance-none rounded-md border bg-background pr-8 pl-3 text-sm"
                >
                  {courses.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label} ({c.code})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tb-target">Target marks {useMarksTarget ? "" : "(off)"}</Label>
              <Input
                id="tb-target"
                type="number"
                min={1}
                max={300}
                value={targetMarks}
                disabled={!useMarksTarget}
                onChange={(e) => {
                  setTest(null);
                  setTargetMarks(e.target.value);
                }}
                className="h-9"
              />
              <p className="text-xs text-muted-foreground">
                marks-aware fill — smallest overshoot when exact is impossible
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tb-max">Max questions {useMarksTarget ? "(off)" : ""}</Label>
              <Input
                id="tb-max"
                type="number"
                min={1}
                max={50}
                value={maxQuestions}
                disabled={useMarksTarget}
                onChange={(e) => {
                  setTest(null);
                  setMaxQuestions(e.target.value);
                }}
                className="h-9"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={useMarksTarget}
                  onCheckedChange={(v) => {
                    setTest(null);
                    setUseMarksTarget(v === true);
                  }}
                />
                use marks target instead
              </label>
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
              {/* class-weakness lane */}
              {weakTargets.length > 0 && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Target className="size-4 text-primary" aria-hidden />
                      Target class weaknesses
                    </p>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={toggleAllWeak}>
                      {weakTargets.every((w) => selected.has(w.code))
                        ? "Clear weak areas"
                        : "Select all weak areas"}
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Derived from the SAMPLE cohort evidence — reasons are transparent, no composite
                    score.
                  </p>
                  <div className="mt-2 space-y-1">
                    {weakTargets.map((w) => (
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
                </div>
              )}

              {/* topic tree */}
              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  {selected.size} of {allSubtopics.length} subtopics selected ·{" "}
                  {selectedMarks} marks available
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

              {/* actions */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeAnswers}
                    onCheckedChange={(v) => setIncludeAnswers(v === true)}
                  />
                  include answer key
                </label>
                <span className="flex-1" />
                <Button onClick={generate} disabled={building || selected.size === 0}>
                  <FileText className="size-4" aria-hidden />
                  {building ? "Assembling…" : "Generate test"}
                </Button>
              </div>

              {/* save / reuse */}
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
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
                {selected.size > 0 && course && (
                  <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                    <Link
                      href={`/teacher/assignments?course=${course}&subtopics=${[...selected].join(",")}`}
                    >
                      Assign this test
                    </Link>
                  </Button>
                )}
                {tests.length > 0 && (
                  <div className="relative">
                    <select
                      aria-label="Load a saved test"
                      defaultValue=""
                      onChange={(e) => {
                        onLoadSaved(e.target.value);
                        e.currentTarget.value = "";
                      }}
                      className="h-8 max-w-[16rem] appearance-none rounded-md border bg-background pr-7 pl-2 text-xs"
                    >
                      <option value="" disabled>
                        Load saved test ({tests.length})…
                      </option>
                      {tests.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 text-muted-foreground" />
                  </div>
                )}
                {tests.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground"
                    onClick={() => {
                      if (tests.length > 0 && window.confirm("Clear ALL saved tests?")) {
                        for (const t of tests) remove(t.id);
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Clear
                  </Button>
                )}
              </div>

              {buildError && (
                <Alert variant="destructive">
                  <AlertTitle>Could not assemble the test</AlertTitle>
                  <AlertDescription>{buildError}</AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── assembled test paper (screen preview + print sheet) ── */}
      {test && (
        <section aria-label="Assembled test" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <h2 className="text-sm font-semibold">
              Assembled test — {test.questions.length} question{test.questions.length === 1 ? "" : "s"}{" "}
              · {test.totalMarks} marks
              {test.targetMarks ? ` (target ${test.targetMarks})` : ""}
            </h2>
            <span className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" aria-hidden />
              Print
            </Button>
            {includeAnswers && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? "Hide answer key" : "Show answer key"}
              </Button>
            )}
          </div>

          {test.subtopics.length > 0 && (
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
              <h3 className="font-display text-xl font-semibold">
                {test.course.subject} — class test
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {test.course.label} ({test.course.code}) · {test.course.level} · total{" "}
                {test.totalMarks} marks
                {test.targetMarks ? ` · target ${test.targetMarks}` : ""} · name: ______________
              </p>
            </header>

            {test.questions.map((q, qi) => (
              <div key={q.id} className="break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold">
                    Question {qi + 1}
                    <span className="ml-2 font-normal text-muted-foreground">
                      ({q.marks} marks{q.difficulty ? ` · ${q.difficulty}` : ""})
                    </span>
                  </p>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {q.subtopic.code}
                  </span>
                </div>
                {q.parts.map((p) => (
                  <div key={p.id} className="mt-2 pl-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-medium text-muted-foreground">
                        ({String.fromCharCode(97 + p.order)}){" "}
                        {p.commandWord && <span className="normal-case">{p.commandWord}</span>}
                        {p.specPointCodes.length > 0 && (
                          <span className="ml-1 font-mono">{p.specPointCodes.join(", ")}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">[{p.marks}]</span>
                    </div>
                    <Markdown className="mt-1">{p.problemMd}</Markdown>
                    {/* option content may live in the stem (composite image/table) —
                        the student player's hasUsableChoices rule: render text rows
                        only when the corpus captured actual option text */}
                    {p.choices &&
                      p.choices.length > 0 &&
                      p.choices.some((c) => c.label && c.textMd.trim()) && (
                        <ul className="mt-1.5 list-none space-y-1 pl-1">
                          {p.choices.map((choice) => (
                            <li key={choice.label} className="text-[13px]">
                              <span className="font-medium">{choice.label})</span>{" "}
                              {choice.textMd}
                            </li>
                          ))}
                        </ul>
                      )}
                    {p.sourcePaper &&
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
                  </div>
                ))}

                {showKey && includeAnswers && (
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
                              ` · scheme from ${[p.sourcePaper.date, p.sourcePaper.number]
                                .filter(Boolean)
                                .join(" ")}`}
                          </p>
                          {p.solutionMd ? (
                            <Markdown className="[&_p]:text-xs">{p.solutionMd}</Markdown>
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

            <footer className="border-t pt-2 text-[10px] leading-relaxed text-muted-foreground">
              Assembled by the syllabai-demo Test Builder from the committed, validated question
              corpus — every part cites its spec points and source paper. No AI-generated content
              is included. Assembled {new Date(test.generatedAt).toLocaleString()}.
            </footer>
          </article>
        </section>
      )}
    </div>
  );
}
