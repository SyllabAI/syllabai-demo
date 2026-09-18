// Debug: LDL table string raw vs normalized; collector sanity check
const req2 = (id) => {
  const m = require(id);
  return m.default ?? m;
};
const { unified } = require("unified");
const remarkParse = req2("remark-parse");
const remarkGfm = req2("remark-gfm");
const remarkMath = req2("remark-math");
const { normalizeCorpusMath } = require("/home/z/my-project/work/tsbuild/math-fix.js");

const collected = [];
function collect() {
  const w = (n) => {
    if (n.type === "inlineMath" || n.type === "math") collected.push(n.value);
    (n.children ?? []).forEach(w);
  };
  return (t) => w(t);
}
const proc = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(collect);

// 1) collector sanity
collected.length = 0;
const t1 = proc.parse("Revenue is $5x + 3y$ where $x=2$ and \\(y^2\\)");
proc.runSync(t1);
console.log("sanity collected:", collected);

// 2) raw LDL string
const fs = require("fs");
const data = JSON.parse(fs.readFileSync("/home/z/my-project/content/ial-biology-18/questions.json", "utf8"));
let found = null;
const walk = (v) => {
  if (found) return;
  if (typeof v === "string") {
    if (v.includes("Diameter of LDL")) found = v;
  } else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === "object") Object.values(v).forEach(walk);
};
walk(data);
console.log("\nRAW string (first 200):", JSON.stringify(found?.slice(0, 200)));
try {
  const t = proc.parse(found);
  proc.runSync(t);
  console.log("RAW parses: OK");
} catch (e) {
  console.log("RAW parse FAILS:", e.message.slice(0, 120));
}
try {
  const t = proc.parse(normalizeCorpusMath(found));
  proc.runSync(t);
  console.log("NORMALIZED parses: OK");
} catch (e) {
  console.log("NORMALIZED parse FAILS:", e.message.slice(0, 120));
}
