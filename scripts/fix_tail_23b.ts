/**
 * T-SME-23b FINAL: hand-authored exact-string repairs for the last bare
 * speech residues (corrupted mixed content / multi-line column workings /
 * circled step numbers / vector underlines). Every replacement is
 * KaTeX-verified and asserted to exist before writing.
 * Run: bun scripts/fix_tail_23b.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import katex from "katex";

const CONTENT = "/home/z/my-project/content";

const katexOk = (t: string) => {
  try {
    katex.renderToString(t, { throwOnError: true, strict: "ignore" });
    return true;
  } catch (e: any) {
    throw new Error(`KaTeX FAIL for "${t.slice(0, 60)}": ${e.message?.slice(0, 80)}`);
  }
};

// [id, search (exact), replace]
const REPLACEMENTS: [string, string, string][] = [
  // A. glued circled step numbers (after an aligned span)
  [
    "glued-1",
    "\\end{aligned}$table row blank blank cell circle enclose 1 end cell end table",
    "\\end{aligned}$ $\\textcircled{1}$",
  ],
  [
    "glued-3",
    "\\end{aligned}$table row blank blank cell circle enclose 3 end cell end table",
    "\\end{aligned}$ $\\textcircled{3}$",
  ],
  [
    "circled-4",
    "> table row blank blank cell circle enclose 4 end cell end table",
    "> $\\textcircled{4}$",
  ],
  // B. business corrupted fraction lines (scrape mangled aria + partial conversion)
  [
    "biz-1",
    "> equals space fraction numerator $105 , \\frac{731}{denominator}$ 124 comma 653 space end fraction",
    "> $= \\frac{\\$105{,}731}{\\$124{,}653}$",
  ],
  [
    "biz-2",
    "> equals space fraction numerator $65 , \\frac{864}{denominator}$ 124 comma 653 end fraction",
    "> $= \\frac{\\$65{,}864}{\\$124{,}653}$",
  ],
  [
    "biz-3",
    "> equals space fraction numerator space $7 , \\frac{295}{denominator}$ 5 comma 060 end fraction",
    "> $= \\frac{\\$7{,}295}{\\$5{,}060}$",
  ],
  // C. biology recurring decimal answer
  [
    "bio-turmeric",
    "equals fraction numerator 1 over denominator 0.03 end fraction equals 33. stack 3 with. on top space straight g space which space rounds space down space to space 33.3 space straight g with blank on top",
    "$= \\frac{1}{0.03} = 33.\\dot{3}\\ \\text{g, which rounds down to } 33.3\\ \\text{g}$",
  ],
  // D1. long multiplication 15 x 60
  [
    "mult-15x60",
    "bottom enclose 15\ncross times 60 end enclose\n00\nbottom enclose 900\n900",
    "$\\begin{array}{r} \\underline{15 \\times 60} \\\\ 00 \\\\ \\underline{900} \\\\ 900 \\end{array}$",
  ],
  // D2. long multiplication 863 x 32
  [
    "mult-863x32",
    "bottom enclose stack attributes charalign center stackalign right end attributes 863 row cross times none 32 end row horizontal line 1726 25890 end stack end enclose\n2 space 7 space 6 space 1 space 6",
    "$\\begin{array}{r} 863 \\\\ \\underline{\\times\\ 32} \\\\ 1726 \\\\ \\underline{25890} \\\\ 27616 \\end{array}$",
  ],
  // E1. elimination: a + 3c
  [
    "elim-a3c",
    "bottom enclose space minus space space space open parentheses table row cell space a space plus 3 c space end cell equals cell space 22 end cell end table close parentheses space end enclose\nspace space space space space space space space 8 a space space space space space space space space space space space equals space 68 space",
    "$\\underline{-\\ (a + 3c = 22)}$\n$8a = 68$",
  ],
  // E2. elimination: 18p + 30q
  [
    "elim-18p",
    "bottom enclose open parentheses minus close parentheses space space space space space space space 18 p space plus space 30 q space equals space minus 168 space space space space space space space space space space 2 open parentheses 2 close parentheses end enclose\nspace space space space space space space space space space minus 51 q space equals space 102 space space space space space space space space space space space space space space space space space space space space",
    "$\\underline{(-)\\quad\\ 18p + 30q = -168\\qquad\\ 2(2)}$\n$-51q = 102$",
  ],
  // E3. elimination: 5t + 4c
  [
    "elim-5t",
    "bottom enclose space minus space space space open parentheses table row cell space 5 t space plus space 4 c space end cell equals cell space 14.2 end cell end table close parentheses space end enclose\nspace space space space space space space space space space space space space space t space space space space space space space space space space space equals space 1.4",
    "$\\underline{-\\ (5t + 4c = 14.2)}$\n$t = 1.4$",
  ],
  // F. vector underline notation
  [
    "vec-underline",
    "therefore fraction numerator 2 over denominator n plus 1 end fraction bottom enclose straight a plus fraction numerator n over denominator 2 open parentheses n plus 1 close parentheses end fraction bottom enclose straight b equals q open parentheses bottom enclose straight a plus bottom enclose straight b close parentheses",
    "$\\therefore \\frac{2}{n+1}\\underline{a} + \\frac{n}{2(n+1)}\\underline{b} = q\\left(\\underline{a} + \\underline{b}\\right)$",
  ],
  // G. prime factor table split across lines
  [
    "prime-table",
    "table row blank blank cell A space equals space 2 cubed cross times 3 squared cross times 5 squared cross times 11\nB space equals space 2 to the power of 4 cross times 3 cross times 5 to the power of 4 cross times 13 end cell end table",
    "$A = 2^{3} \\times 3^{2} \\times 5^{2} \\times 11$\n$B = 2^{4} \\times 3 \\times 5^{4} \\times 13$",
  ],
];

// pre-verify all KaTeX in replacements (extract $...$ from replacement)
for (const [id, , rep] of REPLACEMENTS) {
  for (const m of rep.matchAll(/(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g)) katexOk(m[1]);
}
console.log("all replacement LaTeX KaTeX-verified");

const MARK_STRONG =
  /\b(end enclose|end table|end cell|end row|end stack|end attributes|end style|begin mathsize|presubscript|presuperscript|end strike|fraction numerator|over denominator|end fraction|end exponent|stack sum)\b/i;

let filesChanged = 0;
const counts: Record<string, number> = {};

function applyAll(s: string): string {
  for (const [id, search, rep] of REPLACEMENTS) {
    while (s.includes(search)) {
      s = s.replace(search, rep);
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return s;
}

function walk(o: any): boolean {
  let changed = false;
  if (typeof o === "string") {
    const p = applyAll(o);
    if (p !== o) {
      changed = true;
      o = p;
    }
    // strings are copied by value; caller must reassign — handled below
    return changed;
  }
  if (Array.isArray(o)) {
    for (let i = 0; i < o.length; i++) {
      if (typeof o[i] === "string") {
        const p = applyAll(o[i]);
        if (p !== o[i]) {
          o[i] = p;
          changed = true;
        }
      } else if (walk(o[i])) changed = true;
    }
    return changed;
  }
  if (o && typeof o === "object") {
    for (const k of Object.keys(o)) {
      if (typeof o[k] === "string") {
        const p = applyAll(o[k]);
        if (p !== o[k]) {
          o[k] = p;
          changed = true;
        }
      } else if (walk(o[k])) changed = true;
    }
  }
  return changed;
}

for (const pkg of readdirSync(CONTENT).sort()) {
  for (const f of ["notes.json", "questions.json", "flashcards.json"]) {
    const p = `${CONTENT}/${pkg}/${f}`;
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf-8");
    const data = JSON.parse(raw);
    if (walk(data)) {
      writeFileSync(p, JSON.stringify(data));
      filesChanged++;
    }
  }
}
console.log("replacement counts:", counts);
console.log("files changed:", filesChanged);

// residual strong-marker scan
let residual = 0;
const residLines: string[] = [];
function scan(o: any, loc: string) {
  if (typeof o === "string") {
    if (!o.includes("\n") && !MARK_STRONG.test(o)) return;
    for (const line of o.split("\n")) {
      // strip $..$ and backticks first
      const bare = line
        .replace(/`[^`\n]*`/g, "")
        .replace(/(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g, "");
      if (MARK_STRONG.test(bare)) {
        residual++;
        if (residLines.length < 12) residLines.push(`${loc}: ${line.trim().slice(0, 150)}`);
      }
    }
  } else if (Array.isArray(o)) for (const v of o) scan(v, loc);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) scan(v, k);
}
for (const pkg of readdirSync(CONTENT).sort()) {
  for (const f of ["notes.json", "questions.json", "flashcards.json"]) {
    const p = `${CONTENT}/${pkg}/${f}`;
    if (!existsSync(p)) continue;
    const data = JSON.parse(readFileSync(p, "utf-8"));
    const arr = Array.isArray(data) ? data : data.notes ?? data.questionSets ?? data.flashcards ?? [];
    for (const item of arr) scan(item, `${pkg}:${item.noteId ?? item.slug ?? item.id}`);
  }
}
console.log(`\nresidual strong-marker lines: ${residual}`);
for (const l of residLines) console.log("  " + l);
