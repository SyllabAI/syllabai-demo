/**
 * T-SME-23b CORPUS GATE — blocks MathML speech-text pollution from ever
 * reaching production again.
 *
 * Walks PARSED corpus strings (raw-JSON scans false-positive across fields)
 * and fails when pollution exceeds the frozen baseline:
 *   - speech-baseline.json refrozen to ZERO after the 2026-09-21 23b
 *     residue repair (menclose family, isotopes, physics MCQ pages,
 *     recon word-artifacts: intersection/union/apostrophe/ordinals).
 *   - Any future SME import that skips the aria-label→MathML→LaTeX
 *     extraction blows past the baseline and FAILS the build.
 * Run: bun scripts/verify_corpus_23a.ts   (wired as `prebuild`)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";

// relative paths — this runs on Vercel via prebuild too
const CONTENT = process.cwd() + "/content";
const BASELINE_FILE = process.cwd() + "/speech-baseline.json";

const MARK = new RegExp(
  "\\b(open parentheses|close parentheses|open bracket|close bracket|" +
    "open curly|close curly|open square brackets|close square brackets|" +
    "open angle brackets|close angle brackets|fraction numerator|" +
    "over denominator|end fraction|end table|end cell|end row|end stack|" +
    "end attributes|end style|end enclose|end exponent|to the power|" +
    "square root|end root|cube root|with bar on top|subscript|superscript|" +
    "presubscript|presuperscript|stack sum|sum from|sum for|begin mathsize|" +
    "rightwards arrow|left parenthesis|right parenthesis|left bracket|" +
    "right bracket|vertical line|vertical strike|horizontal strike|" +
    "identical to|cross times|plus-or-minus|end strike|asterisk times|" +
    "enclose|up diagonal strike|down diagonal strike|intersection|union|" +
    "empty set|proportional to|almost equal to|less or equal than|" +
    "greater or equal than|apostrophe)\\b",
  "i",
);
const CODE1 = /`([^`\n]+)`/g;
const CODE_ML = /`([^`]+)`/gs;
const DOLLAR = /(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g;
const BAD_TEXT_CONTENT =
  /^\s*(end|open|close|left|right|fraction|numerator|denominator|strike|enclose|bracket|parenthesis|table|row|cell|root|of|the)\s*[.,]?\s*$/i;

const counts = { span: 0, dollar: 0, textwrap: 0, multiline: 0, baretext: 0 };
const offenders: { kind: string; snippet: string }[] = [];
const rec = (kind: string, snippet: string) => {
  if (offenders.length < 24) offenders.push({ kind, snippet: snippet.slice(0, 90) });
};

// structural markers only — prose lines ("take the square root of both sides")
// never contain these, so bare-text scanning is false-positive-safe
const MARK_STRONG =
  /\b(end enclose|end table|end cell|end row|end stack|end attributes|end style|begin mathsize|presubscript|presuperscript|end strike|fraction numerator|over denominator|end fraction|end exponent|stack sum)\b/i;

function scanString(s: string) {
  for (const m of s.matchAll(CODE1)) {
    if (MARK.test(m[1])) {
      counts.span++;
      rec("span", m[1]);
    }
  }
  for (const m of s.matchAll(DOLLAR)) {
    if (MARK.test(m[1])) {
      counts.dollar++;
      rec("dollar", m[1]);
    }
  }
  for (const m of s.matchAll(/\\text\s*\{([^{}]*)\}/g)) {
    if (BAD_TEXT_CONTENT.test(m[1])) {
      counts.textwrap++;
      rec("textwrap", m[0]);
    }
  }
  // multi-line broken spans (real newlines inside a backtick pair)
  if (s.includes("`") && s.includes("\n")) {
    for (const m of s.matchAll(CODE_ML)) {
      const inner = m[1];
      if (inner.includes("\n")) {
        const speechLines = inner.split("\n").filter((l) => MARK.test(l)).length;
        if (speechLines > 0) {
          counts.multiline++;
          rec("multiline", inner.slice(0, 80));
        }
      }
    }
  }
  // bare speech text outside any math delimiters (scrape lost formatting)
  if (MARK_STRONG.test(s)) {
    const stripped = s
      .replace(/```[\s\S]*?(?:```|$)/g, "")
      .replace(/`[^`\n]*`/g, "")
      .replace(/(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g, "");
    if (MARK_STRONG.test(stripped)) {
      counts.baretext++;
      rec("baretext", stripped.trim().slice(0, 80));
    }
  }
}

function walk(o: any, file: string) {
  if (typeof o === "string") scanString(o);
  else if (Array.isArray(o)) for (const v of o) walk(v, file);
  else if (o && typeof o === "object") for (const v of Object.values(o)) walk(v, file);
}

const files: string[] = [];
for (const pkg of readdirSync(CONTENT)) {
  for (const f of ["notes.json", "questions.json", "flashcards.json"]) {
    const p = `${CONTENT}/${pkg}/${f}`;
    if (existsSync(p)) files.push(p);
  }
}
for (const f of files) walk(JSON.parse(readFileSync(f, "utf-8")), f);

const baseline = existsSync(BASELINE_FILE)
  ? JSON.parse(readFileSync(BASELINE_FILE, "utf-8"))
  : null;

console.log(`corpus gate: files=${files.length}`);
console.log(`  code spans polluted    : ${counts.span}`);
console.log(`  $…$ polluted segments  : ${counts.dollar}`);
console.log(`  \\text{} garbage        : ${counts.textwrap}`);
console.log(`  multi-line broken spans: ${counts.multiline}`);
console.log(`  bare speech text       : ${counts.baretext}`);

let fail = false;
if (!baseline) {
  writeFileSync(
    BASELINE_FILE,
    JSON.stringify({ ...counts, frozenAt: new Date().toISOString() }, null, 2),
  );
  console.log(`baseline frozen -> ${BASELINE_FILE}`);
} else {
  for (const k of ["span", "dollar", "textwrap", "multiline", "baretext"] as const) {
    if (counts[k] > (baseline[k] ?? 0)) {
      fail = true;
      console.error(`  REGRESSION: ${k} ${counts[k]} > baseline ${baseline[k]}`);
    }
  }
}

if (fail) {
  console.error("\nGATE FAILED — pollution above baseline:");
  for (const o of offenders) console.error(`  [${o.kind}] ${o.snippet}`);
  process.exit(1);
}
console.log("\nCORPUS GATE PASSED");
