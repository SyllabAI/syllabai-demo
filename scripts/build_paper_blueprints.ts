/**
 * Build src/data/pastpapers-blueprints.json — official per-question mark
 * totals for every corpus paper that has a matched interactive
 * reconstruction.
 *
 * For each registered course:
 *   1. reconstructions = collectPastPapers(content/<slug>/questions.json)
 *   2. corpus rows     = corpusPapersForCourse(slug)
 *   3. match           = matchReconstructions(rows, reconstructions)   (shared lib)
 *   4. for each matched corpus `${sessionId}:${dir}` → download the QP PDF
 *      (cached), extract "Total for Question N = M marks" via pdfjs, and the
 *      "TOTAL FOR PAPER = N MARKS" line when present. A single extraction
 *      gap (pdf sometimes doesn't emit one footer line — verified Jun 2019
 *      4CH1/1C Q7) is inferred from the paper total; papers that still can't
 *      be reconstructed are LEFT OUT (coverage renders "unverified", honest).
 *
 * Run: bun scripts/build_paper_blueprints.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { corpusPapersForCourse } from "../src/lib/pastpapers-corpus";
import { collectPastPapers } from "../src/lib/past-papers";
import { matchReconstructions } from "../src/lib/pastpapers-reconstruction";
import { PASTPAPERS_REPO } from "../src/lib/pastpapers-shared";

const ROOT = path.resolve(import.meta.dir, "..");
const CACHE = path.join(ROOT, ".blueprint-cache");
const OUT = path.join(ROOT, "src/data/pastpapers-blueprints.json");
mkdirSync(CACHE, { recursive: true });

const indexJson = JSON.parse(readFileSync(path.join(ROOT, "src/data/pastpapers-index.json"), "utf8")) as {
  meta: { treeSha: string };
};
const registry = JSON.parse(readFileSync(path.join(ROOT, "content/courses.json"), "utf8"));
const courses: Array<{ slug: string }> = Array.isArray(registry) ? registry : registry.courses;

// ── PDF text extraction (pdfjs, in-process — portable to CI) ───────────────

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJsModule> | null = null;
function loadPdfjs(): Promise<PdfJsModule> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

async function fetchCachedPdf(qpPath: string): Promise<Buffer | null> {
  const key = createHash("sha1").update(qpPath).digest("hex").slice(0, 20);
  const file = path.join(CACHE, `${key}.pdf`);
  if (existsSync(file) && existsSync(`${file}.ok`)) return readFileSync(file);
  const url = `https://raw.githubusercontent.com/${PASTPAPERS_REPO}/main/${qpPath}`;
  const res = await fetch(url, { headers: { "User-Agent": "syllabai-demo-blueprints" } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024 || !(buf.subarray(0, 4).toString() === "%PDF")) return null;
  writeFileSync(file, buf);
  writeFileSync(`${file}.ok`, "1");
  return buf;
}

interface RawExtraction {
  marks: Map<number, number>;
  paperTotal: number | null;
  /** rubric says "answer N questions from ..." — optional-choice paper */
  optionalChoice: boolean;
}

const PER_Q = /Total for Question\s*(\d+)\s*(?:=|is)?\s*(\d+)\s*marks?/gi;
const PAPER_TOTAL = /Total for (?:the )?paper\s*=?\s*(\d+)\s*marks?/gi;

async function extractFromPdf(buf: Buffer): Promise<RawExtraction | null> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    text += tc.items.map((it) => ("str" in it ? it.str : "")).join(" ") + " \n";
  }
  const norm = text.replace(/\s+/g, " ");
  const marks = new Map<number, number>();
  for (const m of norm.matchAll(PER_Q)) {
    const qn = Number(m[1]);
    const mk = Number(m[2]);
    if (!Number.isInteger(qn) || !Number.isInteger(mk) || mk <= 0 || mk > 60) continue;
    marks.set(qn, Math.max(marks.get(qn) ?? 0, mk));
  }
  const ptMatch = [...norm.matchAll(PAPER_TOTAL)].at(-1);
  const paperTotal = ptMatch ? Number(ptMatch[1]) : null;
  // Optional-choice papers (e.g. 4GE1: "In Section A, answer two questions
  // from Questions 1, 2 and 3") legitimately print per-question footers that
  // sum to MORE than the paper total — students answer a subset.
  const optionalChoice =
    /Answer\s+(one|two|three|four)\s+questions?\s+from/i.test(norm.slice(0, 3000));
  if (marks.size < 2) return null;
  return { marks, paperTotal, optionalChoice };
}

/** Resolve extraction gaps; null when the blueprint can't be trusted. */
function finalize(raw: RawExtraction): {
  marks: Record<string, number>;
  total: number;
  paperTotal: number | null;
  inferred: string[];
  optional?: true;
} | null {
  const qns = [...raw.marks.keys()].sort((a, b) => a - b);
  const maxQn = qns[qns.length - 1];
  // plausibility guards
  if (maxQn > 40 || qns.length < 2) return null;
  // two-question papers are real (4AC1: two 25-mark constructs) but only
  // trustworthy when the stated paper total independently confirms them
  if (qns.length === 2 && raw.paperTotal == null) return null;
  const gaps: number[] = [];
  for (let n = 1; n <= maxQn; n++) if (!raw.marks.has(n)) gaps.push(n);
  const inferred: string[] = [];
  let sum = qns.reduce((a, n) => a + (raw.marks.get(n) ?? 0), 0);

  // optional-choice: footers deliberately exceed the paper total (students
  // answer a subset), so the total can neither validate the sum nor fill gaps
  const optional =
    raw.optionalChoice === true && raw.paperTotal != null && sum - raw.paperTotal > 2;

  if (gaps.length === 1 && raw.paperTotal != null && !optional) {
    const fill = raw.paperTotal - sum;
    if (fill > 0 && fill <= 60) {
      raw.marks.set(gaps[0], fill);
      inferred.push(String(gaps[0]));
      sum += fill;
    } else {
      return null; // inference contradicts the paper total — don't guess
    }
  } else if (gaps.length > 1) {
    return null; // multi-gap: cannot distribute the paper total honestly
  }

  // final sanity: total must be plausible and (when stated, non-choice) match
  // the paper total
  if (sum < 20 || sum > 300) return null;
  if (!optional && raw.paperTotal != null && Math.abs(sum - raw.paperTotal) > 2) return null;

  const marks: Record<string, number> = {};
  for (const n of [...raw.marks.keys()].sort((a, b) => a - b)) marks[String(n)] = raw.marks.get(n)!;
  return {
    marks,
    total: sum,
    paperTotal: raw.paperTotal,
    inferred,
    ...(optional ? { optional: true as const } : {}),
  };
}

// ── main ───────────────────────────────────────────────────────────────────

interface MatchedDir {
  corpusKey: string;
  qpPath: string;
}

async function main() {
  const matched = new Map<string, MatchedDir>();
  let reconTotal = 0;

  for (const { slug } of courses) {
    const qfile = path.join(ROOT, "content", slug, "questions.json");
    if (!existsSync(qfile)) continue;
    let banks;
    try {
      banks = JSON.parse(readFileSync(qfile, "utf8"));
    } catch {
      continue;
    }
    const reconstructions = collectPastPapers(banks);
    reconTotal += reconstructions.length;
    const papers = corpusPapersForCourse(slug);
    const { matchKeys } = matchReconstructions(papers, reconstructions);
    for (const corpusKey of matchKeys.keys()) {
      if (matched.has(corpusKey)) continue;
      const [sessionId] = corpusKey.split(":");
      const dir = corpusKey.slice(sessionId.length + 1);
      const row = papers.find((p) => p.sessionId === sessionId && p.dir === dir);
      if (!row || !row.qpPath) continue;
      matched.set(corpusKey, { corpusKey, qpPath: row.qpPath });
    }
  }
  console.log(`reconstructions: ${reconTotal} · matched corpus dirs needing blueprints: ${matched.size}`);

  const papers: Record<string, unknown> = {};
  let inferredGaps = 0;
  let failed = 0;
  const entries = [...matched.values()];
  const CONCURRENCY = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const e = entries[cursor++];
      try {
        const buf = await fetchCachedPdf(e.qpPath);
        if (!buf) {
          failed++;
          continue;
        }
        const raw = await extractFromPdf(buf);
        const fin = raw ? finalize(raw) : null;
        if (!fin) {
          failed++;
          continue;
        }
        inferredGaps += fin.inferred.length;
        papers[e.corpusKey] = fin;
      } catch (err) {
        console.error(`  ! ${e.corpusKey}: ${err instanceof Error ? err.message : err}`);
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const papersSorted: Record<string, unknown> = {};
  for (const k of Object.keys(papers).sort()) papersSorted[k] = papers[k];
  const out = {
    meta: {
      generatedAt: new Date().toISOString(),
      treeSha: indexJson.meta.treeSha,
      papers: Object.keys(papersSorted).length,
      inferredGaps,
    },
    papers: papersSorted,
  };

  // no-op guard: if the extracted coverage is unchanged, leave the committed
  // file (and its generatedAt/treeSha) untouched so CI stays quiet.
  if (existsSync(OUT)) {
    try {
      const prev = JSON.parse(readFileSync(OUT, "utf8")) as { papers: Record<string, unknown> };
      if (JSON.stringify(prev.papers) === JSON.stringify(papersSorted)) {
        console.log(`blueprints unchanged (${Object.keys(papersSorted).length} papers) — file left untouched`);
        return;
      }
    } catch {
      // unreadable previous file → fall through and rewrite
    }
  }
  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`blueprints written: ${Object.keys(papersSorted).length}/${matched.size} (extraction failures: ${failed}, inferred gap fills: ${inferredGaps})`);
}

main();
