/**
 * Sanity tests for pdf-lines.ts + ms-questions.ts (run: bun scripts/test_pdf_lines.ts)
 * Synthetic viewport-space items at scale 1 — geometry mimics a simple grid.
 */
import {
  buildLines,
  findRegex,
  findInLines,
  matchRects,
  type ItemGeom,
  type PdfLine,
} from "../src/lib/pdf-lines";
import { detectMsStructure, detectQpQuestions } from "../src/lib/ms-questions";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name}`, detail ?? "");
  }
}

/** Line of text starting at (x,y), each word its own item with a visual gap. */
function lineOf(words: string[], x: number, y: number, h = 10, charW = 5): ItemGeom[] {
  const items: ItemGeom[] = [];
  let cx = x;
  for (const w of words) {
    items.push({ str: w, x: cx, y, h, w: w.length * charW });
    cx += w.length * charW + h * 0.35; // visual gap → reconstructed space
  }
  return items;
}

// ── buildLines ──────────────────────────────────────────────────────────────
{
  const geoms = [
    ...lineOf(["1", "(a)", "sodium", "chloride"], 40, 100),
    ...lineOf(["and", "water"], 260, 100), // same baseline → same line
    ...lineOf(["(2)"], 480, 100), // same baseline, right column
    ...lineOf(["(b)", "Type", "III"], 40, 130),
  ];
  const lines: PdfLine[] = buildLines(geoms, 3);
  check("buildLines: two baselines → two lines", lines.length === 2, lines.map((l) => l.text));
  check(
    "buildLines: spaces reconstructed across item gaps",
    lines[0].text === "1 (a) sodium chloride and water (2)",
    lines[0].text,
  );
  check("buildLines: item/starts parallel", lines[0].items.length === lines[0].starts.length);

  // ── find ──────────────────────────────────────────────────────────────────
  const re = findRegex("sodium chloride");
  const hits = findInLines(lines, re);
  check("find: cross-item phrase found", hits.length === 1 && hits[0].lineIdx === 0, hits);
  const re2 = findRegex("(b) type iii");
  check("find: case-insensitive + part label", findInLines(lines, re2).length === 1);

  // ── rects ─────────────────────────────────────────────────────────────────
  const l0 = lines[0];
  const start = l0.text.indexOf("sodium");
  const rects = matchRects(l0, start, start + "sodium chloride".length);
  // one rect per item the match touches — the gap space belongs to no item
  check("rects: 2 rects (sodium, chloride)", rects.length === 2, rects);
  const within = rects[0];
  const itemSodium = l0.items.find((i) => i.str === "sodium")!;
  check(
    "rects: interpolated inside item box",
    within.x >= itemSodium.x0 && within.x + within.w <= itemSodium.x1 + 1,
    { within, itemSodium },
  );
  const frac = matchRects(l0, start, start + 3); // "sod"
  check("rects: partial char interpolation ~60%", Math.abs(frac[0].w - 3 * 5) < 1.5, frac[0]);
}

// ── MS structure ─────────────────────────────────────────────────────────────
{
  // Two-column MS: question rows at x=40, marks column at x=470..500
  const mk = (words: string[], y: number, marks?: string): ItemGeom[] => [
    ...lineOf(words, 40, y),
    ...(marks ? lineOf([marks], 480, y) : []),
  ];
  const geoms: ItemGeom[] = [
    ...lineOf(["Mark", "Scheme"], 300, 20), // boilerplate
    ...lineOf(["Question", "Answer", "Marks"], 40, 40),
    ...mk(["1", "chlorine", "added"], 70, "1"),
    ...mk(["(b)", "sodium", "hydroxide"], 100, "2"),
    ...mk(["2", "(a)(i)", "litmus", "blue"], 140, "1"),
    ...mk(["(ii)", "pH", "meter", "reading"], 170, "3"),
    ...mk(["3", "any", "two", "from:"], 210, "2"),
  ];
  const lines = buildLines(geoms, 1);
  const rows = detectMsStructure(lines);
  check("MS: detected 5 rows", rows?.length === 5, rows);
  check("MS: labels 1, 1(b), 2(a)(i), 2(a)(ii), 3", rows?.map((r) => r.label).join(",") === "1,1(b),2(a)(i),2(a)(ii),3", rows);
  check("MS: max values [1,2,1,3,2]", rows?.map((r) => r.max).join(",") === "1,2,1,3,2", rows);

  // Noisy: garbage lines → null
  const noisy = buildLines(
    [...lineOf(["the", "answer", "is", "42"], 40, 60), ...lineOf(["hello", "world"], 40, 90)],
    1,
  );
  check("MS: noisy non-table text → null", detectMsStructure(noisy) === null);
}

// ── QP structure ─────────────────────────────────────────────────────────────
{
  const geoms: ItemGeom[] = [
    ...lineOf(["Answer", "ALL", "questions"], 200, 20),
    ...lineOf(["1", "(a)", "Define", "atomic", "number"], 40, 60),
    ...lineOf(["Total", "for", "Question", "1", "is", "6", "marks"], 300, 85),
    ...lineOf(["2", "marks", "available"], 40, 260), // prose — must NOT be Q2
    ...lineOf(["2", "The", "student", "measured", "the", "temperature"], 40, 120),
    ...lineOf(["3", "(a)", "State", "one", "hazard"], 40, 180),
  ];
  const lines = buildLines(geoms, 2);
  const qs = detectQpQuestions(lines);
  check("QP: 3 questions", qs?.length === 3, qs);
  check("QP: Q1 page 2", qs?.[0].label === "Q1" && qs?.[0].page === 2);
  // "Total for Question 1" must not be read as a question start
  check("QP: boilerplate totals excluded", !qs?.some((q) => q.label === "Q6"));

  const sparse = buildLines([...lineOf(["7", "Something"], 40, 60)], 1);
  check("QP: sparse/no-Q1 → null", detectQpQuestions(sparse) === null);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
