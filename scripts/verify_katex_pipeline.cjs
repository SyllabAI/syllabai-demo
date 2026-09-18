#!/usr/bin/env node
/** End-to-end KaTeX verification: runs the REAL remark pipeline the app uses
 * (remark-gfm → remark-math → glue-fix plugin) over every math-bearing string
 * in content/, then renders every extracted math node with KaTeX.
 * This is exactly what <Markdown> will do in the browser.
 */
const fs = require("fs");
const path = require("path");
/** require(esm) interop: return the default export when wrapped in a namespace. */
function req(id) {
  const mod = require(id);
  return mod.default ?? mod;
}
const { unified } = require("unified");
const remarkParse = req("remark-parse");
const remarkGfm = req("remark-gfm");
const remarkMath = req("remark-math");
const katex = require("katex");
const { sanitizeMathTex, normalizeCorpusMath } = require(path.join(__dirname, "..", "work", "tsbuild", "math-fix.js"));

const ROOT = path.join(__dirname, "..", "content");

// mirrors remarkFixGluedMacros in markdown.tsx
function remarkSanitize() {
  const walk = (node) => {
    if ((node.type === "math" || node.type === "inlineMath") && typeof node.value === "string") {
      node.value = sanitizeMathTex(node.value).replace(/\$\$/g, "\\quad ");
    }
    (node.children ?? []).forEach(walk);
  };
  return (tree) => walk(tree);
}

const collected = [];
function remarkCollect() {
  const walk = (node) => {
    if ((node.type === "math" || node.type === "inlineMath") && typeof node.value === "string") {
      collected.push({ value: node.value, display: node.type === "math" });
    }
    (node.children ?? []).forEach(walk);
  };
  return (tree) => walk(tree);
}

const proc = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkSanitize)
  .use(remarkCollect);

const stats = { files: 0, stringsParsed: 0, nodes: 0, ok: 0, err: 0, parenConverted: 0, parenKept: 0 };
const errors = new Map();
const perFile = new Map();

function record(msg, sample) {
  stats.err += 1;
  if (!errors.has(msg)) errors.set(msg, { count: 0, samples: [] });
  const e = errors.get(msg);
  e.count += 1;
  if (e.samples.length < 3) e.samples.push(sample);
}

function renderNode(node, ctx) {
  stats.nodes += 1;
  try {
    katex.renderToString(node.value, {
      displayMode: node.display,
      throwOnError: true,
      strict: "ignore",
    });
    stats.ok += 1;
  } catch (ex) {
    record(String(ex.message).split("\n")[0], { tex: node.value.slice(0, 150), ctx });
  }
}

function walkStrings(v, ctx, visit) {
  if (typeof v === "string") visit(v, ctx);
  else if (Array.isArray(v)) v.forEach((x) => walkStrings(x, ctx, visit));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => walkStrings(x, ctx, visit));
}

const courses = fs.readdirSync(ROOT).filter((d) => fs.statSync(path.join(ROOT, d)).isDirectory());

for (const course of courses) {
  for (const f of ["questions.json", "notes.json", "flashcards.json"]) {
    const p = path.join(ROOT, course, f);
    if (!fs.existsSync(p)) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
    stats.files += 1;
    const before = stats.err;
    walkStrings(data, `${course}/${f}`, (s, ctx) => {
      if (!s.includes("$") && !s.includes("\\(")) return;
      const norm = normalizeCorpusMath(s);
      stats.parenKept += (norm.match(/\\\(/g) || []).length;
      collected.length = 0;
      let tree;
      try {
        tree = proc.parse(norm);
        proc.runSync(tree);
      } catch {
        record("remark parse failure (would crash app)", { tex: s.slice(0, 120), ctx });
        return;
      }
      stats.stringsParsed += 1;
      collected.forEach((n) => renderNode(n, ctx));
    });
    const delta = stats.err - before;
    if (delta > 0) perFile.set(`${course}/${f}`, delta);
  }
}

console.log("=== E2E PIPELINE VERIFICATION (app remark chain + KaTeX) ===");
console.log(`files=${stats.files} math-bearing strings parsed=${stats.stringsParsed}`);
console.log(`math nodes=${stats.nodes} OK=${stats.ok} ERR=${stats.err}`);
console.log(`prose \\( kept un-converted pairs=${stats.parenKept}`);
console.log("\n=== RESIDUAL ERRORS (top 12) ===");
[...errors.entries()]
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 12)
  .forEach(([msg, e], i) => {
    console.log(`#${i + 1} x${e.count}  ${msg.slice(0, 110)}`);
    for (const s of e.samples.slice(0, 1)) console.log(`   tex: ${JSON.stringify(s.tex).slice(0, 150)}`);
  });
console.log("\n=== PER-FILE RESIDUAL ===");
[...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  .forEach(([k, v]) => console.log(`${String(v).padStart(5)}  ${k}`));
