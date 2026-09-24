import type { CourseBundle } from "../courses";
import type { ExamQuestionTopic } from "../contracts";
import { buildSpecTreeIndex, subtopicOfQuestionSet } from "../spec-tree";

type QuestionPartT = ExamQuestionTopic["questions"][number]["parts"][number];

/**
 * Test assembly for the teacher Test Builder (TEACHER-2).
 *
 * Spec source: syllabai/syllabai TEACHER_ARCHITECTURE.md §6 (flow:
 * choose content → filter/target → select → arrange → preview → export;
 * export must retain question/mark provenance) + the production
 * TestBuilderView P9 rules:
 *   - assembles from the learner-servable question bank only (the committed,
 *     validated corpus — nothing else exists in the demo);
 *   - marks-aware deterministic greedy fill, smallest overshoot when an
 *     exact fill is impossible; max questions is ignored when a marks
 *     target is set;
 *   - provenance (subtopic, spec points, source paper) rides on every part.
 */

export interface AssembledPart {
  id: string;
  order: number;
  marks: number;
  questionType: string | null;
  commandWord: string | null;
  specPointCodes: string[];
  choices: QuestionPartT["choices"];
  sourcePaper: QuestionPartT["sourcePaper"];
  problemMd: string;
  solutionMd: string | null;
}

export interface AssembledQuestion {
  id: string;
  marks: number;
  difficulty: string | null;
  subtopic: { code: string; title: string };
  parts: AssembledPart[];
}

export interface AssembledTest {
  course: { slug: string; label: string; subject: string; code: string; level: string };
  title: string;
  questions: AssembledQuestion[];
  totalMarks: number;
  targetMarks: number | null;
  subtopics: { code: string; title: string }[];
  generatedAt: string;
}

interface PoolEntry {
  q: ExamQuestionTopic["questions"][number];
  subCode: string;
  subTitle: string;
}

/** Corpus question → wire-format question (shared by assembly and the
 *  question-bank browser — one mapping, one shape). */
export function toAssembledQuestion(
  q: ExamQuestionTopic["questions"][number],
  subCode: string,
  subTitle: string,
): AssembledQuestion {
  return {
    id: q.id,
    marks: q.totalMarks,
    difficulty: q.difficulty,
    subtopic: { code: subCode, title: subTitle },
    parts: q.parts.map((p) => ({
      id: p.id,
      order: p.order,
      marks: p.marks,
      questionType: p.questionType,
      commandWord: p.commandWord,
      specPointCodes: p.specPointCodes,
      choices: p.choices,
      sourcePaper: p.sourcePaper,
      problemMd: p.problemMd,
      solutionMd: p.solutionMd,
    })),
  };
}

export function assembleTest(
  bundle: CourseBundle,
  setSlugs: Set<string>,
  opts: { targetMarks?: number | null; maxQuestions?: number | null },
): AssembledTest {
  const index = buildSpecTreeIndex(bundle.curriculum);

  const pool: PoolEntry[] = bundle.questionTopics
    .filter((set) => setSlugs.has(set.slug))
    .flatMap((set) => {
      const code = subtopicOfQuestionSet(set, index);
      const sub = code ? index.subtopicByCode.get(code) : undefined;
      return set.questions.map((q) => ({
        q,
        subCode: sub?.code ?? "—",
        subTitle: sub?.title ?? set.name,
      }));
    });

  // deterministic order: marks ascending, then id — stable across builds
  pool.sort((a, b) => a.q.totalMarks - b.q.totalMarks || a.q.id.localeCompare(b.q.id));

  const chosen: PoolEntry[] = [];
  const targetMarks = opts.targetMarks && opts.targetMarks > 0 ? opts.targetMarks : null;

  if (targetMarks) {
    // pass 1 — fill without exceeding the target
    let total = 0;
    for (const entry of pool) {
      if (total + entry.q.totalMarks <= targetMarks) {
        chosen.push(entry);
        total += entry.q.totalMarks;
      }
    }
    // pass 2 — exact fill, else smallest overshoot (P9 marks-aware rule)
    const leftover = targetMarks - total;
    if (leftover > 0 && pool.length > chosen.length) {
      const remaining = pool.filter((e) => !chosen.includes(e));
      const exact = remaining.find((e) => e.q.totalMarks === leftover);
      const pick = exact ?? remaining
        .filter((e) => e.q.totalMarks > leftover)
        .sort((a, b) => a.q.totalMarks - b.q.totalMarks || a.q.id.localeCompare(b.q.id))[0];
      if (pick) chosen.push(pick);
    }
  } else {
    // max-questions mode (default 20 in the production view)
    const max = opts.maxQuestions && opts.maxQuestions > 0 ? opts.maxQuestions : 20;
    for (const entry of pool) {
      if (chosen.length >= max) break;
      chosen.push(entry);
    }
  }

  const questions: AssembledQuestion[] = chosen.map(({ q, subCode, subTitle }) =>
    toAssembledQuestion(q, subCode, subTitle),
  );

  const totalMarks = questions.reduce((acc, q) => acc + q.marks, 0);
  const subtopics = [...new Map(questions.map((q) => [q.subtopic.code, q.subtopic])).values()]
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    course: {
      slug: bundle.meta.slug,
      label: bundle.meta.label,
      subject: bundle.meta.subject,
      code: bundle.meta.code,
      level: bundle.meta.level,
    },
    title: `${bundle.meta.subject} test — ${bundle.meta.code}`,
    questions,
    totalMarks,
    targetMarks,
    subtopics,
    generatedAt: new Date().toISOString(),
  };
}
