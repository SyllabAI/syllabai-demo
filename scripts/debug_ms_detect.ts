/**
 * Debug why detectMsStructure returns null on a real corpus MS.
 * Downloads the PDF, extracts text items with pdfjs, builds lines with the
 * SAME code path as PdfPane (Util.transform + buildLines) and prints the
 * parser's intermediate view.
 * run: bun scripts/debug_ms_detect.ts <corpusPath>
 */
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildLines } from "../src/lib/pdf-lines";
import { detectMsStructure, detectQpQuestions } from "../src/lib/ms-questions";

const path = process.argv[2] ?? "past-papers/pearson-edexcel/international-gcse/chemistry/4ch1/past-papers/2021-06/4CH1-1C/ms.pdf";
const url = `https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/${path}`;
console.log("fetching", url);

const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
console.log("bytes:", buf.length);
const doc = await pdfjs.getDocument({ data: buf }).promise;
console.log("pages:", doc.numPages);

const allLines = [];
for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const geoms = [];
  for (const it of tc.items) {
    if (!("str" in it) || it.str.length === 0) continue;
    const m = pdfjs.Util.transform(vp.transform, it.transform);
    geoms.push({
      str: it.str,
      x: m[4],
      y: m[5],
      h: Math.hypot(m[2], m[3]),
      w: it.width * 1,
    });
  }
  allLines.push(...buildLines(geoms, n));
}
console.log("total lines:", allLines.length);
const emptyText = allLines.filter((l) => l.text.trim().length === 0).length;
console.log("empty-text lines:", emptyText);
const onlyPage = process.argv[3] ? Number(process.argv[3]) : null;
const shown = onlyPage ? allLines.filter((l) => l.page === onlyPage) : allLines.slice(0, 40);
console.log(onlyPage ? `--- page ${onlyPage} lines ---` : "--- first 40 lines (page:y | text | x0→x1) ---");
for (const l of shown) {
  console.log(`p${l.page}:${String(Math.round(l.y)).padStart(4)} | ${l.text.slice(0, 90).padEnd(90)} | ${Math.round(l.x0)}→${Math.round(l.x1)}`);
}

const rows = detectMsStructure(allLines);
console.log("--- detectMsStructure:", rows ? `${rows.length} rows` : "NULL");
if (rows) console.log(rows.map((r) => `${r.label}=${r.max ?? "?"}`).join("  "));
if (process.argv[4]) {
  const needle = process.argv[4];
  const hit = allLines.find((l) => l.text.includes(needle));
  if (hit) {
    console.log(`--- items of line containing "${needle}" (page ${hit.page})`);
    for (const it of hit.items) console.log(`  x0=${it.x0.toFixed(1)} x1=${it.x1.toFixed(1)} str=${JSON.stringify(it.str)}`);
    console.log(`  line x0=${hit.x0.toFixed(1)} x1=${hit.x1.toFixed(1)} starts=${hit.starts.join(",")}`);
  } else console.log(`no line contains ${needle}`);
}

const qs = detectQpQuestions(allLines);
console.log("--- detectQpQuestions:", qs ? `${qs.length} questions` : "NULL");
if (qs) console.log(qs.map((q) => `${q.label}@p${q.page}`).join("  "));
