/**
 * Probe #1 for "tackle those":
 *  A. Accounting QP — why did extraction fail? (fetch text, count per-Q footers,
 *     look at phrasing + paper totals + rubric)
 *  B. Geography rubric — confirm the optional-choice structure ("answer TWO of..."),
 *     so the builder can trust sum-of-footers > paperTotal for such papers.
 * Usage: bun scripts/probe_optional_choice.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = "/home/z/my-project";
const CACHE = path.join(ROOT, ".blueprint-cache");
mkdirSync(CACHE, { recursive: true });
const { PASTPAPERS_REPO } = await import(path.join(ROOT, "src/lib/pastpapers-shared.ts"));
const { corpusPapersForCourse } = await import(path.join(ROOT, "src/lib/pastpapers-corpus.ts"));

async function fetchText(qpPath: string): Promise<string | null> {
  const key = createHash("sha1").update(qpPath).digest("hex").slice(0, 20);
  const file = path.join(CACHE, `${key}.pdf`);
  let buf: Buffer;
  if (existsSync(file) && existsSync(`${file}.ok`)) buf = readFileSync(file);
  else {
    const url = `https://raw.githubusercontent.com/${PASTPAPERS_REPO}/main/${qpPath}`;
    const res = await fetch(url, { headers: { "User-Agent": "syllabai-demo-diag" } });
    if (!res.ok) return null;
    buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(0, 4).toString() !== "%PDF") return null;
    writeFileSync(file, buf); writeFileSync(`${file}.ok`, "1");
  }
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

function analyse(qpPath: string, label: string, text: string) {
  const norm = text.replace(/\s+/g, " ");
  console.log(`\n=== ${label} (${qpPath}) ===`);
  console.log(`chars: ${norm.length}`);
  const perQ = [...norm.matchAll(/Total for Question\s*(\d+)\s*(?:=|is)?\s*(\d+)\s*marks?/gi)];
  console.log(`perQ footers: ${perQ.length} → ${perQ.map((m) => `Q${m[1]}=${m[2]}`).join(" ")}`);
  const secs = [...norm.matchAll(/TOTAL FOR SECTION [A-Z]\s*=?\s*(\d+)\s*marks?/gi)];
  console.log(`section totals: ${secs.map((m) => m[1]).join(", ") || "none"}`);
  const pt = [...norm.matchAll(/Total for (?:the )?paper\s*=?\s*(\d+)\s*marks?/gi)].at(-1);
  const rubric =
    norm.match(/[Ii]nstructions[^.]{0,400}/)?.[0] ??
    norm.slice(0, 600);
  console.log(`paperTotal regex: ${pt?.[1] ?? "none"}`);
  console.log(`rubric extract: ${JSON.stringify(rubric.slice(0, 400))}`);
  const choice = norm.match(/[Aa]nswer[^.]{0,120}/g)?.filter((s) =>
    /\b(ONE|TWO|THREE|FOUR|FIVE|1|2|3|4|5)\b/i.test(s),
  );
  console.log(`choice-ish rubric lines: ${choice?.slice(0, 4).map((s) => JSON.stringify(s.trim())).join(" | ")}`);
}

// A. Accounting — first 3 unverified rows
const acc = corpusPapersForCourse("igcse-accounting-17-financial-statements");
const accBanks = JSON.parse(readFileSync(path.join(ROOT, "content/igcse-accounting-17-financial-statements/questions.json"), "utf8"));
const { matchReconstructions, blueprintFor } = await import(path.join(ROOT, "src/lib/pastpapers-reconstruction.ts"));
const { collectPastPapers } = await import(path.join(ROOT, "src/lib/past-papers.ts"));
const accRecons = collectPastPapers(accBanks);
const accMatch = matchReconstructions(acc, accRecons);
let probed = 0;
for (const corpusKey of accMatch.matchKeys.keys()) {
  if (blueprintFor(corpusKey)) continue;
  if (probed >= 2) break;
  probed++;
  const row = acc.find((p) => `${p.sessionId}:${p.dir}` === corpusKey);
  if (!row?.qpPath) continue;
  const text = await fetchText(row.qpPath);
  if (!text) { console.log(`\n=== ACCOUNTING ${corpusKey}: FETCH FAIL ===`); continue; }
  analyse(row.qpPath, `ACCOUNTING ${corpusKey}`, text);
}

// B. Geography rubric — one paper, full instruction block
const geo = corpusPapersForCourse("igcse-geography-19").find((p) => p.sessionId === "2024-06" && p.dir === "4GE1-01");
if (geo?.qpPath) {
  const text = await fetchText(geo.qpPath);
  if (text) {
    const norm = text.replace(/\s+/g, " ");
    const start = norm.indexOf("Instructions");
    console.log(`\n=== GEOGRAPHY 4GE1-01 full instructions ===`);
    console.log(start >= 0 ? norm.slice(start, start + 700) : norm.slice(400, 1100));
  }
}
