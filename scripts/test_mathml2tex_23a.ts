/**
 * Test MathML→LaTeX conversion quality against the real SME page HTML
 * (the exact note the user reported). Run: bun scripts/test_mathml2tex_23a.ts
 */
import { readFileSync } from "fs";
// mathml-to-latex ships named exports only (no default) in its ESM build
import { MathMLToLaTeX } from "mathml-to-latex";
import katex from "katex";

const html = readFileSync("/tmp/sme_page.html", "utf-8");
const maths = html.match(/<math[^>]*>[\s\S]*?<\/math>/g) ?? [];
console.log("math elements on page:", maths.length);

let ok = 0, fail = 0, katexFail = 0;
const failures: string[] = [];
maths.forEach((m, i) => {
  let tex: string;
  try {
    tex = MathMLToLaTeX.convert(m);
  } catch (e: any) {
    fail++;
    failures.push(`[${i}] CONVERT-ERR: ${m.slice(0, 120)}`);
    return;
  }
  if (!tex.trim()) {
    fail++;
    failures.push(`[${i}] EMPTY: ${m.slice(0, 120)}`);
    return;
  }
  try {
    katex.renderToString(tex, { throwOnError: true, strict: "ignore" });
    ok++;
  } catch {
    katexFail++;
    failures.push(`[${i}] KATEX-FAIL tex=${tex.slice(0, 120)}`);
  }
});

console.log(`convert+katex ok: ${ok}/${maths.length}, convert-fail: ${fail}, katex-fail: ${katexFail}`);
console.log("\nsample conversions:");
maths.slice(0, 8).forEach((m, i) => {
  try {
    const tex = MathMLToLaTeX.convert(m);
    console.log(`  [${i}] ${tex.slice(0, 110)}`);
  } catch { /* ignore */ }
});
if (failures.length) {
  console.log("\nfailures:");
  failures.slice(0, 10).forEach(f => console.log("  " + f));
}
