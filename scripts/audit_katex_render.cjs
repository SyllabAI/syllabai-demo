#!/usr/bin/env node
/** Corpus-wide KaTeX render audit.
 * Walks content/<course>/{questions,notes,flashcards}.json for all 39 courses,
 * extracts math segments with the SAME delimiters the app accepts
 * ($$…$$ display, $…$ inline, \(…\) inline), renders each with katex,
 * and reports: parse errors grouped by message, top offending macros,
 * unbalanced-$ leaks, and per-course error counts.
 */
const fs = require("fs");
const path = require("path");
const katex = require("katex");

const ROOT = path.join(__dirname, "..", "content");
const courses = fs.readdirSync(ROOT).filter((d) =>
  fs.statSync(path.join(ROOT, d)).isDirectory(),
);

const DISPLAY_RE = /\$\$([\s\S]+?)\$\$/g;
// inline $…$ : not preceded/followed by $, no newlines inside, non-empty
const INLINE_RE = /(?<!\$)\$(?!\$)((?:[^$\n\\]|\\.)+?)\$(?!\$)/g;
const PAREN_RE = /\\\(([\s\S]+?)\\\)/g;

const stats = {
  files: 0, strings: 0, display: 0, inline: 0, paren: 0,
  ok: 0, err: 0, unbalancedDollar: 0,
};
const errors = new Map(); // message -> {count, samples:[]}
const perCourse = new Map();

function record(msg, sample) {
  stats.err += 1;
  if (!errors.has(msg)) errors.set(msg, { count: 0, samples: [] });
  const e = errors.get(msg);
  e.count += 1;
  if (e.samples.length < 3) e.samples.push(sample);
}

function check(tex, display, ctx) {
  try {
    katex.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      strict: "ignore",
      trust: false,
      macros: { "\\degree": "^\\circ", "\\degreeCelsius": "^\\circ\\mathrm{C}" },
    });
    stats.ok += 1;
  } catch (ex) {
    const msg = String(ex.message).split("\n")[0];
    record(msg, { tex: tex.slice(0, 160), ctx });
  }
}

function walk(v, ctx) {
  if (typeof v === "string") {
    stats.strings += 1;
    const has = /\$|\\\(/.test(v);
    if (!has) return;
    // detect unbalanced single $ (odd count, ignoring $$ and escaped \$)
    const unescaped = v.replace(/\\\$/g, "");
    const dollars = (unescaped.match(/\$/g) || []).length;
    const doubled = (unescaped.match(/\$\$/g) || []).length * 2;
    if ((dollars - doubled) % 2 === 1) {
      stats.unbalancedDollar += 1;
      record("unbalanced $ (odd count after $$ pairs)", {
        tex: v.slice(0, 160), ctx,
      });
    }
    for (const m of v.matchAll(DISPLAY_RE)) {
      stats.display += 1;
      check(m[1], true, ctx);
    }
    for (const m of v.matchAll(INLINE_RE)) {
      stats.inline += 1;
      check(m[1], false, ctx);
    }
    for (const m of v.matchAll(PAREN_RE)) {
      stats.paren += 1;
      check(m[1], false, ctx);
    }
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, ctx));
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) walk(x, ctx);
  }
}

for (const course of courses) {
  for (const f of ["questions.json", "notes.json", "flashcards.json"]) {
    const p = path.join(ROOT, course, f);
    if (!fs.existsSync(p)) continue;
    stats.files += 1;
    const before = stats.err;
    let data;
    try { data = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
    walk(data, `${course}/${f}`);
    const delta = stats.err - before;
    if (delta > 0) perCourse.set(course + "/" + f, delta);
  }
}

console.log("=== CORPUS KATEX AUDIT ===");
console.log(`files=${stats.files} strings=${stats.strings}`);
console.log(`segments: display=${stats.display} inline=${stats.inline} paren=${stats.paren}`);
console.log(`render OK=${stats.ok} ERR=${stats.err} unbalanced$=${stats.unbalancedDollar}`);
console.log("\n=== ERRORS BY MESSAGE (top 15) ===");
[...errors.entries()]
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 15)
  .forEach(([msg, e], i) => {
    console.log(`\n#${i + 1} x${e.count}  ${msg}`);
    for (const s of e.samples.slice(0, 2))
      console.log(`   tex: ${JSON.stringify(s.tex).slice(0, 170)}`);
  });
console.log("\n=== PER-FILE ERR COUNTS ===");
[...perCourse.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`${String(v).padStart(5)}  ${k}`));

// full machine-readable report for downstream categorization
const report = {
  stats,
  errors: [...errors.entries()].map(([msg, e]) => ({ msg, count: e.count, samples: e.samples })),
};
const out = path.join(__dirname, "..", "work", "katex_audit.json");
fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`\nfull report -> ${out} (${errors.size} unique messages)`);
