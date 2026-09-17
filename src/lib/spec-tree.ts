/**
 * Spec-tree builder — the canonical navigation tree.
 *
 * SaveMyExams' numbered topic tree IS the SyllabAI specification tree, so one
 * tree drives the Learning Hub's sidebar, URLs, and progress rings
 * (research/sme → SaveMyExams_UX_Feature_Research.docx §9). Nothing here
 * invents a second educational model: nodes are the imported CurriculumNodes
 * verbatim, only grouped for navigation.
 *
 *   SUBJECT (4CH1) → TOPIC (4CH1-S1 "1. Principles of chemistry")
 *     → SUBTOPIC (4CH1-S1-a "States of matter") → SPEC_POINTs (4CH1-1.1 …)
 */
import type { Curriculum, CurriculumNode, ExamQuestionTopic, Flashcard, RevisionNote } from "@/lib/contracts";

export interface SpecSubtopic {
  code: string; // "4CH1-S1-a"
  label: string; // "a" — sub-topic letter inside the topic
  title: string;
  topicCode: string;
  specPointCodes: string[];
}

export interface SpecTopic {
  code: string; // "4CH1-S1"
  number: number; // 1 — syllabus section number
  title: string;
  subtopics: SpecSubtopic[];
  specPointCount: number;
}

export interface SpecTree {
  subjectCode: string;
  subjectTitle: string;
  topics: SpecTopic[];
}

export interface SpecTreeIndex {
  tree: SpecTree;
  /** specPointCode → parent subtopic code */
  subtopicOfSpecPoint: Map<string, string>;
  /** subtopicCode → parent topic code */
  topicOfSubtopic: Map<string, string>;
  subtopicByCode: Map<string, SpecSubtopic>;
  topicByCode: Map<string, SpecTopic>;
}

function letterOf(subtopicCode: string, topicCode: string): string {
  const suffix = subtopicCode.slice(topicCode.length);
  return suffix.startsWith("-") ? suffix.slice(1) : suffix;
}

export function buildSpecTreeIndex(curriculum: Curriculum): SpecTreeIndex {
  const nodes = curriculum.nodes;
  const subject = nodes.find((n) => n.family === "SUBJECT");
  const topics = nodes
    .filter((n) => n.family === "TOPIC")
    .sort((a, b) => a.code.localeCompare(b.code));

  const tree: SpecTree = {
    subjectCode: curriculum.code,
    subjectTitle: subject?.title ?? curriculum.subject,
    topics: [],
  };

  const subtopicOfSpecPoint = new Map<string, string>();
  const topicOfSubtopic = new Map<string, string>();
  const subtopicByCode = new Map<string, SpecSubtopic>();
  const topicByCode = new Map<string, SpecTopic>();

  for (const [i, topic] of topics.entries()) {
    const spec: SpecTopic = {
      code: topic.code,
      number: i + 1,
      title: topic.title,
      subtopics: [],
      specPointCount: 0,
    };

    const subs = nodes
      .filter((n) => n.family === "SUBTOPIC" && n.parents.includes(topic.code))
      .sort((a, b) => a.code.localeCompare(b.code));

    const orphanSpecs: CurriculumNode[] = [];

    for (const sub of subs) {
      const points = nodes
        .filter((n) => n.family === "SPEC_POINT" && n.parents.includes(sub.code))
        .map((n) => n.code)
        .sort(bySpecPointOrder);
      for (const c of points) subtopicOfSpecPoint.set(c, sub.code);
      topicOfSubtopic.set(sub.code, topic.code);
      spec.subtopics.push({
        code: sub.code,
        label: letterOf(sub.code, topic.code),
        title: sub.title,
        topicCode: topic.code,
        specPointCodes: points,
      });
      spec.specPointCount += points.length;
    }

    // spec points attached straight to the topic (no subtopic) — keep them
    // reachable under a synthetic "general" row so the tree stays complete
    for (const n of nodes) {
      if (
        n.family === "SPEC_POINT" &&
        n.parents.includes(topic.code) &&
        !subtopicOfSpecPoint.has(n.code)
      ) {
        orphanSpecs.push(n);
      }
    }
    if (orphanSpecs.length > 0) {
      const codes = orphanSpecs.map((n) => n.code).sort(bySpecPointOrder);
      const general: SpecSubtopic = {
        code: `${topic.code}-gen`,
        label: "gen",
        title: "General requirements",
        topicCode: topic.code,
        specPointCodes: codes,
      };
      topicOfSubtopic.set(general.code, topic.code);
      spec.subtopics.push(general);
      spec.specPointCount += codes.length;
    }

    tree.topics.push(spec);
    topicByCode.set(topic.code, spec);
    for (const s of spec.subtopics) subtopicByCode.set(s.code, s);
  }

  return { tree, subtopicOfSpecPoint, topicOfSubtopic, subtopicByCode, topicByCode };
}

/** "4CH1-1.10" sorts after "4CH1-1.9" — numeric, not lexical. */
export function bySpecPointOrder(a: string, b: string): number {
  const [as, an] = a.split(".");
  const [bs, bn] = b.split(".");
  if (as !== bs) return as.localeCompare(bs);
  return (parseInt(an ?? "0", 10) || 0) - (parseInt(bn ?? "0", 10) || 0);
}

// ── resource → subtopic grouping ────────────────────────────────────────

export interface SubtopicResourceCounts {
  notes: number;
  questions: number;
  flashcards: number;
}

/** First mapped subtopic for a note (notes map to one or two spec points). */
export function subtopicOfNote(
  note: RevisionNote,
  index: SpecTreeIndex,
): string | null {
  for (const c of note.specPointCodes) {
    const s = index.subtopicOfSpecPoint.get(c);
    if (s) return s;
  }
  return null;
}

/** Subtopic with the most anchored questions — the set's canonical home. */
export function subtopicOfQuestionSet(
  topic: ExamQuestionTopic,
  index: SpecTreeIndex,
): string | null {
  const tally = new Map<string, number>();
  for (const q of topic.questions) {
    const codes = new Set<string>();
    for (const p of q.parts) {
      for (const c of p.specPointCodes) {
        const s = index.subtopicOfSpecPoint.get(c);
        if (s) codes.add(s);
      }
    }
    for (const s of codes) tally.set(s, (tally.get(s) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [s, n] of tally) {
    if (n > bestN) {
      best = s;
      bestN = n;
    }
  }
  return best;
}

export function subtopicOfFlashcard(
  card: Flashcard,
  notes: RevisionNote[],
  index: SpecTreeIndex,
): string | null {
  const note = notes.find((n) => n.noteId === card.sourceNoteId);
  if (!note) return null;
  return subtopicOfNote(note, index);
}

/** Per-subtopic counts for every resource type at once (sidebar + hub). */
export function resourceCounts(
  notes: RevisionNote[],
  topics: ExamQuestionTopic[],
  flashcards: Flashcard[],
  index: SpecTreeIndex,
): Map<string, SubtopicResourceCounts> {
  const counts = new Map<string, SubtopicResourceCounts>();
  const bump = (code: string, k: keyof SubtopicResourceCounts, by = 1) => {
    const cur = counts.get(code) ?? { notes: 0, questions: 0, flashcards: 0 };
    cur[k] += by;
    counts.set(code, cur);
  };
  for (const n of notes) {
    const s = subtopicOfNote(n, index);
    if (s) bump(s, "notes");
  }
  for (const t of topics) {
    const s = subtopicOfQuestionSet(t, index);
    if (s) bump(s, "questions", t.questions.length);
  }
  for (const f of flashcards) {
    const s = subtopicOfFlashcard(f, notes, index);
    if (s) bump(s, "flashcards");
  }
  return counts;
}
