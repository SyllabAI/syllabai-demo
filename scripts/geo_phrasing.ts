/** Show how mark footers actually look in a geography QP vs a chemistry QP. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = "/home/z/my-project";
const CACHE = path.join(ROOT, ".blueprint-cache");
mkdirSync(CACHE, { recursive: true });
const { PASTPAPERS_REPO } = await import(path.join(ROOT, "src/lib/pastpapers-shared.ts"));

async function show(qpPath: string, label: string) {
  const key = createHash("sha1").update(qpPath).digest("hex").slice(0, 20);
  const file = path.join(CACHE, `${key}.pdf`);
  let buf: Buffer;
  if (existsSync(file) && existsSync(`${file}.ok`)) buf = readFileSync(file);
  else {
    const url = `https://raw.githubusercontent.com/${PASTPAPERS_REPO}/main/${qpPath}`;
    const res = await fetch(url, { headers: { "User-Agent": "syllabai-demo-diag" } });
    if (!res.ok) return console.log(`${label}: FETCH FAIL ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
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
  const norm = text.replace(/\s+/g, " ");
  console.log(`\n=== ${label} (${norm.length} chars) ===`);
  const lines = norm.match(/.{0,70}[Tt]otal.{0,50}/g) ?? [];
  for (const l of lines.slice(0, 14)) console.log(`  ${JSON.stringify(l.trim())}`);
}

const { corpusPapersForCourse } = await import(path.join(ROOT, "src/lib/pastpapers-corpus.ts"));
const geo = corpusPapersForCourse("igcse-geography-19").find((p) => p.sessionId === "2024-06" && p.dir === "4GE1-01");
if (geo) await show(geo.qpPath, `GEOGRAPHY 2024-06 4GE1-01`);
