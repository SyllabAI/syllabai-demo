/**
 * Diagnose the two per-subject anomalies:
 *  1. unverified rows — which matched corpus keys have no blueprint, and why
 *     did extraction fail (fetch 404? no text layer? unexpected phrasing?)
 *  2. igcse-physics-19 — 45 interactive, 0 complete: are the partials truly
 *     partial (missing many Qs) or near-miss (missing 1-2)?
 * Usage: bun scripts/coverage_diagnose.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = "/home/z/my-project";
const CACHE = path.join(ROOT, ".blueprint-cache");
mkdirSync(CACHE, { recursive: true });

const { corpusPapersForCourse } = await import(
  path.join(ROOT, "src/lib/pastpapers-corpus.ts")
);
const { collectPastPapers } = await import(
  path.join(ROOT, "src/lib/past-papers.ts")
);
const {
  matchReconstructions,
  blueprintFor,
  computeCoverage,
} = await import(path.join(ROOT, "src/lib/pastpapers-reconstruction.ts"));
const { PASTPAPERS_REPO } = await import(
  path.join(ROOT, "src/lib/pastpapers-shared.ts")
);

async function fetchCachedPdf(qpPath: string): Promise<Buffer | null> {
  const key = createHash("sha1").update(qpPath).digest("hex").slice(0, 20);
  const file = path.join(CACHE, `${key}.pdf`);
  if (existsSync(file) && existsSync(`${file}.ok`)) return readFileSync(file);
  const url = `https://raw.githubusercontent.com/${PASTPAPERS_REPO}/main/${qpPath}`;
  const res = await fetch(url, { headers: { "User-Agent": "syllabai-demo-diag" } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024 || !(buf.subarray(0, 4).toString() === "%PDF")) return null;
  writeFileSync(file, buf);
  writeFileSync(`${file}.ok`, "1");
  return buf;
}

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
async function extractText(buf: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    text += tc.items.map((it) => ("str" in it ? it.str : "")).join(" ") + " \n";
  }
  return text;
}

// ── 1. unverified rows: sample a few, extract their text, see why ──────────
const UNVERIFIED_SLUGS = [
  "igcse-geography-19",
  "igcse-accounting-17-financial-statements",
];
const seen = new Map<string, string>(); // corpusKey → qpPath

for (const slug of UNVERIFIED_SLUGS) {
  const banks = JSON.parse(
    readFileSync(path.join(ROOT, "content", slug, "questions.json"), "utf8"),
  );
  const recons = collectPastPapers(banks);
  const papers = corpusPapersForCourse(slug);
  const { reconForCorpus } = matchReconstructions(papers, recons);
  for (const [corpusKey, recon] of reconForCorpus) {
    if (blueprintFor(corpusKey)) continue; // has blueprint
    if (seen.has(corpusKey)) continue;
    const row = papers.find(
      (p) => `${p.sessionId}:${p.dir}` === corpusKey,
    );
    if (row?.qpPath) seen.set(corpusKey, row.qpPath);
  }
}

console.log(`=== UNVERIFIED diagnosis: ${seen.size} rows to probe ===`);
let probe = 0;
for (const [corpusKey, qpPath] of seen) {
  if (probe >= 4) break; // sample 2 per course
  probe++;
  const buf = await fetchCachedPdf(qpPath);
  if (!buf) {
    console.log(`${corpusKey}  FETCH-FAIL ${qpPath}`);
    continue;
  }
  const text = await extractText(buf);
  const norm = text.replace(/\s+/g, " ");
  const perQ = [...norm.matchAll(/Total for Question\s*(\d+)\s*(?:=|is)?\s*(\d+)\s*marks?/gi)];
  const paperTotal = [...norm.matchAll(/Total for (?:the )?paper\s*=?\s*(\d+)\s*marks?/gi)].at(-1);
  console.log(
    `${corpusKey}  textLen=${norm.length} perQMatches=${perQ.length} paperTotal=${paperTotal?.[1] ?? "none"}`,
  );
  if (perQ.length === 0 && norm.length > 0) {
    // show candidate mark-line phrasings
    const cand = norm.match(/[^.]{0,60}marks?[^.]{0,20}/gi)?.slice(0, 5) ?? [];
    console.log(`   phrasing samples: ${cand.map((s) => JSON.stringify(s.trim().slice(0, 70))).join(" | ")}`);
    const totalCand = norm.match(/[Tt]otal[^.]{0,50}/g)?.slice(0, 4) ?? [];
    console.log(`   total samples:    ${totalCand.map((s) => JSON.stringify(s.trim().slice(0, 60))).join(" | ")}`);
  }
}

// ── 2. igcse-physics-19 partials: how partial are they? ────────────────────
console.log(`\n=== igcse-physics-19 partial profile ===`);
{
  const slug = "igcse-physics-19";
  const banks = JSON.parse(
    readFileSync(path.join(ROOT, "content", slug, "questions.json"), "utf8"),
  );
  const recons = collectPastPapers(banks);
  const papers = corpusPapersForCourse(slug);
  const { reconForCorpus } = matchReconstructions(papers, recons);
  const buckets = { nearMiss: 0, mid: 0, tiny: 0, other: 0 };
  for (const [corpusKey, recon] of reconForCorpus) {
    const cov = computeCoverage(recon, blueprintFor(corpusKey));
    if (!cov) continue;
    const line = `${corpusKey}: ${cov.heldQuestions}/${cov.officialQuestions} Qs · ${cov.heldMarks}/${cov.officialMarks} marks · missing Q${cov.missing.slice(0, 8).join(",Q")}${cov.missing.length > 8 ? "…" : ""}`;
    if (cov.state === "partial") {
      const ratio = cov.heldQuestions / cov.officialQuestions;
      if (ratio >= 0.8) buckets.nearMiss++;
      else if (ratio >= 0.4) buckets.mid++;
      else buckets.tiny++;
      if (ratio >= 0.8) console.log(`NEAR-MISS ${line}`);
    }
  }
  console.log(
    `partial buckets → near-miss(≥80%): ${buckets.nearMiss} · mid(40-79%): ${buckets.mid} · tiny(<40%): ${buckets.tiny}`,
  );
}
