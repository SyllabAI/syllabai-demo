import { NextResponse } from "next/server";
import { getCourseBundle } from "@/lib/courses";
import { buildSpecTreeIndex, subtopicOfQuestionSet } from "@/lib/spec-tree";
import { toAssembledQuestion } from "@/lib/teacher/test-assembly";

/**
 * GET /api/teacher/question-bank
 *
 * Browse listing for the Test Builder question bank (SME functional
 * reference: the builder picks individual questions, not just subtopics).
 *
 *   ?slug=<course>            required
 *   &subtopics=<csv codes>    optional filter (empty = whole bank)
 *   &difficulty=<easy|medium|hard>  optional
 *   &q=<text>                 optional keyword search (problem, choice and
 *                             subtopic-title substring, case-insensitive)
 *   &ids=<csv question ids>   explicit fetch (saved-test restore) —
 *                             bypasses filters, preserves the given order
 *   &offset=<n>&limit=<n>     pagination (limit clamped 1–60, default 40)
 *
 * Returns full wire-format questions (the same shape as assembly) plus a
 * short preview hint, so "Add question to test" needs no second round trip.
 * Deterministic order: subtopic code, marks, id.
 */
export const dynamic = "force-dynamic";

const MAX_LIMIT = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug") ?? "";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  const bundle = await getCourseBundle(slug);
  if (!bundle) {
    return NextResponse.json({ error: "no bundle for course" }, { status: 404 });
  }

  const index = buildSpecTreeIndex(bundle.curriculum);
  const meta = {
    slug: bundle.meta.slug,
    label: bundle.meta.label,
    subject: bundle.meta.subject,
    code: bundle.meta.code,
    level: bundle.meta.level,
  };

  // ── explicit ids mode (saved-test restore) ──────────────────────────────
  const idsParam = (searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (idsParam.length > 0) {
    if (idsParam.length > 300) {
      return NextResponse.json({ error: "too many ids" }, { status: 400 });
    }
    const byId = new Map<string, ReturnType<typeof toAssembledQuestion>>();
    for (const set of bundle.questionTopics) {
      const code = subtopicOfQuestionSet(set, index);
      const sub = code ? index.subtopicByCode.get(code) : undefined;
      for (const q of set.questions) {
        byId.set(q.id, toAssembledQuestion(q, sub?.code ?? "—", sub?.title ?? set.name));
      }
    }
    const questions = idsParam
      .map((id) => byId.get(id))
      .filter((q): q is NonNullable<typeof q> => Boolean(q));
    return NextResponse.json(
      { course: meta, questions, total: questions.length, nextOffset: null },
      { headers: { "cache-control": "no-store" } },
    );
  }

  // ── browse mode ─────────────────────────────────────────────────────────
  const subCodes = (searchParams.get("subtopics") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const wanted = subCodes.length > 0 ? new Set(subCodes) : null;
  const difficultyRaw = (searchParams.get("difficulty") ?? "").toLowerCase();
  const difficulty = ["easy", "medium", "hard"].includes(difficultyRaw) ? difficultyRaw : null;
  const search = (searchParams.get("q") ?? "").trim().slice(0, 120).toLowerCase();

  type Row = ReturnType<typeof toAssembledQuestion> & { preview: string };
  const rows: Row[] = [];
  for (const set of bundle.questionTopics) {
    const code = subtopicOfQuestionSet(set, index);
    const sub = code ? index.subtopicByCode.get(code) : undefined;
    for (const q of set.questions) {
      const subCode = sub?.code ?? "—";
      if (wanted && !wanted.has(subCode)) continue;
      if (difficulty && (q.difficulty ?? "").toLowerCase() !== difficulty) continue;
      const firstProblem = q.parts[0]?.problemMd ?? "";
      const preview =
        firstProblem
          .replace(/^#{1,6}\s*/gm, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180) || "(no text captured for this part)";
      rows.push({ ...toAssembledQuestion(q, subCode, sub?.title ?? set.name), preview });
    }
  }

  // keyword search AFTER filter, BEFORE ordering/pagination (total reflects
  // the searched set so "Load more" stays consistent)
  const searched = search
    ? rows.filter(
        (r) =>
          r.subtopic.title.toLowerCase().includes(search) ||
          r.parts.some(
            (p) =>
              p.problemMd.toLowerCase().includes(search) ||
              (p.choices ?? []).some((c) => c.textMd.toLowerCase().includes(search)),
          ),
      )
    : rows;

  searched.sort(
    (a, b) =>
      a.subtopic.code.localeCompare(b.subtopic.code) ||
      a.marks - b.marks ||
      a.id.localeCompare(b.id),
  );

  const offset = Math.max(0, Number(searchParams.get("offset") ?? "0") || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit") ?? "40") || 40));
  const page = searched.slice(offset, offset + limit);
  const nextOffset = offset + limit < searched.length ? offset + limit : null;

  return NextResponse.json(
    { course: meta, questions: page, total: searched.length, nextOffset },
    { headers: { "cache-control": "no-store" } },
  );
}
