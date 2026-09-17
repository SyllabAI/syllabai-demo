"use client";

/**
 * Flashcards — DEMO_DERIVED deck generated from the revision notes' spec
 * points (see scripts/import_content.py). A deliberately simple box-model
 * scheduler: confidence rating reorders the queue client-side. Nothing
 * persists, nothing canonical.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CircleHelp, RotateCcw } from "lucide-react";
import cardsJson from "../../../content/igcse-chemistry/flashcards.json";
import type { Flashcard } from "@/lib/contracts";
import { Markdown } from "@/components/markdown";
import { SpecChip, SimulatedBanner } from "@/components/provenance";

type Rating = "again" | "hard" | "good" | "easy";

const RATING_STEP: Record<Rating, number> = { again: -2, hard: 0, good: 1, easy: 2 };

interface CardState {
  box: number;
  seen: number;
}

// deterministic shuffle so every visit sees the same order (demo stability)
function seededShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  let seed = 424242;
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function FlashcardsPage() {
  const cards = useMemo(() => seededShuffle(cardsJson as Flashcard[]), []);
  const [flipped, setFlipped] = useState(false);
  const [state, setState] = useState<Record<string, CardState>>({});
  const [done, setDone] = useState(0);

  const queue = useMemo(() => {
    // lower box = more due; unseen start in box 1
    return [...cards].sort((a, b) => (state[a.id]?.box ?? 1) - (state[b.id]?.box ?? 1));
  }, [cards, state]);

  const current = queue[0];
  const total = cards.length;
  const progress = total ? Math.round((done / Math.min(total, 20)) * 100) : 0;

  const rate = (r: Rating) => {
    if (!current) return;
    const id = current.id;
    setState((prev) => {
      const s = prev[id] ?? { box: 1, seen: 0 };
      const box = Math.max(0, Math.min(s.box + RATING_STEP[r], 4));
      return { ...prev, [id]: { box, seen: s.seen + 1 } };
    });
    setDone((d) => d + 1);
    setFlipped(false);
  };

  const reset = () => {
    setState({});
    setDone(0);
    setFlipped(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CircleHelp className="size-5 text-primary" aria-hidden />
          Flashcards
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Auto-generated from the revision notes&apos; spec-point anchors — an example of a fast,
          disposable experiment ({total} cards).
        </p>
      </div>

      <SimulatedBanner>
        These cards are <strong>DEMO_DERIVED</strong> (provenance tier on every card), scheduling is
        a client-side box model, and the order is a deterministic shuffle — not a governed learning
        product.
      </SimulatedBanner>

      <div className="flex items-center gap-3">
        <Progress value={progress} className="flex-1" aria-label="Session progress" />
        <span className="text-xs tabular-nums text-muted-foreground">{done} reviews</span>
        <Button size="sm" variant="ghost" onClick={reset}>
          <RotateCcw className="size-4" aria-hidden /> Reset
        </Button>
      </div>

      {current && (
        <Card
          className="min-h-64 cursor-pointer select-none transition-shadow hover:shadow-md"
          onClick={() => setFlipped((f) => !f)}
          role="button"
          tabIndex={0}
          aria-label={flipped ? "Show question" : "Reveal answer"}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFlipped((f) => !f);
            }
          }}
        >
          <CardContent className="flex min-h-64 flex-col justify-between gap-4 p-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {current.specPointCode && <SpecChip code={current.specPointCode} />}
              <Badge variant="outline" className="text-[10px]">
                {current.provenanceTier}
              </Badge>
              {current.sourceTitle && (
                <span className="truncate">from “{current.sourceTitle}”</span>
              )}
              {state[current.id] && (
                <span className="ml-auto shrink-0">box {state[current.id].box}</span>
              )}
            </div>
            <div className="flex flex-1 items-center justify-center py-4">
              {flipped ? (
                <Markdown className="text-center">{current.back}</Markdown>
              ) : (
                <p className="text-center text-lg font-medium leading-relaxed">{current.front}</p>
              )}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {flipped ? "rate your recall" : "tap to reveal"}
            </p>
          </CardContent>
        </Card>
      )}

      {flipped && current && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button variant="destructive" onClick={() => rate("again")}>
            Again
          </Button>
          <Button variant="outline" onClick={() => rate("hard")}>
            Hard
          </Button>
          <Button variant="secondary" onClick={() => rate("good")}>
            Good
          </Button>
          <Button onClick={() => rate("easy")}>Easy</Button>
        </div>
      )}
    </div>
  );
}
