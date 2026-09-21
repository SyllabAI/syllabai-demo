"use client";

/**
 * Tutor chat — the demo's grounded-AI experiment surface.
 *
 * The browser only ever talks to /api/ai/chat on this origin. The server
 * resolves the AI provider (Groq/OpenRouter/Gemini/FreeLLM/z.ai), runs
 * retrieval over the bundled corpus, enforces the evidence-sufficiency gate,
 * and streams citations + answer. Chat output NEVER mutates canonical KG or
 * learner state (brief §6/§27) — it is display-only by construction.
 *
 * Conversation ergonomics: stoppable generation (AbortController), follow-only-
 * when-pinned auto-scroll with a jump-to-latest affordance, a typing indicator
 * until the first token lands, per-turn copy, regenerate/retry of an exchange,
 * and an honest inline failure state (stream errors are distinct from
 * evidence-gate refusals).
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import {
  ArrowDown,
  Check,
  Copy,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import type { TutorCitation } from "@/lib/contracts";
import { SimulatedBanner } from "@/components/provenance";

interface Turn {
  role: "user" | "assistant";
  content: string;
  citations?: TutorCitation[];
  provider?: string;
  refused?: boolean;
  /** transport/stream failure — retryable, distinct from a gate refusal */
  error?: boolean;
  /** user aborted mid-generation; partial answer (if any) is kept */
  stopped?: boolean;
}

const SUGGESTIONS = [
  "Explain the three states of matter and what 4CH1-1.1 requires",
  "How do you calculate moles from mass and RFM?",
  "What does 4CH1-1.25 say about ionic bonding?",
  "Give me a mark-scheme style answer for a separation techniques question",
];

/** "near the bottom" tolerance (px) for auto-follow + jump-button visibility. */
const NEAR_BOTTOM_PX = 96;
/** Server body cap for `question` (api/ai/chat zod schema). */
const QUESTION_CAP = 600;

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1.5" aria-hidden>
      {[0, 1, 2].map((d) => (
        <span
          key={d}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${d * 140 - 420}ms` }}
        />
      ))}
    </span>
  );
}

export function TutorChat() {
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ provider?: string; model?: string | null }>({});
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // anchored entry points: /tutor?q=…&spec=4CH1-1.1 ("Ask about this" and
  // "Question help" across the Learning Hub). The spec code is appended to
  // the REQUEST for retrieval anchoring only — the user's words are displayed
  // verbatim, and nothing here writes to canonical data.
  const params = useSearchParams();
  const anchoredSpec = params.get("spec");
  const anchorSuffix = anchoredSpec ? ` (specification point ${anchoredSpec})` : "";
  // keep the WIRE payload under the server cap, not just the typed text
  const maxLen = Math.max(0, QUESTION_CAP - anchorSuffix.length);
  const bootQuestion = params.get("q");
  const bootedRef = useRef(false);

  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX);
  };

  const ask = async (question: string, base?: Turn[]) => {
    if (!question.trim() || busy) return;
    const historySource = base ?? messages;
    const history = historySource
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setAtBottom(true);
    requestAnimationFrame(() => scrollToBottom(false));

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `${question}${anchorSuffix}`.slice(0, QUESTION_CAP),
          history,
        }),
        signal: controller.signal,
      });
      if (!res.body || !res.ok) throw new Error(`stream failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const lines = evt.split("\n");
          const event = lines.find((l) => l.startsWith("event: "))?.slice(7);
          const dataLine = lines.find((l) => l.startsWith("data: "))?.slice(6);
          if (!event || !dataLine) continue;
          const data = JSON.parse(dataLine);
          if (event === "citations") {
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                citations: data.citations as TutorCitation[],
              };
              return copy;
            });
          } else if (event === "meta") {
            setMeta({ provider: data.provider, model: data.model });
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { ...copy[copy.length - 1], provider: data.provider, refused: data.refused };
              return copy;
            });
          } else if (event === "delta") {
            answer += data.text as string;
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: answer };
              return copy;
            });
            // follow the stream only while the reader is pinned to the bottom
            const el = scrollRef.current;
            if (el && el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX + 48) {
              el.scrollTop = el.scrollHeight;
            }
          } else if (event === "error") {
            // server-side failure (provider/retrieval) — surface as retryable
            throw new Error((data.message as string) || "provider error");
          }
        }
      }
    } catch (e) {
      // DOMException (browser fetch abort) and Error{name:"AbortError"} both
      // surface as AbortError depending on runtime — check the name directly
      const aborted = e instanceof Error && e.name === "AbortError";
      setMessages((prev) => {
        if (!prev.length) return prev; // cleared while aborting
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last.role !== "assistant") return prev;
        if (aborted) {
          copy[copy.length - 1] = {
            ...last,
            stopped: true,
            content: last.content || "Generation stopped before any output.",
          };
        } else {
          copy[copy.length - 1] = { ...last, error: true };
        }
        return copy;
      });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  useEffect(() => {
    if (bootQuestion && !bootedRef.current) {
      bootedRef.current = true;
      void ask(bootQuestion);
    }
  }, [bootQuestion]);

  /** Drop everything from `assistantIndex`'s user turn onward and re-ask it. */
  const regenerateAt = (assistantIndex: number) => {
    if (busy) return;
    const question = messages[assistantIndex - 1]?.content;
    if (!question?.trim()) return;
    const trimmed = messages.slice(0, Math.max(0, assistantIndex - 1));
    setMessages(trimmed);
    void ask(question, trimmed);
  };

  const copyAnswer = async (i: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(i);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedIdx(null), 1600);
    } catch {
      // clipboard unavailable (permissions / insecure context) — stay silent
    }
  };

  const clear = () => {
    abortRef.current?.abort();
    setMessages([]);
    setMeta({});
    setCopiedIdx(null);
  };

  const lastAssistantEmpty =
    busy && messages.length > 0 && messages[messages.length - 1].role === "assistant" && !messages[messages.length - 1].content;

  const actionBtn =
    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="size-5 text-primary" aria-hidden />
            Tutor
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Grounded generation over the bundled 4CH1 corpus with numbered citations and an honest
            sufficiency gate. Provider resolved server-side:{" "}
            <Badge variant="outline" className="font-mono text-[10px]" title={meta.model ?? undefined}>
              {meta.provider ?? "auto"}
            </Badge>
          </p>
        </div>
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clear}>
            <X className="size-4" aria-hidden /> Clear
          </Button>
        )}
      </div>

      <SimulatedBanner>
        Demo grounding: lexical retrieval over the <strong>bundled</strong> corpus — the production
        KA-RAG path (hybrid retrieval, fusion, reranking, claim validation) remains authoritative
        in syllabai-core.
      </SimulatedBanner>

      {anchoredSpec && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          Anchored to specification point
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{anchoredSpec}</code>
          — retrieval and citations prefer this anchor.
        </div>
      )}

      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-label="Tutor conversation"
          className="max-h-[60vh] min-h-[320px] space-y-3 overflow-y-auto rounded-md border p-3"
        >
          {messages.length === 0 ? (
            <div className="flex min-h-[296px] flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="flex size-11 items-center justify-center rounded-full border bg-primary/5">
                <Sparkles className="size-5 text-primary" aria-hidden />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">Ask the corpus anything</p>
                <p className="mx-auto max-w-md text-xs leading-relaxed text-muted-foreground">
                  Grounded in the bundled 4CH1 chemistry corpus — answers carry numbered citations
                  for the spec points they use, and the tutor refuses honestly when the evidence is
                  thin. Try one of these to start:
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    disabled={busy}
                    className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => {
              const isUser = m.role === "user";
              const isLastAssistant = !isUser && i === messages.length - 1;
              const waiting = isLastAssistant && lastAssistantEmpty && !m.error;
              return (
                <div key={i} className={isUser ? "flex justify-end" : ""}>
                  <div
                    className={
                      isUser
                        ? "max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                        : "w-full space-y-2 rounded-lg rounded-bl-sm bg-muted/60 px-3.5 py-2.5 text-sm"
                    }
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap leading-relaxed">{m.content || "…"}</p>
                    ) : m.error ? (
                      // stream/transport failure — inline, honest, retryable
                      <div className="space-y-2">
                        {m.content && <Markdown className="text-sm [&_p]:text-sm">{m.content}</Markdown>}
                        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs">
                          <TriangleAlert className="size-3.5 shrink-0 text-destructive" aria-hidden />
                          <span className="min-w-0 flex-1 text-destructive">
                            {m.content
                              ? "The stream was interrupted mid-answer."
                              : "Couldn’t finish this answer — the stream failed."}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0 gap-1.5 px-2 text-xs"
                            onClick={() => regenerateAt(i)}
                            disabled={busy}
                          >
                            <RotateCcw className="size-3" aria-hidden /> Retry
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {m.refused && (
                          <Badge variant="outline" className="w-fit border-warn/30 text-[10px] text-warn">
                            refused — insufficient evidence
                          </Badge>
                        )}
                        {m.stopped && (
                          <Badge variant="outline" className="w-fit text-[10px] text-muted-foreground">
                            stopped
                          </Badge>
                        )}
                        {m.content ? (
                          // assistant replies quote corpus evidence — render the
                          // same markdown (bold, $math$, lists) the corpus uses
                          <Markdown className="text-sm [&_p]:text-sm">{m.content}</Markdown>
                        ) : waiting ? (
                          <TypingDots />
                        ) : null}
                        {m.content && (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => copyAnswer(i, m.content)}
                              className={actionBtn}
                              aria-label="Copy answer"
                            >
                              {copiedIdx === i ? (
                                <Check className="size-3" aria-hidden />
                              ) : (
                                <Copy className="size-3" aria-hidden />
                              )}
                              {copiedIdx === i ? "Copied" : "Copy"}
                            </button>
                            {isLastAssistant && !busy && (
                              <button
                                type="button"
                                onClick={() => regenerateAt(i)}
                                className={actionBtn}
                                aria-label="Regenerate answer"
                              >
                                <RotateCcw className="size-3" aria-hidden /> Regenerate
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    {m.citations && m.citations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 border-t pt-2">
                        {m.citations.map((c) => (
                          <a
                            key={c.index}
                            href={c.url ?? "#"}
                            className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                            title={c.label}
                          >
                            <span className="font-mono text-[10.5px]">[{c.index}]</span>
                            {c.label.slice(0, 44)}
                            <span className="font-mono text-[10.5px]">{c.kind.slice(0, 4)}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!atBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setAtBottom(true);
              scrollToBottom(true);
            }}
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background px-3 py-1 text-[11px] text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            <ArrowDown className="size-3" aria-hidden /> Jump to latest
          </button>
        )}
      </div>

      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            maxLength={maxLen}
            placeholder="Ask about the corpus… (Enter to send)"
            className="min-h-11 pr-14"
            aria-label="Tutor question"
          />
          {input.length > maxLen - 60 && (
            <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] tabular-nums text-muted-foreground">
              {input.length}/{maxLen}
            </span>
          )}
        </div>
        {busy ? (
          <Button variant="outline" onClick={() => abortRef.current?.abort()} className="gap-1.5">
            <Square className="size-3.5 fill-current" aria-hidden /> Stop
          </Button>
        ) : (
          <Button onClick={() => ask(input)} disabled={!input.trim()} className="gap-1.5">
            <Send className="size-4" aria-hidden /> Ask
          </Button>
        )}
      </div>
    </div>
  );
}
