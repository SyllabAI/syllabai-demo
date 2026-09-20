/**
 * POC: end-to-end math fix for the exact note the user reported.
 * 1. fetch SME page -> (aria-label, MathML) pairs -> MathMLToLaTeX dict
 * 2. look up every polluted span in the corpus note bodyMd
 * 3. KaTeX-validate replacements
 * Run: bun scripts/poc_math_fix_23a.ts
 */
import { readFileSync } from "fs";
import { MathMLToLaTeX } from "mathml-to-latex";
import katex from "katex";

const NOTE_URL =
  "https://www.savemyexams.com/igcse/maths/edexcel/b/16/revision-notes/algebra/algebraic-fractions/adding-and-subtracting-algebraic-fractions";

// 1. extract (aria-label, mathml) from already-fetched page
// spans carry data-mathml + aria-label in any attribute order, sometimes data-type too
const html = readFileSync("/tmp/sme_page.html", "utf-8");
const pairRe =
  /<span\b[^>]*\bdata-mathml\b[^>]*\baria-label="([^"]*)"[^>]*>(<math\b[\s\S]*?<\/math>)<\/span>|<span\b[^>]*\baria-label="([^"]*)"[^>]*\bdata-mathml\b[^>]*>(<math\b[\s\S]*?<\/math>)<\/span>/g;
const dict = new Map<string, string>();
let m: RegExpExecArray | null;
let convFail = 0;
while ((m = pairRe.exec(html))) {
  const aria = (m[1] ?? m[3]).replace(/\s+/g, " ").trim();
  const mathml = m[2] ?? m[4];
  if (dict.has(aria)) continue;
  try {
    const tex = MathMLToLaTeX.convert(mathml);
    if (tex.trim()) dict.set(aria, tex);
    else convFail++;
  } catch {
    convFail++;
  }
}
console.log(`dict: ${dict.size} unique aria-labels (convFail=${convFail})`);

// 2. load the corpus note
const notes = JSON.parse(
  readFileSync("/home/z/my-project/content/igcse-maths-b-16/notes.json", "utf-8"),
);
const note = notes.find((n: any) => n.noteId === "rn_XDKBYvZP5QNfgHTx");

// 3. replace polluted spans
const CODE = /`([^`\n]+)`/g;
let hits = 0,
  segHits = 0,
  misses = 0;
const missSamples: string[] = [];
const MARK = /\b(open parentheses|close parentheses|fraction numerator|end fraction|to the power of|square root of|end table|plus-or-minus|identical to|cross times|subscript|superscript|end style|begin mathsize)\b/;

// greedy longest-prefix segmentation of a concatenated speech string over dict keys
function segmentLookup(key: string): string | null {
  const keys = [...dict.keys()].sort((a, b) => b.length - a.length);
  let rest = key;
  let out = "";
  let used = false;
  while (rest.length) {
    // strip leading space
    if (rest.startsWith(" ")) {
      rest = rest.slice(1);
      continue;
    }
    const k = keys.find((c) => rest.startsWith(c));
    if (!k) return null;
    out += dict.get(k)!;
    used = true;
    rest = rest.slice(k.length);
  }
  return used ? out : null;
}

const fixed = note.bodyMd.replace(CODE, (whole, inner: string) => {
  if (!MARK.test(inner)) return whole;
  const key = inner.replace(/\s+/g, " ").trim();
  let tex = dict.get(key);
  let seg = false;
  if (!tex) {
    tex = segmentLookup(key);
    seg = true;
  }
  if (!tex) {
    misses++;
    if (missSamples.length < 5) missSamples.push(key.slice(0, 90));
    return whole;
  }
  try {
    katex.renderToString(tex, { throwOnError: true, strict: "ignore" });
    if (seg) segHits++;
    else hits++;
    return `$${tex}$`;
  } catch {
    misses++;
    if (missSamples.length < 5) missSamples.push("KATEX:" + tex!.slice(0, 90));
    return whole;
  }
});

console.log(`span replacement: ${hits} exact, ${segHits} segmented, ${misses} missed`);
if (missSamples.length) console.log("misses:", missSamples);

// also count $..$ pollution
const DOLLAR = /(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g;
let dollarPolluted = 0;
for (const d of fixed.matchAll(DOLLAR)) if (MARK.test(d[1])) dollarPolluted++;
console.log("remaining polluted $..$ segments:", dollarPolluted);

// show a before/after excerpt
const before = note.bodyMd.match(/[^\n]*lowest common denominator[^\n]*/)?.[0] ?? "";
const after = fixed.match(/[^\n]*STEP 1[^\n]*/)?.[0] ?? "";
console.log("\nBEFORE:", before.slice(0, 200));
console.log("\nAFTER :", after.slice(0, 200));
