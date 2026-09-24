"use client";

/**
 * Test Builder — teacher workspace (TEACHER-2, builder pass).
 *
 * Demo implementation of TEACHER_ARCHITECTURE.md §6, now functionally
 * aligned with the Save My Exams Test Builder (the 6 saved /TestBuilder
 * pages in the SME corpus repo):
 *
 *   ── two-zone builder layout ──────────────────────────────────────────
 *   LEFT  · question bank: topic filter tree, difficulty chips, question
 *           cards with preview + marks/difficulty badges and an explicit
 *           "Add" affordance (SME: bank rows + "Add question to test");
 *           "Load more" pagination.
 *   RIGHT · "Your test": editable test name (SME: AssessmentNameInput),
 *           "N questions · M marks" summary with a progress ring toward
 *           the marks target (SME: ProgressRing), Questions / Mark scheme
 *           tabs (SME parity), per-question move up/down/remove (SME
 *           context menu), and an empty state ("Select questions to
 *           start building your test").
 *   Download modal (SME: Download flow): pick the copy — student handout
 *   (Questions) or teacher copy (Questions + mark scheme) — plus PDF
 *   settings: include cover page, answer space lines for open-response
 *   parts, "don't split over a page break"; a running Total.
 *
 *   ── syllabai additions kept from the previous passes ─────────────────
 *   - auto-build from the class's weak areas (SAMPLE cohort evidence,
 *     transparent reasons) with the stale-preview banner ("update
 *     preview" instead of silently destroying the paper);
 *   - provenance on every part (subtopic, spec points, source paper);
 *   - saved tests persist the EXPLICIT question list (fixes the old
 *     controls-only save semantics); legacy saves fall back to controls;
 *   - corpus choice-text repair at render (camel-boundary space).
 * Export = browser print (print CSS hides the app chrome).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ClipboardList,
  Download,
  FileText,
  Loader2,
  Minus,
  Plus,
  Printer,
  Save,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Markdown } from "@/components/markdown";
import { TeacherNav } from "@/components/teacher/teacher-nav";
import { useSavedTests } from "@/lib/teacher/stores";
import type { TeacherCourseData } from "@/lib/teacher/types";
import type { AssembledQuestion, AssembledTest } from "@/lib/teacher/test-assembly";
import type { SwitchableCourse } from "@/lib/teacher/types";

const REASON_LABELS: Record<string, string> = {
  LOW_MEAN_MASTERY: "low class mastery",
  ACTIVE_MISCONCEPTION_PRESENT: "active misconceptions",
};

const WEAK_LANE_CAP = 6;
const BANK_PAGE = 40;

type DifficultyFilter = "all" | "easy" | "medium" | "hard";

interface WeakTarget {
  code: string;
  title: string;
  reasons: string[];
  meanMastery: number;
  misconceptionCount: number;
  questionCount: number;
}

type BankQuestion = AssembledQuestion & { preview: string };

interface BankState {
  course: AssembledTest["course"];
  questions: BankQuestion[];
  total: number;
  nextOffset: number | null;
}

interface PdfSettings {
  copy: "student" | "teacher";
  coverPage: boolean;
  answerSpace: boolean;
  answerLines: number;
  noSplit: boolean;
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

function difficultyBadgeClass(d: string | null): string {
  switch ((d ?? "").toLowerCase()) {
    case "easy":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "medium":
      return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "hard":
      return "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400";
    default:
      return "";
  }
}

/** Progress ring toward the marks target (SME: ProgressRing). */
function ProgressRing({ value, max }: { value: number; max: number | null }) {
  const pct = max && max > 0 ? Math.min(1, value / max) : 0;
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-flex size-9 shrink-0 items-center justify-center"
      role="img"
      aria-label={
        max && max > 0 ? `${value} of ${max} marks (${Math.round(pct * 100)}%)` : `${value} marks`
      }
    >
      <svg viewBox="0 0 36 36" className="size-9 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-muted" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={
            max && value >= max ? "stroke-emerald-500" : "stroke-primary transition-[stroke-dashoffset] duration-500"
          }
        />
      </svg>
      <span className="absolute text-[9px] font-bold">{max && max > 0 ? `${Math.round(pct * 100)}%` : value}</span>
    </span>
  );
}

/** Cover page block (SME: "Include cover page") — screen preview + print. */
function CoverPage({
  title,
  course,
  totalMarks,
  questionCount,
}: {
  title: string;
  course: AssembledTest["course"];
  totalMarks: number;
  questionCount: number;
}) {
  return (
    <section
      aria-label="Cover page"
      className="mb-6 rounded-lg border-2 border-foreground/20 p-6 text-center print:rounded-none print:border-0 print:break-after-page"
    >
      <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        {course.level} · {course.code}
      </p>
      <h2 className="mt-3 font-display text-3xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {course.subject} — class test
      </p>
      <div className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-x-6 gap-y-2 text-sm" aria-hidden>
        <span className="text-left text-muted-foreground">Total marks</span>
        <span className="text-right font-medium">{totalMarks}</span>
        <span className="text-left text-muted-foreground">Questions</span>
        <span className="text-right font-medium">{questionCount}</span>
        <span className="text-left text-muted-foreground">Suggested time</span>
        <span className="text-right font-medium">≈ {totalMarks} min</span>
      </div>
      <div className="mx-auto mt-8 max-w-sm space-y-5 text-left text-sm">
        <p>
          Name: <span className="ml-1 inline-block w-56 border-b border-foreground/40" aria-hidden />
        </p>
        <p>
          Class: <span className="ml-1 inline-block w-56 border-b border-foreground/40" aria-hidden />
        </p>
        <p>
          Date: <span className="ml-1 inline-block w-56 border-b border-foreground/40" aria-hidden />
        </p>
      </div>
      <p className="mx-auto mt-8 max-w-sm text-left text-xs leading-relaxed text-muted-foreground">
        Answer <span className="font-medium text-foreground">all</span> questions. Show all
        working — marks are awarded for method as well as the final answer.
      </p>
    </section>
  );
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

  // ── bank browser state ──────────────────────────────────────────────────
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [bank, setBank] = useState<BankState | null>(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [expandedBank, setExpandedBank] = useState<Set<string>>(new Set());
  const [showAllWeak, setShowAllWeak] = useState(false);

  // ── auto-build controls ─────────────────────────────────────────────────
  const [mode, setMode] = useState<"marks" | "count">("marks");
  const [targetMarks, setTargetMarks] = useState<string>("40");
  const [maxQuestions, setMaxQuestions] = useState<string>("20");

  // ── your-test state ─────────────────────────────────────────────────────
  const [test, setTest] = useState<AssembledTest | null>(null);
  const [stale, setStale] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [testName, setTestName] = useState("");
  const [tab, setTab] = useState<"questions" | "scheme">("questions");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [pdf, setPdf] = useState<PdfSettings>({
    copy: "teacher",
    coverPage: false,
    answerSpace: true,
    answerLines: 3,
    noSplit: true,
  });

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

  // ── bank listing (debounced filter → fetch page 0; loadMore appends) ────
  const bankKey = useMemo(
    () => `${course ?? ""}|${[...selected].sort().join(",")}|${difficulty}`,
    [course, selected, difficulty],
  );
  useEffect(() => {
    if (!course) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ slug: course, limit: String(BANK_PAGE) });
      if (selected.size > 0) params.set("subtopics", [...selected].join(","));
      if (difficulty !== "all") params.set("difficulty", difficulty);
      fetch(`/api/teacher/question-bank?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(`question bank unavailable (${res.status})`);
          return (await res.json()) as BankState;
        })
        .then((payload) => {
          if (!cancelled) {
            setBank(payload);
            setBankError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled)
            setBankError(err instanceof Error ? err.message : "failed to load questions");
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // bankKey is the canonical filter signature (course | topics | difficulty)
  }, [bankKey]);

  function loadMoreBank() {
    if (!course || !bank || bank.nextOffset === null || bankLoading) return;
    setBankLoading(true);
    const params = new URLSearchParams({
      slug: course,
      limit: String(BANK_PAGE),
      offset: String(bank.nextOffset),
    });
    if (selected.size > 0) params.set("subtopics", [...selected].join(","));
    if (difficulty !== "all") params.set("difficulty", difficulty);
    fetch(`/api/teacher/question-bank?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`question bank unavailable (${res.status})`);
        return (await res.json()) as BankState;
      })
      .then((payload) => {
        setBank((prev) =>
          prev
            ? {
                ...prev,
                questions: [...prev.questions, ...payload.questions],
                nextOffset: payload.nextOffset,
              }
            : payload,
        );
      })
      .catch((err: unknown) => {
        setBankError(err instanceof Error ? err.message : "failed to load questions");
      })
      .finally(() => setBankLoading(false));
  }

  // ── derived state ───────────────────────────────────────────────────────

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

  const inTestIds = useMemo(
    () => new Set(test?.questions.map((q) => q.id) ?? []),
    [test],
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

  const current = courses.find((c) => c.slug === course);
  const paperTitle = testName.trim() || `${test?.course.subject ?? current?.label ?? ""} — class test`;

  // ── actions ─────────────────────────────────────────────────────────────

  /** auto-build setting edits make the assembled preview stale — never
   *  destroy it; manual paper edits (add/move/remove) never do. */
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

  /** explicit question add (SME: "Add question to test") — edits the paper
   *  directly, no stale flag involved. */
  function addQuestion(q: BankQuestion) {
    setTest((prev) => {
      if (!prev) {
        if (!bank) return prev;
        return {
          course: bank.course,
          title: `${bank.course.subject} test — ${bank.course.code}`,
          questions: [q],
          totalMarks: q.marks,
          targetMarks: null,
          subtopics: [q.subtopic],
          generatedAt: new Date().toISOString(),
        };
      }
      if (prev.questions.some((x) => x.id === q.id)) return prev;
      const questions = [...prev.questions, q];
      return {
        ...prev,
        questions,
        totalMarks: questions.reduce((a, x) => a + x.marks, 0),
        subtopics: [...new Map(questions.map((x) => [x.subtopic.code, x.subtopic])).values()].sort(
          (a, b) => a.code.localeCompare(b.code),
        ),
      };
    });
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
      return {
        ...prev,
        questions: qs,
        totalMarks: qs.reduce((a, q) => a + q.marks, 0),
        subtopics: [...new Map(qs.map((x) => [x.subtopic.code, x.subtopic])).values()].sort(
          (a, b) => a.code.localeCompare(b.code),
        ),
      };
    });
  }

  /** auto-build (marks-aware deterministic fill over the selection). */
  const autoBuild = useCallback(async () => {
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
            mode === "count" ? Math.min(50, Math.max(1, Number(maxQuestions) || 20)) : null,
        }),
      });
      const payload = (await res.json()) as { test?: AssembledTest; error?: string };
      if (!res.ok || !payload.test) throw new Error(payload.error ?? "assembly failed");
      setTest(payload.test);
      setStale(false);
      setTab("questions");
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

  /** save the EXPLICIT test (question ids) — honest semantics; a selection
   *  without a test still saves its auto-build controls (legacy shape). */
  function onSaveTest() {
    if (!course) return;
    if (!test && selected.size === 0) return;
    const meta = courses.find((c) => c.slug === course);
    save({
      name:
        savedTestName.trim() ||
        testName.trim() ||
        (test
          ? `${test.course.label} — ${test.questions.length}q · ${test.totalMarks} marks`
          : `${meta?.label ?? course} — ${selected.size} subtopic${selected.size === 1 ? "" : "s"}`),
      course,
      courseCode: meta?.code ?? test?.course.code ?? "",
      subtopics: [...selected],
      targetMarks: mode === "marks" ? Number(targetMarks) || null : null,
      maxQuestions: mode === "count" ? Number(maxQuestions) || null : null,
      questionIds: test ? test.questions.map((q) => q.id) : undefined,
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
    if (t.questionIds && t.questionIds.length > 0) {
      // builder-era save — restore the explicit paper (order preserved)
      setBuilding(true);
      setBuildError(null);
      fetch(`/api/teacher/question-bank?slug=${encodeURIComponent(t.course)}&ids=${t.questionIds.join(",")}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(`saved questions unavailable (${res.status})`);
          return (await res.json()) as BankState;
        })
        .then((payload) => {
          setTest((prev) => {
            const base =
              prev && prev.course.slug === payload.course.slug
                ? prev
                : {
                    course: payload.course,
                    title: `${payload.course.subject} test — ${payload.course.code}`,
                    questions: [],
                    totalMarks: 0,
                    targetMarks: null,
                    subtopics: [],
                    generatedAt: new Date().toISOString(),
                  };
            const questions = payload.questions;
            return {
              ...base,
              questions,
              totalMarks: questions.reduce((a, q) => a + q.marks, 0),
              subtopics: [
                ...new Map(questions.map((x) => [x.subtopic.code, x.subtopic])).values(),
              ].sort((a, b) => a.code.localeCompare(b.code)),
            };
          });
          setStale(false);
          setTab("questions");
        })
        .catch((err: unknown) => {
          setBuildError(err instanceof Error ? err.message : "failed to restore saved test");
        })
        .finally(() => setBuilding(false));
    } else {
      // legacy save — controls only; the teacher re-runs the build
      setTest(null);
      setStale(false);
    }
  }

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
          Pick questions from the bank, arrange them, and print — or auto-build from the class&apos;s
          weakest areas. Every part keeps its corpus provenance; export a clean student handout or
          the full teacher copy with the mark scheme.
        </p>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] print:block">
        {/* ════ LEFT · question bank ══════════════════════════════════════ */}
        <section aria-label="Question bank" className="min-w-0 space-y-4 print:hidden">
          <Card className="py-0">
            <CardContent className="space-y-4 p-4">
              {loading && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> loading course bank…
                </p>
              )}
              {loadError && (
                <Alert variant="destructive">
                  <AlertTitle>Course data unavailable</AlertTitle>
                  <AlertDescription>{loadError}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
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
                        setBank(null);
                        setBankError(null);
                        setDifficulty("all");
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
                  <Label>Difficulty filter</Label>
                  <div
                    role="group"
                    aria-label="Difficulty filter"
                    className="flex h-9 items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
                  >
                    {(["all", "easy", "medium", "hard"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={difficulty === d}
                        onClick={() => setDifficulty(d)}
                        className={`h-8 flex-1 rounded-[5px] px-1 text-xs font-medium capitalize transition-colors ${
                          difficulty === d
                            ? "bg-background shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* auto-build controls (SME gap: our weakness-driven shortcut) */}
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Sparkles className="size-4 text-primary" aria-hidden />
                    Auto-build from weak areas
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={toggleAllWeak}
                    disabled={weakTargets.length === 0}
                  >
                    {weakTargets.every((w) => selected.has(w.code))
                      ? "Clear weak areas"
                      : "Select all weak areas"}
                  </Button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr_auto]">
                  <div
                    role="group"
                    aria-label="Targeting mode"
                    className="flex h-8 items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
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
                      className={`h-7 rounded-[5px] px-2 text-xs font-medium transition-colors ${
                        mode === "marks"
                          ? "bg-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Marks
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
                      className={`h-7 rounded-[5px] px-2 text-xs font-medium transition-colors ${
                        mode === "count"
                          ? "bg-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Questions
                    </button>
                  </div>
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
                    aria-label={mode === "marks" ? "Target marks" : "Max questions"}
                    className="h-8"
                  />
                  <Button
                    onClick={autoBuild}
                    disabled={building || selected.size === 0}
                    size="sm"
                    className="h-8"
                  >
                    <FileText className="size-3.5" aria-hidden />
                    {building ? "Assembling…" : stale && test ? "Update preview" : "Auto-build"}
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {mode === "marks"
                    ? `fill up to ${targetMarks || "…"} marks — closest total just above if exact is impossible · `
                    : `at most ${maxQuestions || "…"} questions, smallest first · `}
                  {weakTargets.length} flagged weak area{weakTargets.length === 1 ? "" : "s"} (top{" "}
                  {WEAK_LANE_CAP} shown)
                </p>
                <div className={`mt-2 space-y-1 ${showAllWeak ? "max-h-56 overflow-y-auto pr-1" : ""}`}>
                  {weakTargets.slice(0, showAllWeak ? undefined : WEAK_LANE_CAP).map((w) => (
                    <label
                      key={w.code}
                      className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selected.has(w.code)}
                        onCheckedChange={() => toggle(w.code)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="font-mono text-[10px] text-muted-foreground">{w.code}</span>{" "}
                        {w.title}
                        {w.reasons.map((r) => (
                          <Badge key={r} variant="outline" className="ml-1 h-4 px-1 text-[9px]">
                            {REASON_LABELS[r] ?? r}
                          </Badge>
                        ))}
                        <span className="block text-[10px] text-muted-foreground">
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

              {/* topic filter tree */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                  <Target className="size-3.5 text-muted-foreground" aria-hidden />
                  Topic filter
                  <span className="font-normal text-muted-foreground">
                    · {selected.size} of {allSubtopics.length} · {selectedMarks} marks in selection
                  </span>
                </p>
                <div className="max-h-64 space-y-2.5 overflow-y-auto rounded-md border p-2.5">
                  {data?.class.sections.map((section) => (
                    <div key={section.code}>
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        <span className="font-mono">{section.code}</span> {section.title}
                      </p>
                      <div className="mt-0.5 space-y-0.5">
                        {section.subtopics.map((sub) => (
                          <label
                            key={sub.code}
                            className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={selected.has(sub.code)}
                              onCheckedChange={() => toggle(sub.code)}
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              {sub.title}{" "}
                              <span className="text-[10px] text-muted-foreground">
                                · {sub.questionCount}q · {sub.totalMarks} marks
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* bank question cards */}
          <div className="space-y-2">
            <p className="flex items-center justify-between text-sm font-medium">
              Question bank
              {bank && (
                <span className="font-normal text-muted-foreground">
                  {bank.total} question{bank.total === 1 ? "" : "s"}
                  {selected.size > 0 ? " in filtered topics" : " in course"}
                </span>
              )}
            </p>
            {bankError && (
              <Alert variant="destructive">
                <AlertTitle>Question bank unavailable</AlertTitle>
                <AlertDescription>{bankError}</AlertDescription>
              </Alert>
            )}
            {bankLoading && bank === null && (
              <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> loading questions…
              </div>
            )}
            {bank?.questions.length === 0 && (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No questions match this filter — widen the topic selection or difficulty.
              </p>
            )}
            {bank?.questions.map((q) => {
              const inTest = inTestIds.has(q.id);
              const expanded = expandedBank.has(q.id);
              return (
                <article
                  key={q.id}
                  className="rounded-md border bg-card p-3 text-sm shadow-sm"
                  aria-label={`Bank question, ${pluralMarks(q.marks)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="h-5 px-1.5 font-mono text-[10px]">
                        [{q.marks}]
                      </Badge>
                      {q.difficulty && (
                        <Badge
                          variant="outline"
                          className={`h-5 px-1.5 text-[10px] ${difficultyBadgeClass(q.difficulty)}`}
                        >
                          {capDifficulty(q.difficulty)}
                        </Badge>
                      )}
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {q.subtopic.code} · {q.subtopic.title}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={inTest ? "secondary" : "default"}
                      className="h-7 shrink-0 gap-1 text-xs"
                      disabled={inTest}
                      onClick={() => addQuestion(q)}
                      aria-label={
                        inTest ? `Question already in test (${pluralMarks(q.marks)})` : `Add question to test (${pluralMarks(q.marks)})`
                      }
                    >
                      {inTest ? (
                        "In test"
                      ) : (
                        <>
                          <Plus className="size-3" aria-hidden /> Add
                        </>
                      )}
                    </Button>
                  </div>
                  <div className={expanded ? "mt-2" : "mt-2 line-clamp-3"}>
                    <Markdown className="text-[13px] [overflow-wrap:anywhere] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      {q.parts[0]?.problemMd ?? ""}
                    </Markdown>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedBank((prev) => {
                        const next = new Set(prev);
                        if (next.has(q.id)) next.delete(q.id);
                        else next.add(q.id);
                        return next;
                      })
                    }
                    className="mt-1 text-[11px] font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    {expanded ? "Show less" : "Show question"}
                  </button>
                  {q.parts.length > 1 && (
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {q.parts.length} part{q.parts.length === 1 ? "" : "s"}
                    </span>
                  )}
                </article>
              );
            })}
            {bank?.nextOffset !== null && bank && bank.nextOffset !== null && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={loadMoreBank}
                disabled={bankLoading}
              >
                {bankLoading ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : null}
                Load more questions ({bank.total - bank.questions.length} remaining)
              </Button>
            )}
          </div>
        </section>

        {/* ════ RIGHT · your test ═════════════════════════════════════════ */}
        <section
          ref={resultRef}
          aria-label="Your test"
          className="min-w-0 space-y-3 scroll-mt-24"
        >
          <div aria-live="polite" className="sr-only">
            {test
              ? `Your test — ${test.questions.length} questions, ${test.totalMarks} marks`
              : "Your test is empty"}
          </div>

          {/* test header row (screen only) */}
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Input
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              placeholder="Untitled test"
              aria-label="Test name (printed on the paper)"
              className="h-9 w-48 font-medium"
            />
            {test && (
              <span className="flex items-center gap-2 text-sm">
                <ProgressRing value={test.totalMarks} max={mode === "marks" ? Math.min(300, Math.max(1, Number(targetMarks) || 0)) || null : null} />
                <span className="text-sm font-medium">
                  {test.questions.length} question{test.questions.length === 1 ? "" : "s"} ·{" "}
                  {test.totalMarks} marks
                </span>
              </span>
            )}
            <span className="flex-1" />
            <div className="flex items-center gap-2">
              <Input
                value={savedTestName}
                onChange={(e) => setSavedTestName(e.target.value)}
                placeholder="Name to reuse…"
                aria-label="Name for saving this test"
                className="hidden h-8 w-36 text-xs xl:block"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={onSaveTest}
                disabled={!test && selected.size === 0}
              >
                <Save className="size-3.5" aria-hidden />
                Save
              </Button>
              {savedFlash && (
                <span className="text-xs font-medium text-emerald-600" role="status">
                  Saved
                </span>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs">
                    Your tests ({tests.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-1.5">
                  {tests.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">
                      Nothing saved yet — press “Save” to keep the current test (questions
                      included) for reuse.
                    </p>
                  ) : (
                    <ul className="max-h-72 space-y-0.5 overflow-y-auto">
                      {tests.map((t) => (
                        <li
                          key={t.id}
                          className="group flex items-center gap-1 rounded-md px-1 hover:bg-muted/60"
                        >
                          <button
                            type="button"
                            onClick={() => onLoadSaved(t.id)}
                            className="min-w-0 flex-1 py-1.5 text-left"
                          >
                            <span className="block truncate text-xs font-medium">{t.name}</span>
                            <span className="block text-[10px] text-muted-foreground">
                              {t.courseCode} ·{" "}
                              {t.questionIds
                                ? `${t.questionIds.length} question${t.questionIds.length === 1 ? "" : "s"} saved`
                                : t.targetMarks !== null
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
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setDownloadOpen(true)}
                disabled={!test}
              >
                <Download className="size-3.5" aria-hidden />
                Download PDF
              </Button>
              {test && course && (
                <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                  <Link
                    href={`/teacher/assignments?course=${course}&subtopics=${test.subtopics
                      .map((s) => s.code)
                      .join(",")}`}
                  >
                    Assign
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {stale && test && (
            <Alert className="border-amber-500/40 bg-amber-500/5 print:hidden">
              <AlertTitle>Preview is out of date</AlertTitle>
              <AlertDescription>
                The weak-area selection or target changed since this test was auto-built — press
                “Update preview” to rebuild. Questions you added by hand are kept in the paper.
              </AlertDescription>
            </Alert>
          )}

          {buildError && (
            <Alert variant="destructive" className="print:hidden">
              <AlertTitle>Could not assemble the test</AlertTitle>
              <AlertDescription>{buildError}</AlertDescription>
            </Alert>
          )}

          {unrepresented.length > 0 && mode === "marks" && (
            <p className="text-xs text-muted-foreground print:hidden">
              With this target, {unrepresented.length} selected subtopic
              {unrepresented.length === 1 ? " didn’t" : "s didn’t"} make it into the auto fill (
              {unrepresented.map((s) => s.code).join(", ")}). Raise the target or switch to
              question count.
            </p>
          )}

          {/* Questions | Mark scheme tabs (SME parity; print always prints the paper) */}
          <div role="tablist" aria-label="Test views" className="flex h-9 w-fit items-center gap-0.5 rounded-md border bg-muted/40 p-0.5 print:hidden">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "questions"}
              onClick={() => setTab("questions")}
              className={`h-8 rounded-[5px] px-3 text-xs font-medium transition-colors ${
                tab === "questions"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Questions
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "scheme"}
              onClick={() => setTab("scheme")}
              className={`h-8 rounded-[5px] px-3 text-xs font-medium transition-colors ${
                tab === "scheme"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Mark scheme
            </button>
          </div>

          {/* ── the paper (screen preview + print sheet) ── */}
          <article
            aria-label="Test paper"
            className={`space-y-4 rounded-lg border bg-card p-5 sm:p-8 print:border-0 print:shadow-none ${
              tab === "questions" ? "" : "hidden print:block"
            }`}
          >
            {test && pdf.copy === "teacher" && (
              <p className="rounded bg-muted/50 px-3 py-1.5 text-[10px] text-muted-foreground print:hidden">
                Teacher copy — spec codes, sources and the mark scheme are on the paper. Switch to
                the student copy in “Download PDF” for the clean handout.
              </p>
            )}
            {test ? (
              <>
                {pdf.coverPage && (
                  <CoverPage
                    title={paperTitle}
                    course={test.course}
                    totalMarks={test.totalMarks}
                    questionCount={test.questions.length}
                  />
                )}
                <header className="border-b pb-3">
                  <h3 className="font-display text-xl font-semibold">{paperTitle}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {test.course.label} ({test.course.code}) · {test.course.level} · total{" "}
                    {pluralMarks(test.totalMarks)}
                    {pdf.copy === "teacher" && test.targetMarks
                      ? ` · target ${test.targetMarks}`
                      : ""}{" "}
                    · name: ______________
                  </p>
                </header>

                {test.questions.map((q, qi) => (
                  <TestQuestion
                    key={q.id}
                    q={q}
                    index={qi}
                    total={test.questions.length}
                    forStudent={pdf.copy === "student"}
                    noSplit={pdf.noSplit}
                    answerSpace={pdf.answerSpace}
                    answerLines={pdf.answerLines}
                    onMove={moveQuestion}
                    onRemove={removeQuestion}
                  />
                ))}

                {pdf.copy === "teacher" && (
                  <footer className="border-t pt-2 text-[10px] leading-relaxed text-muted-foreground">
                    Assembled by the syllabai-demo Test Builder from the committed, validated
                    question corpus — every part cites its spec points and source paper. No
                    AI-generated content is included. Assembled{" "}
                    {new Date(test.generatedAt).toLocaleString()}.
                  </footer>
                )}
              </>
            ) : (
              <div className="py-10 text-center print:hidden">
                <p className="font-medium">Your test is empty</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Select questions to start building your test — add them from the bank on the
                  left, or auto-build from the class&apos;s weakest areas.
                </p>
              </div>
            )}
          </article>

          {/* ── mark scheme tab (screen reading; prints inline on the paper) ── */}
          <div
            role="tabpanel"
            aria-label="Mark scheme"
            className={tab === "scheme" ? "space-y-3" : "hidden"}
          >
            {test && test.questions.length > 0 ? (
              test.questions.map((q, qi) => (
                <Card key={`scheme-${q.id}`} className="py-0 print:hidden">
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold">
                      Question {qi + 1}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {q.subtopic.code} · {pluralMarks(q.marks)}
                      </span>
                    </p>
                    <div className="mt-2 space-y-2 pl-3">
                      {q.parts.map((p) => (
                        <div key={`scheme-${p.id}`}>
                          <p className="text-[11px] font-medium text-muted-foreground">
                            ({String.fromCharCode(97 + p.order)}) [{p.marks}]
                            {p.sourcePaper &&
                              (p.sourcePaper.date || p.sourcePaper.number) &&
                              ` · scheme from ${[p.sourcePaper.date, p.sourcePaper.number]
                                .filter(Boolean)
                                .join(" ")}`}
                          </p>
                          {p.solutionMd ? (
                            <Markdown className="text-[13px] [&]:[overflow-wrap:anywhere]">
                              {p.solutionMd}
                            </Markdown>
                          ) : (
                            <p className="text-xs italic text-muted-foreground">
                              mark scheme not captured for this part
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground print:hidden">
                The mark scheme appears here once the test has questions.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* ── Download PDF modal (SME: download flow + PDF settings) ── */}
      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent className="sm:max-w-md print:hidden">
          <DialogHeader>
            <DialogTitle>Download PDF</DialogTitle>
            <DialogDescription>
              Pick the copy and paper settings, then print to PDF from the browser dialog.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Copy</Label>
              <div
                role="group"
                aria-label="Copy type"
                className="flex h-9 items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={pdf.copy === "student"}
                  onClick={() => setPdf((p) => ({ ...p, copy: "student" }))}
                  className={`h-8 flex-1 rounded-[5px] px-2 text-xs font-medium transition-colors ${
                    pdf.copy === "student"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Questions (student)
                </button>
                <button
                  type="button"
                  aria-pressed={pdf.copy === "teacher"}
                  onClick={() => setPdf((p) => ({ ...p, copy: "teacher" }))}
                  className={`h-8 flex-1 rounded-[5px] px-2 text-xs font-medium transition-colors ${
                    pdf.copy === "teacher"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  + Mark scheme (teacher)
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {pdf.copy === "student"
                  ? "Clean handout: no spec codes, sources, tier notes or answers; dotted answer space after open-response parts."
                  : "Full copy: provenance, spec codes, sources and the mark scheme printed under each question."}
              </p>
            </div>

            <fieldset className="space-y-2.5 rounded-md border p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">PDF settings</legend>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={pdf.coverPage}
                  onCheckedChange={(v) => setPdf((p) => ({ ...p, coverPage: v === true }))}
                />
                Include cover page
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={pdf.noSplit}
                  onCheckedChange={(v) => setPdf((p) => ({ ...p, noSplit: v === true }))}
                />
                Don’t split questions over a page break
              </label>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={pdf.answerSpace}
                    onCheckedChange={(v) => setPdf((p) => ({ ...p, answerSpace: v === true }))}
                  />
                  Answer space (open response)
                </label>
                {pdf.answerSpace && (
                  <span className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-6"
                      aria-label="Fewer answer lines"
                      disabled={pdf.answerLines <= 1}
                      onClick={() =>
                        setPdf((p) => ({ ...p, answerLines: Math.max(1, p.answerLines - 1) }))
                      }
                    >
                      <Minus className="size-3" aria-hidden />
                    </Button>
                    <span className="w-10 text-center text-xs" role="status">
                      {pdf.answerLines} lines
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-6"
                      aria-label="More answer lines"
                      disabled={pdf.answerLines >= 8}
                      onClick={() =>
                        setPdf((p) => ({ ...p, answerLines: Math.min(8, p.answerLines + 1) }))
                      }
                    >
                      <Plus className="size-3" aria-hidden />
                    </Button>
                  </span>
                )}
              </div>
            </fieldset>

            {test && (
              <p className="flex items-center gap-2 text-sm">
                <ProgressRing
                  value={test.totalMarks}
                  max={mode === "marks" ? Math.min(300, Math.max(1, Number(targetMarks) || 0)) || null : null}
                />
                <span>
                  Total: {test.questions.length} question
                  {test.questions.length === 1 ? "" : "s"} · {pluralMarks(test.totalMarks)}
                  {pdf.copy === "teacher" ? " · with mark scheme" : " · questions only"}
                </span>
              </p>
            )}

            <Button
              className="w-full"
              onClick={() => {
                setDownloadOpen(false);
                window.setTimeout(() => window.print(), 150);
              }}
              disabled={!test}
            >
              <Printer className="size-4" aria-hidden />
              Print {pdf.copy === "student" ? "student handout" : "teacher copy"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── paper question block (shared by screen preview and print) ──────────── */

function TestQuestion({
  q,
  index,
  total,
  forStudent,
  noSplit,
  answerSpace,
  answerLines,
  onMove,
  onRemove,
}: {
  q: AssembledQuestion;
  index: number;
  total: number;
  forStudent: boolean;
  noSplit: boolean;
  answerSpace: boolean;
  answerLines: number;
  onMove: (i: number, dir: -1 | 1) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className={noSplit ? "break-inside-avoid" : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">
          Question {index + 1}
          <span className="ml-2 font-normal text-muted-foreground">
            ({pluralMarks(q.marks)}
            {!forStudent && q.difficulty ? ` · ${capDifficulty(q.difficulty)}` : ""})
          </span>
        </p>
        <span className="flex shrink-0 items-center gap-0.5 print:hidden">
          {!forStudent && (
            <span className="mr-1 font-mono text-[10px] text-muted-foreground">
              {q.subtopic.code}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={`Move question ${index + 1} up`}
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
          >
            <ArrowUp className="size-3" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={`Move question ${index + 1} down`}
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
          >
            <ArrowDown className="size-3" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-destructive"
            aria-label={`Remove question ${index + 1}`}
            onClick={() => onRemove(index)}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        </span>
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
                {!forStudent && p.specPointCodes.length > 0 && (
                  <span className="ml-1 font-mono text-[10px]">
                    · {p.specPointCodes.join(", ")}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">[{p.marks}]</span>
            </div>
            <Markdown className="mt-1 [overflow-wrap:anywhere]">
              {forStudent ? stripTierLines(p.problemMd) : p.problemMd}
            </Markdown>
            {hasChoices && (
              <ul className="mt-1.5 list-none space-y-1 pl-1">
                {p.choices!.map((choice) => (
                  <li key={choice.label} className="text-[13px] [overflow-wrap:anywhere]">
                    <span className="font-medium">{choice.label})</span>{" "}
                    {normalizeChoiceText(choice.textMd)}
                  </li>
                ))}
              </ul>
            )}
            {!forStudent &&
              p.sourcePaper &&
              (p.sourcePaper.date ||
                p.sourcePaper.number ||
                p.sourcePaper.questionNumber !== null) && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  source:{" "}
                  {[p.sourcePaper.date, p.sourcePaper.number].filter(Boolean).join(" paper ")}
                  {p.sourcePaper.questionNumber !== null &&
                    ` · Q${p.sourcePaper.questionNumber}${p.sourcePaper.questionPart ?? ""}`}
                </p>
              )}
            {forStudent && answerSpace && !hasChoices && (
              <div className="mt-4 space-y-4" aria-hidden>
                {Array.from({ length: answerLines }).map((_, i) => (
                  <div key={i} className="border-b border-dotted border-muted-foreground/40" />
                ))}
              </div>
            )}
            {/* teacher print: mark scheme inline under each question */}
            {!forStudent && (
              <details className="mt-2 rounded bg-muted/40 p-2 print:open">
                <summary className="cursor-pointer text-xs font-medium">
                  Answer key — question {index + 1}
                </summary>
                <div className="mt-1 space-y-2 pl-3">
                  {q.parts.map((kp) => (
                    <div key={`key-${kp.id}`}>
                      <p className="text-[11px] font-medium text-muted-foreground">
                        ({String.fromCharCode(97 + kp.order)}) [{kp.marks}]
                        {kp.sourcePaper &&
                          (kp.sourcePaper.date || kp.sourcePaper.number) &&
                          ` · scheme from ${[kp.sourcePaper.date, kp.sourcePaper.number]
                            .filter(Boolean)
                            .join(" ")}`}
                      </p>
                      {kp.solutionMd ? (
                        <Markdown className="[& _p]:text-xs [&]:[overflow-wrap:anywhere]">
                          {kp.solutionMd}
                        </Markdown>
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
        );
      })}
    </div>
  );
}
