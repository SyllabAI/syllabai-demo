"use client";

/**
 * Tutor chat — the demo's grounded-AI experiment surface.
 *
 * The browser only ever talks to /api/ai/chat on this origin. The server
 * resolves the AI provider (Groq/OpenRouter/Gemini/FreeLLM/z.ai), runs
 * retrieval over the bundled corpus, enforces the evidence-sufficiency gate,
 * and streams citations + answer. Chat output NEVER mutates canonical KG or
 * learner state (brief §6/§27) — it is display-only by construction.
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import { Send, Sparkles, X } from "lucide-react";
import type { TutorCitation } from "@/lib/contracts";
import { SimulatedBanner } from "@/components/provenance";

interface Turn {
  role: "user" | "assistant";
  content: string;
  citations?: TutorCitation[];
  provider?: string;
  refused?: boolean;
}

const SUGGESTIONS = [
  "Explain the three states of matter and what 4CH1-1.1 requires",
  "How do you calculate moles from mass and RFM?",
  "What does 4CH1-1.25 say about ionic bonding?",
  "Give me a mark-scheme style answer for a separation techniques question",
];

export function TutorChat() {
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ provider?: string; model?: string | null }>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // anchored entry points: /tutor?q=…&spec=4CH1-1.1 ("Ask about this" and
  // "Question help" across the Learning Hub). The spec code is appended to
  // the REQUEST for retrieval anchoring only — the user's words are displayed
  // verbatim, and nothing here writes to canonical data.
  const params = useSearchParams();
  const anchoredSpec = params.get("spec");
  const bootQuestion = params.get("q");
  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootQuestion && !bootedRef.current) {
      bootedRef.current = true;
      void ask(bootQuestion);
    }
  }, [bootQuestion]);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: anchoredSpec ? `${question} (specification point ${anchoredSpec})` : question,
          history,
        }),
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
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
          }
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          content: `Stream error: ${e instanceof Error ? e.message : "unknown"}`,
          refused: true,
        };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setMessages([]);
    setMeta({});
  };

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
            <Badge variant="outline" className="font-mono text-[10px]">
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

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="max-h-[52vh] space-y-3 overflow-y-auto rounded-md border p-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                  : "w-full space-y-2 rounded-lg rounded-bl-sm bg-muted/60 px-3.5 py-2.5 text-sm"
              }
            >
              {m.role === "assistant" && m.refused && (
                <Badge variant="outline" className="border-warn/30 text-[10px] text-warn">
                  refused — insufficient evidence
                </Badge>
              )}
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap leading-relaxed">{m.content || "…"}</p>
              ) : (
                // assistant replies quote corpus evidence — render the same
                // markdown (bold, $math$, lists) the corpus surfaces use
                <Markdown className="text-sm [&_p]:text-sm">{m.content || "…"}</Markdown>
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
        ))}
        {messages.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Ask about anything in the bundled corpus — states of matter, atomic structure,
            separation techniques, the periodic table…
          </p>
        )}
      </div>

      <div className="flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
          placeholder="Ask about the corpus… (Enter to send)"
          className="min-h-11 flex-1"
          aria-label="Tutor question"
        />
        <Button onClick={() => ask(input)} disabled={busy || !input.trim()}>
          <Send className="size-4" aria-hidden />
          {busy ? "Grounding…" : "Ask"}
        </Button>
      </div>
    </div>
  );
}
