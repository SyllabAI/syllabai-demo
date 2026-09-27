import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * GET /api/kg-learner-bridge?course=<slug>
 *
 * Content-id → specification-point bridge for the knowledge-graph learner
 * overlay (KG phase 1). The renderer's learner-state engine is keyed by
 * spec-point id ("1.1", "105"), while the browser-local progress store
 * records events against content ids (notes "rn_*", questions "qstn_*",
 * question parts "qstnprt_*", flashcards "fl_*"). This route joins the two:
 *
 *   - notes.json          → noteId   → specPointCodes (verbatim)
 *   - questions.json      → partId   → specPointCodes,
 *                           questionId → union of its parts' codes,
 *                           partId → parent questionId (awaiting-marks join)
 *   - content-maps/*.json → flashcardId → mapped spine codes (unmapped cards
 *                           carry codes: [] and are simply omitted)
 *   - public/kg/data      → the exported spine's point ids (the overlay may
 *                           only reference points the renderer actually has)
 *                           + the curriculum code used as the "4CH1-" style
 *                           prefix on some bundles' specPointCodes
 *
 * Codes only — no question text, note bodies or answers cross this boundary.
 * Responses are cached in-process; the bundles are immutable between deploys.
 */
export const dynamic = "force-dynamic";

interface CodeRef {
  spineCode?: string | null;
  officialCode?: string | null;
}

interface MapItem {
  kind?: string;
  codes?: CodeRef[];
}

interface QuestionPart {
  id?: string;
  specPointCodes?: string[];
}

interface Question {
  id?: string;
  parts?: QuestionPart[];
}

interface QuestionSet {
  questions?: Question[];
}

interface LearnerBridgePayload {
  course: string;
  codePrefix: string | null;
  totalPoints: number;
  pointIds: string[];
  noteCodes: Record<string, string[]>;
  questionCodes: Record<string, string[]>;
  partParent: Record<string, string>;
  flashcardCodes: Record<string, string[]>;
}

const cache = new Map<string, LearnerBridgePayload>();

const safeRead = <T,>(path: string): T | null => {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
};

/** Flatten one content-map item's code refs to bare spine codes. */
function itemCodes(item: MapItem | undefined): string[] {
  const out: string[] = [];
  for (const ref of item?.codes ?? []) {
    const code = ref?.spineCode ?? ref?.officialCode;
    if (code) out.push(code);
  }
  return out;
}

export function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("course") ?? "";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "bad course slug" }, { status: 400 });
  }

  const cached = cache.get(slug);
  if (cached) return NextResponse.json(cached);

  const kg = safeRead<{ points?: { id?: string }[]; meta?: { code?: string } }>(
    join(process.cwd(), "public", "kg", "data", `${slug}.json`),
  );
  if (!kg || !Array.isArray(kg.points)) {
    return NextResponse.json(
      { error: `no exported kg data for ${slug}` },
      { status: 404 },
    );
  }
  const pointIds = kg.points.map((p) => String(p?.id ?? "")).filter(Boolean);
  const codePrefix = kg.meta?.code ?? null;

  const noteCodes: Record<string, string[]> = {};
  const notesRaw = safeRead<
    { notes?: { noteId?: string; specPointCodes?: string[] }[] }[]
  >(join(process.cwd(), "content", slug, "notes.json"));
  // notes.json is a top-level array in current bundles; accept {notes:[]} too
  const noteList = Array.isArray(notesRaw)
    ? notesRaw
    : (notesRaw?.notes ?? []);
  for (const note of noteList) {
    if (note.noteId && Array.isArray(note.specPointCodes)) {
      noteCodes[note.noteId] = note.specPointCodes.map(String);
    }
  }

  const questionCodes: Record<string, string[]> = {};
  const partParent: Record<string, string> = {};
  const sets = safeRead<QuestionSet[] | { questions?: QuestionSet[] }>(
    join(process.cwd(), "content", slug, "questions.json"),
  );
  const setList: QuestionSet[] = Array.isArray(sets)
    ? sets
    : (sets?.questions ?? []);
  for (const set of setList) {
    for (const question of set?.questions ?? []) {
      if (!question.id) continue;
      const union = new Set<string>();
      for (const part of question.parts ?? []) {
        if (!part.id) continue;
        const codes = (part.specPointCodes ?? []).map(String);
        partParent[part.id] = question.id;
        if (codes.length) questionCodes[part.id] = codes;
        codes.forEach((c) => union.add(c));
      }
      if (union.size) questionCodes[question.id] = [...union];
    }
  }

  const flashcardCodes: Record<string, string[]> = {};
  const map = safeRead<{ items?: Record<string, MapItem> }>(
    join(process.cwd(), "content-maps", `${slug}.json`),
  );
  for (const [id, item] of Object.entries(map?.items ?? {})) {
    if (item?.kind !== "flashcard") continue;
    const codes = itemCodes(item);
    if (codes.length) flashcardCodes[id] = codes;
  }

  const payload: LearnerBridgePayload = {
    course: slug,
    codePrefix,
    totalPoints: pointIds.length,
    pointIds,
    noteCodes,
    questionCodes,
    partParent,
    flashcardCodes,
  };
  cache.set(slug, payload);
  return NextResponse.json(payload);
}
