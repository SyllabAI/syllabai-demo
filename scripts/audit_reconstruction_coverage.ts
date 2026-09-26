/**
 * Reconstruction coverage audit — do interactive reconstructions hold the
 * FULL official paper, or only part of it?
 *
 * For one course (default igcse-chemistry-19):
 *   1. Group questions.json by sourcePaper (date | number) → held Q numbers + marks.
 *   2. Map each (date, number) to the corpus PDF (session id + dir like 4CH1-1C).
 *   3. Download the official QP from raw.githubusercontent, pdftotext it,
 *      extract "(Total for Question N = M marks)".
 *   4. Compare: Q-number coverage + per-Q mark agreement + total marks.
 *
 * Usage: bun scripts/audit_reconstruction_coverage.ts [course-slug]
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const slug = process.argv[2] ?? "igcse-chemistry-19";
const banks = require(`../content/${slug}/questions.json`);

// ---------- 1. collect reconstructions ----------
interface Rec { key: string; date: string; num: string; qs: Map<number, number>; total: number }
const byPaper = new Map<string, Rec>();
for (const b of banks) {
  for (const q of b.questions ?? []) {
    for (const p of q.parts ?? []) {
      const sp = p.sourcePaper;
      if (!sp || (!sp.date && !sp.number)) break;
      const key = `${sp.date ?? "?"} | ${sp.number ?? "?"}`;
      let rec = byPaper.get(key);
      if (!rec) {
        rec = { key, date: sp.date ?? "?", num: sp.number ?? "?", qs: new Map(), total: 0 };
        byPaper.set(key, rec);
      }
      const qn = sp.questionNumber ?? -1;
      const prev = rec.qs.get(qn) ?? 0;
      rec.qs.set(qn, Math.max(prev, q.totalMarks ?? 0));
      break;
    }
  }
}

// ---------- 2. parse shapes seen in this corpus ----------
// "2021 · Ju1C" "2020 · Ja1CR" "2022 · Jan1C" "2020 · Nov1C" "2019 · Ju1c"
// "2017 · Specimen1C" "2020 · Ja202C" "2020 · N2CR" (glued / abbreviated)
function parse(date: string, num: string) {
  const year = date.match(/(\d{4})/)?.[1];
  if (!year) return null;
  let rest = num.replace(new RegExp(year, "g"), ""); // strip glued year ("Ja202C" → "Ja2C")
  const spec = rest.match(/(Specimen)/i);
  if (spec) {
    const m = rest.match(/(\d)\s*([CR])?$/i);
    if (!m) return null;
    return { sessionId: "specimen", dir: `4CH1-${m[1]}${(m[2] ?? "").toUpperCase()}` };
  }
  const month = rest.match(/^(Jan|Ja|Ju|Jun|June|Nov|N)/i)?.[1]?.toLowerCase();
  let mm: string;
  if (!month) return null;
  if (month.startsWith("ja")) mm = "01";
  else if (month.startsWith("ju")) mm = "06";
  else if (month.startsWith("n")) mm = "11";
  else return null;
  rest = rest.replace(/^(Jan|Ja|Ju|Jun|June|Nov|N)/i, "");
  const pm = rest.match(/(\d)\s*([CR])?$/i);
  if (!pm) return null;
  const unit = pm[1];
  const variant = (pm[2] ?? "").toUpperCase();
  return {
    sessionId: `${year}-${mm}`,
    dir: `4CH1-${unit}${variant}`,
  };
}

// ---------- 3. official QP extraction ----------
import { execSync } from "child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
const CACHE = "/tmp/qp-audit-cache";
mkdirSync(CACHE, { recursive: true });

function officialQuestionMarks(sessionId: string, dir: string): Map<number, number> | null {
  const infix = sessionId === "specimen" ? "specimen" : `past-papers/${sessionId}`;
  const url = `https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/past-papers/pearson-edexcel/international-gcse/chemistry/4ch1/${infix}/${dir}/qp.pdf`;
  const cache = `${CACHE}/${sessionId}-${dir}.txt`;
  let text: string;
  if (existsSync(cache)) text = readFileSync(cache, "utf8");
  else {
    const pdf = `${CACHE}/${sessionId}-${dir}.pdf`;
    try {
      execSync(`curl -sfL "${url}" -o "${pdf}"`, { timeout: 30000 });
      execSync(`pdftotext -layout "${pdf}" "${cache}"`, { timeout: 30000 });
      text = readFileSync(cache, "utf8");
    } catch {
      return null;
    }
  }
  const marks = new Map<number, number>();
  const re = /\(?\s*Total for Question\s*(\d+)\s*=?\s*(\d+)\s*marks?\)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) marks.set(Number(m[1]), Number(m[2]));
  return marks.size > 0 ? marks : null;
}

// ---------- 4. compare ----------
let full = 0, partial = 0, noPdf = 0, markMismatch = 0;
const rows: string[] = [];
const sorted = [...byPaper.values()].sort((a, b) => a.key.localeCompare(b.key));
for (const rec of sorted) {
  const parsed = parse(rec.date, rec.num);
  if (!parsed) {
    noPdf++;
    rows.push(`UNPARSED  ${rec.key} — ${rec.qs.size} held`);
    continue;
  }
  const off = officialQuestionMarks(parsed.sessionId, parsed.dir);
  if (!off) {
    noPdf++;
    rows.push(`NO-PDF    ${rec.key} → ${parsed.sessionId}/${parsed.dir} — ${rec.qs.size} held`);
    continue;
  }
  const offQs = [...off.keys()].sort((a, b) => a - b);
  const heldQs = [...rec.qs.keys()].filter((n) => n > 0).sort((a, b) => a - b);
  const heldCount = heldQs.length;
  const offCount = offQs.length;
  const offTotal = [...off.values()].reduce((a, b) => a + b, 0);
  const heldTotal = [...rec.qs.values()].reduce((a, b) => a + b, 0);
  const missing = offQs.filter((n) => !heldQs.includes(n));
  const extra = heldQs.filter((n) => !offQs.includes(n));
  const markBad = heldQs.filter((n) => off.has(n) && off.get(n) !== rec.qs.get(n));
  const complete = heldCount === offCount && missing.length === 0 && extra.length === 0 && heldTotal === offTotal;
  if (complete) full++; else partial++;
  if (markBad.length) markMismatch++;
  const flag = complete ? "COMPLETE" : "PARTIAL ";
  rows.push(
    `${flag}  ${rec.key.padEnd(22)} → ${parsed.sessionId}/${parsed.dir.padEnd(9)} held ${heldCount}/${offCount} Qs · marks ${heldTotal}/${offTotal}` +
      (missing.length ? ` · missing Q[${missing.join(",")}]` : "") +
      (extra.length ? ` · extra Q[${extra.join(",")}]` : "") +
      (markBad.length ? ` · mark-mismatch Q[${markBad.join(",")}]` : ""),
  );
}
console.log(`Course: ${slug} — ${sorted.length} attested reconstructions`);
console.log(rows.join("\n"));
console.log("---");
console.log(`COMPLETE: ${full} · PARTIAL: ${partial} · unparsed/no-PDF: ${noPdf} · papers with per-Q mark mismatches: ${markMismatch}`);
