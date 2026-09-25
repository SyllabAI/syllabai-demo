"use client";

/**
 * PaperViewerClient — one corpus paper, two modes (decided with the user):
 *
 *   view — traditional PDF mode. QP and MS panes (pdf.js, mobile-first);
 *          desktop shows a QP|MS split, mobile gets a sticky A/B toggle pill
 *          that keeps each document's scroll position (both panes stay
 *          mounted, the hidden one just isn't displayed).
 *
 *   mock — exam simulation. The QP goes fullscreen with the OFFICIAL exam
 *          duration (attested durations from the corpus mapping; unverified
 *          papers show an editable estimate, honestly labelled). Time-up or
 *          "Finish" hands over to the grading screen: the MS beside a mark
 *          tally the student enters themselves; the result is saved to the
 *          local SIMULATED overlay (lib/mock-results.ts) and never any
 *          canonical store.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  Hourglass,
  Info,
  Timer,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PdfPane } from "@/components/pastpapers/pdf-pane";
import { corpusRawUrl, type CorpusPaperEntry } from "@/lib/pastpapers-shared";
import { formatSpent, saveMockResult } from "@/lib/mock-results";

type Doc = "qp" | "ms" | "split";
type MockPhase = "intro" | "running" | "grading";

export interface PaperViewerClientProps {
  course: string;
  paper: CorpusPaperEntry;
  sessionLabelStr: string;
  initialDoc: Doc;
  mode: "view" | "mock";
  /** corpus provenance string for the honesty note */
  metaGeneratedAt: string;
}

export function PaperViewerClient({
  course,
  paper,
  sessionLabelStr,
  initialDoc,
  mode,
  metaGeneratedAt,
}: PaperViewerClientProps) {
  const router = useRouter();
  const isSplitCapable = Boolean(paper.qpBytes && paper.msBytes);
  const [doc, setDoc] = useState<Doc>(
    initialDoc === "ms" && !paper.msBytes
      ? "qp"
      : initialDoc === "split" && !isSplitCapable
        ? "qp"
        : initialDoc,
  );
  const [mockPhase, setMockPhase] = useState<MockPhase>(mode === "mock" ? "intro" : "grading");
  const [durationMin, setDurationMin] = useState<number>(paper.durationMin ?? 90);
  const [remainingSec, setRemainingSec] = useState(0);
  const [spentSec, setSpentSec] = useState(0);
  const [endedHow, setEndedHow] = useState<"time-up" | "self" | "exited">("self");
  const [marks, setMarks] = useState<string>("");
  const [total, setTotal] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const startedAtRef = useRef<number>(0);

  const qpUrl = paper.qpPath ? corpusRawUrl(paper.qpPath) : null;
  const msUrl = paper.msPath ? corpusRawUrl(paper.msPath) : null;
  const backHref = `/courses/${course}/past-papers`;

  // ── mock countdown ───────────────────────────────────────────────────────
  useEffect(() => {
    if (mockPhase !== "running") return;
    const iv = window.setInterval(() => {
      setSpentSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      setRemainingSec((r) => {
        if (r <= 1) {
          window.clearInterval(iv);
          setEndedHow("time-up");
          setMockPhase("grading");
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(iv);
  }, [mockPhase]);

  const beginMock = () => {
    startedAtRef.current = Date.now();
    setRemainingSec(durationMin * 60);
    setSpentSec(0);
    setSaved(false);
    setMarks("");
    setEndedHow("self");
    setMockPhase("running");
    // best-effort browser fullscreen (mobile Safari ignores it; the CSS
    // fullscreen overlay below is the real guarantee)
    try {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    } catch {
      /* unsupported — fine */
    }
  };

  const endMock = (how: "self" | "exited") => {
    setEndedHow(how);
    setMockPhase("grading");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  };

  const commitResult = () => {
    const m = Number.parseInt(marks, 10);
    const t = Number.parseInt(total, 10);
    if (Number.isNaN(m) || Number.isNaN(t)) return;
    saveMockResult({
      id: `${course}:${paper.sessionId}:${paper.dir}:${startedAtRef.current}`,
      course,
      ref: paper.ref,
      title: paper.title,
      sessionId: paper.sessionId,
      finishedAt: new Date().toISOString(),
      durationMin,
      timeUsedSec: spentSec,
      marks: m,
      total: t,
      ended: endedHow,
    });
    setSaved(true);
    window.setTimeout(() => router.push(backHref), 900);
  };

  const durationLabel = useMemo(() => {
    if (paper.durationMin == null) return "not verified";
    const h = Math.floor(paper.durationMin / 60);
    const m = paper.durationMin % 60;
    return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
  }, [paper.durationMin]);

  const mmss = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // ── MOCK: fullscreen running overlay ─────────────────────────────────────
  if (mockPhase === "running") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Badge variant="destructive" className="gap-1 font-mono tabular-nums" aria-live="off">
              <Timer className="size-3" aria-hidden />
              {mmss(remainingSec)}
            </Badge>
            <span className="min-w-0 truncate text-sm font-semibold">{paper.ref}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {paper.title} · {sessionLabelStr}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => endMock("self")}
            aria-label="Finish mock and grade"
          >
            <CheckCircle2 className="size-4" aria-hidden />
            Finish & grade
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            onClick={() => endMock("exited")}
            aria-label="Exit mock without grading"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <p className="shrink-0 bg-muted/50 px-3 py-1 text-center text-[11px] text-muted-foreground">
          Exam conditions — solve in your physical notebook. The mark scheme stays hidden until you
          finish.
        </p>
        {qpUrl ? (
          <PdfPane
            url={qpUrl}
            downloadUrl={qpUrl}
            label={`Question paper — ${paper.ref}`}
            active
            className="min-h-0 flex-1 rounded-none border-0"
          />
        ) : (
          <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No question paper held for this paper.
          </p>
        )}
      </div>
    );
  }

  // ── MOCK: grading screen ─────────────────────────────────────────────────
  if (mockPhase === "grading" && mode === "mock") {
    return (
      <div className="flex min-h-[70vh] flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="h-8">
            <Link href={backHref}>
              <ArrowLeft className="size-4" aria-hidden />
              Past Papers
            </Link>
          </Button>
          <Badge variant={endedHow === "time-up" ? "destructive" : "secondary"} className="gap-1">
            {endedHow === "time-up" ? (
              <>
                <Hourglass className="size-3" aria-hidden /> Time&apos;s up
              </>
            ) : (
              <>Finished in {formatSpent(spentSec)}</>
            )}
          </Badge>
          <span className="text-sm font-semibold">{paper.ref}</span>
          <span className="text-xs text-muted-foreground">Grade yourself against the mark scheme</span>
        </div>

        <Card className="border-dashed">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="mock-marks" className="text-sm">
                Your mark
              </Label>
              <Input
                id="mock-marks"
                type="number"
                min={0}
                inputMode="numeric"
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                placeholder="e.g. 54"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mock-total" className="text-sm">
                Out of (paper total)
              </Label>
              <Input
                id="mock-total"
                type="number"
                min={1}
                inputMode="numeric"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="e.g. 80"
                className="h-9"
              />
            </div>
            <Button onClick={commitResult} disabled={!marks.trim() || !total.trim() || saved} className="h-9">
              {saved ? (
                <>
                  <CheckCircle2 className="size-4" aria-hidden /> Saved
                </>
              ) : (
                "Save result"
              )}
            </Button>
          </CardContent>
        </Card>

        {msUrl ? (
          <PdfPane
            url={msUrl}
            downloadUrl={msUrl}
            label={`Mark scheme — ${paper.ref}`}
            active
            className="min-h-[60vh] flex-1"
          />
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No mark scheme is held for this paper yet.
          </p>
        )}
      </div>
    );
  }

  // ── MOCK: intro ──────────────────────────────────────────────────────────
  if (mode === "mock") {
    return (
      <div className="space-y-4">
        <Button asChild size="sm" variant="ghost" className="h-8">
          <Link href={backHref}>
            <ArrowLeft className="size-4" aria-hidden />
            Past Papers
          </Link>
        </Button>
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Timer className="size-5 text-primary" aria-hidden />
              <h2 className="text-lg font-semibold">Mock exam — {paper.ref}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {paper.title} · {sessionLabelStr} · {paper.specTitle}. The question paper goes
              fullscreen with a countdown; solve in your physical notebook. When you finish (or the
              time is up) you grade yourself against the official mark scheme and the result is
              saved to this browser.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Official duration
                </p>
                <p className="mt-1 text-sm font-semibold">{durationLabel}</p>
                {paper.durationMin == null && (
                  <p className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
                    <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                    Not attested for this paper — the pre-filled value below is an estimate, adjust
                    it before you begin.
                  </p>
                )}
              </div>
              <div className="space-y-1.5 rounded-lg border p-3">
                <Label htmlFor="mock-duration" className="text-sm">
                  Timer (minutes)
                </Label>
                <Input
                  id="mock-duration"
                  type="number"
                  min={5}
                  max={360}
                  value={durationMin}
                  onChange={(e) => {
                    const v = Number.parseInt(e.target.value, 10);
                    setDurationMin(Number.isNaN(v) ? 0 : Math.min(360, Math.max(5, v)));
                  }}
                  className="h-9 w-28"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={beginMock} disabled={durationMin < 5} className="gap-1.5">
                <Timer className="size-4" aria-hidden />
                Begin mock
              </Button>
              <Button asChild variant="outline">
                <Link href={`/courses/${course}/past-papers/${paper.sessionId}/${paper.dir}?doc=qp`}>
                  <BookOpenCheck className="size-4" aria-hidden />
                  Just view the paper
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── VIEW mode ────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-[75vh] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="ghost" className="h-8">
          <Link href={backHref}>
            <ArrowLeft className="size-4" aria-hidden />
            Past Papers
          </Link>
        </Button>
        <span className="font-mono text-sm font-semibold">{paper.ref}</span>
        <span className="text-xs text-muted-foreground">
          {paper.title}
          {paper.variantChip ? ` · ${paper.variantChip}` : ""} · {sessionLabelStr}
        </span>
        {/* doc switch — three states on desktop (QP | MS | Split) */}
        <div className="ml-auto hidden items-center gap-1 rounded-lg border p-1 sm:flex" role="tablist" aria-label="Document view">
          <Button
            size="sm"
            variant={doc === "qp" ? "secondary" : "ghost"}
            className="h-7 text-xs"
            aria-pressed={doc === "qp"}
            disabled={!qpUrl}
            onClick={() => setDoc("qp")}
          >
            Question paper
          </Button>
          <Button
            size="sm"
            variant={doc === "ms" ? "secondary" : "ghost"}
            className="h-7 text-xs"
            aria-pressed={doc === "ms"}
            disabled={!msUrl}
            title={msUrl ? undefined : "No mark scheme held for this paper"}
            onClick={() => setDoc("ms")}
          >
            Mark scheme
          </Button>
          {isSplitCapable && (
            <Button
              size="sm"
              variant={doc === "split" ? "default" : "ghost"}
              className="h-7 text-xs"
              aria-pressed={doc === "split"}
              aria-label="Split view: question paper and mark scheme side by side"
              onClick={() => setDoc("split")}
            >
              Split
            </Button>
          )}
        </div>
      </div>

      {/* mobile A/B toggle — sticky pill, preserves each doc's scroll */}
      {isSplitCapable && (
        <div
          className="sticky top-2 z-30 flex items-center justify-center gap-1 self-center rounded-full border bg-background/95 p-1 shadow-sm backdrop-blur sm:hidden"
          role="tablist"
          aria-label="Switch document"
        >
          {/* mobile pill: doc === "split" behaves as "qp" (CSS below) */}
          {(["qp", "ms"] as const).map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={doc === d || (doc === "split" && d === "qp")}
              className={cn(
                "h-8 rounded-full px-4 text-xs font-medium transition-colors",
                doc === d || (doc === "split" && d === "qp")
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => setDoc(d)}
            >
              {d === "qp" ? "Question paper" : "Mark scheme"}
            </button>
          ))}
        </div>
      )}

      <div className={cn("grid min-h-0 flex-1 gap-2", isSplitCapable && doc === "split" && "lg:grid-cols-2")}>
        {qpUrl && (
          <PdfPane
            url={qpUrl}
            downloadUrl={qpUrl}
            label={`Question paper — ${paper.ref}`}
            active={doc === "qp" || doc === "split"}
            className={cn(
              "min-h-[70vh]",
              doc === "ms" && "hidden",
              doc === "split" && "lg:block", // mobile split falls back to QP-only
            )}
          />
        )}
        {msUrl && (
          <PdfPane
            url={msUrl}
            downloadUrl={msUrl}
            label={`Mark scheme — ${paper.ref}`}
            active={doc === "ms" || doc === "split"}
            className={cn(
              "min-h-[70vh]",
              doc === "qp" && "hidden",
              doc === "split" && "hidden lg:block",
            )}
          />
        )}
        {!qpUrl && !msUrl && (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No PDFs are held for this paper in the archive yet.
          </p>
        )}
      </div>

      <p className="text-center text-[10px] text-muted-foreground">
        Official Pearson Edexcel documents streamed from the syllabai-pastpapers archive
        (AI-IDENTIFIED provenance, operator ratification pending · index generated{" "}
        {metaGeneratedAt.slice(0, 10)}).
      </p>
    </div>
  );
}
