"use client";

/**
 * Question set player — the SME practice loop, ported (research §6.2–6.4):
 *   - difficulty tabs + question-number grid above the question list;
 *   - per-question toolbar: Full screen, Save (bookmark), difficulty chip;
 *   - structured questions: "How did you do?" self-score box (score / marks)
 *     → SIMULATED overlay → sidebar rings react;
 *   - "View answer" → full-screen mark-scheme modal (topic pill, question
 *     restated with Show more, AND-joined marking points with [N mark] tags);
 *   - "Question help" → the grounded tutor anchored to the question;
 *   - MCQ parts: A–D pills + Submit answer + instant marking when the corpus
 *     carries option text; otherwise an honest fallback (no fabricated options).
 */
import { useMemo, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, CheckCircle2, Maximize2, X, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Markdown } from "@/components/markdown";
import { SpecChip } from "@/components/provenance";
import {
  recordMcqAnswer,
  recordSelfScore,
  toggleSavedQuestion,
  useCourseProgress,
  type Course,
} from "@/lib/progress";
import type { ExamQuestion } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const DIFFICULTIES = ["all", "easy", "medium", "hard"] as const;
type Difficulty = (typeof DIFFICULTIES)[number];

export function QuestionPlayer({
  course,
  topicName,
  topicSlug,
  subtopicCode,
  subtopicTitle,
  questions,
}: {
  course: Course;
  topicName: string;
  topicSlug: string;
  subtopicCode: string | null;
  subtopicTitle: string | null;
  questions: ExamQuestion[];
}) {
  const progress = useCourseProgress(course);
  const [difficulty, setDifficulty] = useState<Difficulty>("all");
  const [schemeFor, setSchemeFor] = useState<ExamQuestion | null>(null);
  const [fullFor, setFullFor] = useState<ExamQuestion | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const c: Record<Difficulty, number> = { all: questions.length, easy: 0, medium: 0, hard: 0 };
    for (const q of questions) {
      const d = (q.difficulty as Difficulty) ?? "medium";
      if (d in c) c[d] += 1;
    }
    return c;
  }, [questions]);

  const visible = useMemo(
    () =>
      difficulty === "all"
        ? questions
        : questions.filter((q) => (q.difficulty ?? "medium") === difficulty),
    [questions, difficulty],
  );

  const isAttempted = (q: ExamQuestion) =>
    !!progress.selfScores[q.id] || !!progress.mcqAnswers[q.id];

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-5">
      {/* difficulty tabs + guided practice (SME controls, research §6.2) */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={difficulty === d}
              onClick={() => setDifficulty(d)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-medium capitalize transition-colors",
                difficulty === d
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {d === "all" ? "All" : d}
              <span className="ml-1.5 text-[11px] tabular-nums opacity-70">{counts[d]}</span>
            </button>
          ))}
        </div>
        <label className="ml-auto flex cursor-not-allowed items-center gap-2 text-[13px] text-muted-foreground" title="Adaptive sessions are Phase C of the build plan">
          Guided practice
          <Switch disabled aria-label="Guided practice (roadmap)" />
        </label>
      </div>

      {/* question number grid (SME) */}
      <div ref={gridRef} className="flex flex-wrap gap-1.5" aria-label="Jump to question">
        {visible.map((q, i) => (
          <button
            key={q.id}
            onClick={() => scrollTo(`q-${q.id}`)}
            aria-label={`Question ${i + 1}${isAttempted(q) ? " (attempted)" : ""}`}
            className={cn(
              "flex size-9 items-center justify-center rounded-md border text-[13px] font-medium transition-colors",
              isAttempted(q)
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:border-primary/50 hover:text-primary",
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* questions */}
      <div className="space-y-4">
        {visible.map((q, qi) => (
          <article key={q.id} id={`q-${q.id}`} className="scroll-mt-24 rounded-xl border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
              <span className="rounded-md bg-muted px-2 py-0.5 text-[13px] font-semibold">{qi + 1}</span>
              <Badge variant="outline" className="text-[10px]">
                {q.totalMarks} mark{q.totalMarks === 1 ? "" : "s"}
              </Badge>
              {q.difficulty && (
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {q.difficulty}
                </Badge>
              )}
              {isAttempted(q) && (
                <Badge variant="outline" className="border-emerald-300 text-[10px] text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="mr-0.5 size-3" aria-hidden /> attempted
                </Badge>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 px-2 text-xs"
                  onClick={() => setFullFor(q)}
                >
                  <Maximize2 className="size-3.5" aria-hidden /> Full screen
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 px-2 text-xs"
                  onClick={() => toggleSavedQuestion(course, q.id, topicSlug, subtopicCode)}
                  aria-pressed={!!progress.saved[q.id]}
                >
                  {progress.saved[q.id] ? (
                    <>
                      <BookmarkCheck className="size-3.5 text-primary" aria-hidden /> Saved
                    </>
                  ) : (
                    <>
                      <Bookmark className="size-3.5" aria-hidden /> Save
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="px-4 py-4">
              <QuestionBody
                course={course}
                question={q}
                topicSlug={topicSlug}
                subtopicCode={subtopicCode}
                subtopicTitle={subtopicTitle}
                onViewModel={() => setSchemeFor(q)}
              />
            </div>
          </article>
        ))}
        {visible.length === 0 && (
          <p className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No {difficulty} questions in this set.
          </p>
        )}
      </div>

      {/* full-screen question */}
      <Dialog open={!!fullFor} onOpenChange={(o) => !o && setFullFor(null)}>
        <DialogContent aria-describedby={undefined} className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {topicName}
              {fullFor && <Badge variant="outline" className="text-[10px]">{fullFor.totalMarks} marks</Badge>}
            </DialogTitle>
          </DialogHeader>
          {fullFor && (
            <QuestionBody
              course={course}
              question={fullFor}
              topicSlug={topicSlug}
              subtopicCode={subtopicCode}
              subtopicTitle={subtopicTitle}
              onViewModel={() => {
                setSchemeFor(fullFor);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <MarkSchemeDialog
        question={schemeFor}
        topicName={topicName}
        subtopicTitle={subtopicTitle}
        onClose={() => setSchemeFor(null)}
      />
    </div>
  );
}

// ── question body (shared by list + full-screen) ────────────────────────

function QuestionBody({
  course,
  question,
  topicSlug,
  subtopicCode,
  subtopicTitle,
  onViewModel,
}: {
  course: Course;
  question: ExamQuestion;
  topicSlug: string;
  subtopicCode: string | null;
  subtopicTitle: string | null;
  onViewModel: () => void;
}) {
  const progress = useCourseProgress(course);
  const [scoreDraft, setScoreDraft] = useState<string>("");
  const anchorSpec = question.parts.flatMap((p) => p.specPointCodes)[0] ?? null;
  const helpHref = `/tutor?q=${encodeURIComponent(
    `Help me with this exam question: ${firstLine(question)} — walk me through how to answer it`,
  )}${anchorSpec ? `&spec=${encodeURIComponent(anchorSpec)}` : ""}`;
  const recorded = progress.selfScores[question.id];

  return (
    <div className="space-y-4">
      {question.parts.map((p) => {
        if (p.questionType === "multiple_choice") {
          return (
            <McqPart
              key={p.id}
              course={course}
              part={p}
              questionId={question.id}
              topicSlug={topicSlug}
              subtopicCode={subtopicCode}
              onViewModel={onViewModel}
            />
          );
        }
        return (
          <div key={p.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {question.parts.length > 1 && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  part {p.order + 1}
                </Badge>
              )}
              {p.commandWord && (
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {p.commandWord}
                </Badge>
              )}
              <span>
                {p.marks} mark{p.marks === 1 ? "" : "s"}
              </span>
              {p.specPointCodes.map((c) => (
                <SpecChip key={c} code={c} />
              ))}
            </div>
            <Markdown>{p.problemMd}</Markdown>
          </div>
        );
      })}

      {/* SME self-marking footer (research §6.3, figure 10) */}
      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        <label className="flex items-center gap-2 text-[13px]">
          How did you do?
          <span className="inline-flex items-center gap-1">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={question.totalMarks}
              value={scoreDraft}
              onChange={(e) => setScoreDraft(e.target.value)}
              placeholder="–"
              aria-label={`Self score out of ${question.totalMarks}`}
              className="h-9 w-16 text-center"
            />
            <span className="text-muted-foreground">/ {question.totalMarks}</span>
          </span>
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={scoreDraft === "" || Number.isNaN(Number(scoreDraft))}
          onClick={() => {
            const v = Math.max(0, Math.min(question.totalMarks, Number(scoreDraft)));
            recordSelfScore(course, question.id, topicSlug, subtopicCode, v, question.totalMarks);
            setScoreDraft(String(v));
          }}
        >
          Save score
        </Button>
        {recorded && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" aria-hidden /> {recorded.score}/{recorded.max} recorded
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="gap-1.5 text-xs">
            <a href={helpHref}>Question help</a>
          </Button>
          <Button size="sm" variant="outline" onClick={onViewModel}>
            View answer
          </Button>
        </div>
      </div>
      {subtopicTitle && (
        <p className="text-[11px] text-muted-foreground">
          This question is anchored to <span className="font-medium">{subtopicTitle}</span>
          {subtopicCode ? <> ({subtopicCode})</> : null} — your self-mark feeds that sub-topic ring.
        </p>
      )}
    </div>
  );
}

// ── MCQ part ────────────────────────────────────────────────────────────

function parseOptions(problemMd: string): { letter: string; text: string }[] {
  const lines = problemMd.split("\n");
  const opts: { letter: string; text: string }[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*([A-D])[\.\)]\s+(.+)$/);
    if (m) opts.push({ letter: m[1], text: m[2].trim() });
  }
  return opts;
}

function parseCorrectOption(solutionMd: string | null): string | null {
  if (!solutionMd) return null;
  const m = solutionMd.match(/correct answer is\s*\**\s*([A-D])/i);
  return m ? m[1].toUpperCase() : null;
}

function McqPart({
  course,
  part,
  questionId,
  topicSlug,
  subtopicCode,
  onViewModel,
}: {
  course: Course;
  part: ExamQuestion["parts"][number];
  questionId: string;
  topicSlug: string;
  subtopicCode: string | null;
  onViewModel: () => void;
}) {
  const progress = useCourseProgress(course);
  const key = questionId; // MCQ questions carry a single choice part in the corpus
  const answer = progress.mcqAnswers[key];
  const options = useMemo(() => parseOptions(part.problemMd), [part.problemMd]);
  const correct = useMemo(() => parseCorrectOption(part.solutionMd), [part.solutionMd]);
  const [chosen, setChosen] = useState<string | null>(answer?.chosen ?? null);
  const [submitted, setSubmitted] = useState<boolean>(!!answer);

  return (
    <div className="space-y-3">
      <Markdown>{part.problemMd}</Markdown>
      {options.length > 0 ? (
        <>
          <p className="text-[13px] font-medium">Choose your answer</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="MCQ options">
            {options.map((o) => {
              const isChosen = chosen === o.letter;
              const isCorrect = submitted && correct === o.letter;
              const isWrongPick = submitted && isChosen && correct !== o.letter;
              return (
                <button
                  key={o.letter}
                  role="radio"
                  aria-checked={isChosen}
                  disabled={submitted}
                  onClick={() => setChosen(o.letter)}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                    isWrongPick
                      ? "border-rose-400 bg-rose-500/10"
                      : isCorrect
                        ? "border-emerald-400 bg-emerald-500/10"
                        : isChosen
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/50",
                  )}
                >
                  <span className="font-semibold text-primary">{o.letter}</span>
                  <span>{o.text}</span>
                  {isCorrect && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />}
                  {isWrongPick && <XCircle className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden />}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            {!submitted ? (
              <Button
                size="sm"
                disabled={!chosen}
                onClick={() => {
                  if (!chosen) return;
                  recordMcqAnswer(course, questionId, topicSlug, subtopicCode, chosen, correct === chosen);
                  setSubmitted(true);
                }}
              >
                Submit answer
              </Button>
            ) : (
              <p className={cn("text-[13px] font-medium", correct === chosen ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
                {correct === chosen ? "Correct — marked instantly." : `Not quite. The correct answer is ${correct ?? "in the mark scheme"}.`}
              </p>
            )}
            <Button size="sm" variant="outline" className="ml-auto" onClick={onViewModel}>
              View answer
            </Button>
          </div>
        </>
      ) : (
        <div className="rounded-md border border-amber-300 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          This is a multiple-choice question, but the option text (A–D) lives in the source image
          and was not captured by the import — the demo never fabricates content. Use{" "}
          <button className="font-medium underline underline-offset-2" onClick={onViewModel}>
            View answer
          </button>{" "}
          for the final answer and explanation.
        </div>
      )}
    </div>
  );
}

// ── mark scheme modal (SME full-screen scheme, research §6.3, figure 9) ─

function transformMarkTags(md: string): string {
  // "**[1]**" → "**[1 mark]**" so the corpus's own tags read like SME's
  return md.replace(/\*\*\[(\d+)\]\*\*/g, (_m, n) => `**[${n} mark${Number(n) === 1 ? "" : "s"}]**`);
}

function MarkSchemeDialog({
  question,
  topicName,
  subtopicTitle,
  onClose,
}: {
  question: ExamQuestion | null;
  topicName: string;
  subtopicTitle: string | null;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const restated = question ? firstLine(question) : "";
  const longRestate = restated.length > 220;

  return (
    <Dialog open={!!question} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="h-[92vh] max-w-4xl overflow-y-auto sm:h-[92vh]">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-medium">
              {subtopicTitle ?? topicName}
            </Badge>
            <span className="text-sm font-normal text-muted-foreground">Mark scheme</span>
          </DialogTitle>
        </DialogHeader>
        {question && (
          <div className="space-y-4">
            {question.parts.map((p) => (
              <section key={p.id} className="space-y-2 rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[13px] font-semibold">
                    {question.parts.length > 1 ? `${p.order + 1}` : "Q"}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {p.marks} mark{p.marks === 1 ? "" : "s"}
                  </span>
                </div>
                <div className={cn(!expanded && longRestate && "relative max-h-24 overflow-hidden")}>
                  <Markdown>{p.problemMd}</Markdown>
                  {!expanded && longRestate && (
                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" aria-hidden />
                  )}
                </div>
                {longRestate && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-primary" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? "Show less" : "Show more"}
                  </Button>
                )}
                {p.solutionMd && (
                  <div className="border-t pt-3">
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      The completed answer should show:
                    </p>
                    <Markdown>{transformMarkTags(p.solutionMd)}</Markdown>
                  </div>
                )}
              </section>
            ))}
            <p className="text-xs text-muted-foreground">
              Marking points are AND-joined in the corpus (all required for the mark). Self-mark
              honestly — your score writes to the SIMULATED overlay only.
            </p>
          </div>
        )}
        <button
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100"
          onClick={onClose}
          aria-label="Close mark scheme"
        >
          <X className="size-4" aria-hidden />
        </button>
      </DialogContent>
    </Dialog>
  );
}

function firstLine(q: ExamQuestion): string {
  const md = q.parts[0]?.problemMd ?? "";
  return md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("!["))[0]
    ?.slice(0, 220) ?? "this question";
}
