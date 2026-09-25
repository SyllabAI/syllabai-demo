/**
 * Grounded tutor orchestration (demo-simplified §26).
 *
 * retrieve → evidence sufficiency → grounded generation with numbered
 * citations → refusal when evidence is insufficient. The tutor never mutates
 * canonical KG or learner state (brief §6/§27) — its output is text +
 * citations only, and every citation deep-links back to the demo surface.
 */
import "server-only";
import type { AiMessage } from "@/lib/contracts";
import { resolveAiProvider } from "./ai/providers";
import { buildCorpusIndex, retrieve, type CorpusIndex } from "./ai/retrieval";
import { getDataProvider } from "@/lib/data";
import type { ConceptGraph, ExamQuestionTopic, RevisionNote } from "@/lib/contracts";

let cachedIndex: CorpusIndex | null = null;

export async function getCorpusIndex(): Promise<CorpusIndex> {
  if (cachedIndex) return cachedIndex;
  const provider = getDataProvider();
  const [notes, topics, graph] = await Promise.all([
    provider.revisionNotes(),
    provider.examQuestionTopics(),
    provider.conceptGraph(),
  ]);
  cachedIndex = buildCorpusIndex(notes, topics, graph);
  return cachedIndex;
}

export interface TutorTurnRequest {
  question: string;
  history: AiMessage[];
}

export interface TutorTurnResult {
  answer: string;
  citations: Awaited<ReturnType<typeof retrieve>>["citations"];
  provider: string;
  model: string | null;
  refused: boolean;
  evidenceCount: number;
}

const SYSTEM_PROMPT = `You are the SyllabAI demo tutor for Pearson Edexcel International GCSE Chemistry (4CH1).

Rules:
1. Ground every substantive claim in the numbered EVIDENCE snippets provided. Cite them inline as [1], [2] …
2. If the evidence is not sufficient to answer confidently, say so plainly and state what is missing. Never invent spec-point codes, mark schemes, or content.
3. Use the canonical specification-point code format (e.g. 4CH1-3.14C) when referencing curriculum anchors.
4. Keep the tone warm, precise and exam-focused. Prefer short paragraphs, then bullets. Maximum ~250 words unless asked otherwise.
5. You are a DEMO surface: never claim to mutate learner state, mastery, or the knowledge graph. You do not grade; you explain.`;

export async function tutorTurn(req: TutorTurnRequest): Promise<TutorTurnResult> {
  const index = await getCorpusIndex();
  const { citations, sufficient } = retrieve(index, req.question);

  const provider = resolveAiProvider();

  if (citations.length === 0 || !sufficient) {
    const topicHints = citations.slice(0, 3).map((c) => `- ${c.label}`).join("\n");
    return {
      answer:
        `I can't answer that with grounded evidence from the bundled 4CH1 corpus, so I'm refusing rather than guessing — the production tutor does the same (evidence sufficiency gate).\n\n` +
        (topicHints
          ? `Closest corpus material I found:\n${topicHints}\n\nTry naming the concept or spec point differently, or browse the Revision Notes surface.`
          : `Try asking about a topic in the bundled corpus (e.g. “Explain ionic bonding”, “What does 4CH1-1.1 say about states of matter?”, or “Give me a mark-scheme style answer for a separation techniques question”).`),
      citations,
      provider: provider.id,
      model: provider.model,
      refused: true,
      evidenceCount: citations.length,
    };
  }

  const evidenceBlock = citations
    .map((c) => {
      const seg = index.segments.find((s) => s.ref === c.ref);
      return `[${c.index}] (${c.kind}${c.specPointCode ? ` · ${c.specPointCode}` : ""}) ${c.label}\n${seg?.text.slice(0, 900) ?? ""}`;
    })
    .join("\n\n");

  const messages: AiMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...req.history.slice(-6),
    {
      role: "user",
      content: `LEARNER QUESTION:\n${req.question}\n\nEVIDENCE (cite by number):\n${evidenceBlock}`,
    },
  ];

  try {
    const result = await provider.complete({ messages, temperature: 0.25, maxTokens: 900 });
    return {
      answer: result.text,
      citations,
      provider: result.provider,
      model: result.model,
      refused: false,
      evidenceCount: citations.length,
    };
  } catch (e) {
    return {
      answer:
        `The AI provider call failed (${e instanceof Error ? e.message.slice(0, 140) : "unknown"}), so here is the honest fallback: the evidence I retrieved is listed below with deep links. No answer was fabricated.`,
      citations,
      provider: provider.id,
      model: provider.model,
      refused: true,
      evidenceCount: citations.length,
    };
  }
}
