// Trace: exact failing string through the verify pipeline
const req2 = (id) => {
  const m = require(id);
  return m.default ?? m;
};
const { unified } = require("unified");
const remarkParse = req2("remark-parse");
const remarkGfm = req2("remark-gfm");
const remarkMath = req2("remark-math");
const katex = require("katex");
const { sanitizeMathTex, normalizeCorpusMath } = require("/home/z/my-project/work/tsbuild/math-fix.js");

const collected = [];
function remarkSanitize() {
  const walk = (node) => {
    if ((node.type === "math" || node.type === "inlineMath") && typeof node.value === "string") {
      console.log("BEFORE sanitize:", JSON.stringify(node.value));
      node.value = sanitizeMathTex(node.value).replace(/\$\$/g, "\\quad ");
      console.log("AFTER  sanitize:", JSON.stringify(node.value));
    }
    (node.children ?? []).forEach(walk);
  };
  return (tree) => walk(tree);
}
function remarkCollect() {
  const walk = (node) => {
    if ((node.type === "math" || node.type === "inlineMath")) collected.push(node.value);
    (node.children ?? []).forEach(walk);
  };
  return (tree) => walk(tree);
}

const proc = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkSanitize).use(remarkCollect);

const src = "Circle the value of $\\mathrm{cos}$$(360^{\\circ}+\\u03b1^{\\circ})$\\n\\n| $k--1$ | $k+1$ | $--k$ | $k$ |\\n|---|---|---|---|";
const norm = normalizeCorpusMath(src);
console.log("normalized src:", JSON.stringify(norm.slice(0, 90)));
const tree = proc.parse(norm);
proc.runSync(tree);
console.log("collected nodes:", collected.length);
for (const v of collected) {
  try {
    katex.renderToString(v, { throwOnError: true, strict: "ignore" });
    console.log("RENDER OK:", JSON.stringify(v));
  } catch (e) {
    console.log("RENDER ERR:", e.message.slice(0, 100));
  }
}
