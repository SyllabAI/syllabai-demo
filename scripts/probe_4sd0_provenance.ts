/**
 * probe_4sd0_provenance.ts — decide whether the double-award chemistry
 * recons (unit-null "1C"-style tags) are transcribed from 4SD0 papers or
 * from linear 4CH1 papers. Extracts the local 4SD0/1C QP blueprint with the
 * same pdfjs pipeline as the builder and compares against:
 *   (a) the recon's held marks, and
 *   (b) the already-built linear blueprint (2022-01:4CH1-1C).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
async function extractFromPdf(buf: Buffer) {
  const pdfjs: PdfJsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    text += tc.items.map((it) => ("str" in it ? it.str : "")).join(" ") + " \n";
  }
  const norm = text.replace(/\s+/g, " ");
  const marks = new Map<number, number>();
  for (const m of norm.matchAll(/Total for Question\s*(\d+)\s*(?:=|is)?\s*(\d+)\s*marks?/gi)) {
    const qn = Number(m[1]);
    const mk = Number(m[2]);
    if (Number.isInteger(qn) && Number.isInteger(mk) && mk > 0 && mk <= 60) {
      marks.set(qn, Math.max(marks.get(qn) ?? 0, mk));
    }
  }
  const pt = [...norm.matchAll(/Total for (?:the )?paper\s*=?\s*(\d+)\s*marks?/gi)].at(-1);
  return { marks, paperTotal: pt ? Number(pt[1]) : null, norm };
}

const { collectPastPapers } = await import(path.join(ROOT, "src/lib/past-papers.ts"));
const { parseReconstruction } = await import(path.join(ROOT, "src/lib/pastpapers-reconstruction.ts"));

const banks = JSON.parse(
  readFileSync(path.join(ROOT, "content/igcse-science-double-award-17-chemistry/questions.json"), "utf8"),
);
const recons = collectPastPapers(banks);

for (const [session, variant] of [
  ["2022-01", "1C"],
  ["2021-01", "1C"],
  ["2019-06", "1C"],
] as const) {
  const recon = recons.find((r) => {
    const p = parseReconstruction(r.date, r.number);
    return p?.sessionIds.includes(session) && p?.variant === variant && !p.unit;
  });
  if (!recon) {
    console.log(`${session} ${variant}: recon not found`);
    continue;
  }
  const held = new Map<number, number>();
  recon.questions.forEach((q: { totalMarks?: number }, i: number) => {
    const qn = recon.questionNumbers?.[i];
    if (qn) held.set(qn, (held.get(qn) ?? 0) + (q.totalMarks ?? 0));
  });
  const heldArr = [...held.entries()].sort((a, b) => a[0] - b[0]);
  const heldSum = heldArr.reduce((a, [, m]) => a + m, 0);
  console.log(`\n== recon ${session} ${variant}: ${held.size} questions, ${heldSum} marks`);
  console.log("   held:", heldArr.map(([q, m]) => `Q${q}=${m}`).join(" "));

  // 4SD0 local QP blueprint
  const qp = path.join(
    ROOT,
    `upload/4sd0/past-papers/pearson-edexcel/international-gcse/science-double-award/4sd0/past-papers/${session}/4SD0-${variant}/qp.pdf`,
  );
  try {
    const sd0 = await extractFromPdf(readFileSync(qp));
    const sd0Arr = [...sd0.marks.entries()].sort((a, b) => a[0] - b[0]);
    console.log(`   4SD0-${variant}: ${sd0.marks.size} questions, paperTotal=${sd0.paperTotal}`);
    console.log("   official:", sd0Arr.map(([q, m]) => `Q${q}=${m}`).join(" "));
    const same =
      sd0Arr.length === heldArr.length &&
      sd0Arr.every(([q, m]) => held.get(q) === m);
    console.log(`   → recon == 4SD0 blueprint? ${same ? "YES" : "no"}`);
  } catch (e) {
    console.log(`   4SD0 QP extract failed: ${(e as Error).message}`);
  }

  // linear blueprint (from committed blueprints)
  const bps = JSON.parse(readFileSync(path.join(ROOT, "src/data/pastpapers-blueprints.json"), "utf8"));
  const lin = bps.papers[`${session}:4CH1-${variant}`];
  if (lin) {
    const linArr = Object.entries(lin.marks).map(([q, m]) => [Number(q), m] as const).sort((a, b) => a[0] - b[0]);
    const linSum = linArr.reduce((a, [, m]) => a + m, 0);
    console.log(`   4CH1-${variant} (linear bp): ${linArr.length} questions, ${linSum} marks`);
    const sameLin =
      linArr.length === heldArr.length && linArr.every(([q, m]) => held.get(q) === m);
    console.log(`   → recon == 4CH1 blueprint? ${sameLin ? "YES" : "no"}`);
  } else {
    console.log(`   4CH1-${variant}: no blueprint`);
  }
}
