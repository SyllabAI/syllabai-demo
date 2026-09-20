/**
 * Test for src/lib/speech-math.ts (run: bun scripts/test_speech_math_22a.ts)
 *  1. unit samples collected from the real corpus
 *  2. corpus-wide conversion/fallback stats over all notes/questions/flashcards
 *  3. residual-word frequency over failed conversions (grammar gaps)
 */
import katex from "katex";
import * as fs from "fs";
import * as path from "path";
import { looksLikeSpeechText, speechToTex } from "../src/lib/speech-math";

const SAMPLES: string[] = [
  // basic arithmetic
  "x squared plus 8 x plus 16 equals open parentheses x plus 4 close parentheses open parentheses x plus 4 close parentheses equals open parentheses x plus 4 close parentheses squared",
  "6 x cubed plus 3 x squared minus 9 x equals 3 x open parentheses 2 x squared plus x minus 3 close parentheses equals 3 x open parentheses 2 x plus 3 close parentheses open parentheses x minus 1 close parentheses",
  "2 x open parentheses 3 x minus 1 close parentheses plus 3 open parentheses 3 x minus 1 close parentheses",
  "a x squared plus b x plus c identical to open parentheses p x plus r close parentheses open parentheses q x plus s close parentheses",
  "a x squared plus b x plus c identical to blank p q x squared plus p s x plus q r x plus r s identical to p q x squared plus open parentheses p s plus q r close parentheses x plus r s",
  // calculus
  "fraction numerator straight d over denominator straight d x end fraction open parentheses straight f open parentheses x close parentheses close parentheses",
  "fraction numerator d over denominator d x end fraction open parentheses x to the power of n close parentheses equals n x to the power of n minus 1 end exponent",
  "straight f open parentheses x close parentheses equals x to the power of n",
  "straight f apostrophe open parentheses x close parentheses equals n x to the power of n minus 1 end exponent",
  "fraction numerator d over denominator d x end fraction open parentheses a x close parentheses equals a",
  "fraction numerator d over denominator d x end fraction open parentheses a close parentheses equals 0",
  "equals fraction numerator space £ 328 straight m over denominator £ 4.6 bn end fraction space equals space 0.0713",
  "straight f open parentheses x close parentheses equals x squared plus 3 x minus 4",
  "straight f to the power of apostrophe open parentheses 1 close parentheses equals 2 open parentheses 1 close parentheses plus 3 equals 5",
  "straight f to the power of apostrophe apostrophe end exponent open parentheses x close parentheses",
  "straight f to the power of apostrophe open parentheses x close parentheses equals 3 x to the power of 3 minus 1 end exponent minus 6 open parentheses 2 x to the power of 2 minus 1 end exponent close parentheses plus 5",
  "open parentheses 2 comma space minus 18 close parentheses",
  "fraction numerator straight d y over denominator straight d x end fraction equals 3 open parentheses 2 close parentheses squared equals 12",
  "fraction numerator d squared y over denominator straight d x squared end fraction equals straight f to the power of apostrophe apostrophe end exponent open parentheses x close parentheses",
  // vectors
  "top enclose straight r space equals open parentheses top enclose x bold i plus top enclose y bold j close parentheses space equals 4 bold i plus 7 bold j",
  "left parenthesis top enclose x bold i plus top enclose y bold j right parenthesis equals 3.5 bold i plus 5.5 bold j",
  "24 left parenthesis top enclose x bold i plus top enclose y bold j right parenthesis equals 96 bold i bold space plus 168 bold j",
  // sums & subscripts
  "sum for blank of m subscript i r subscript i space equals top enclose r space stack sum m subscript i with blank below",
  "sum from i space equals 1 to n of m subscript i x subscript i space equals x with bar on top space sum from i space equals 1 to n of m subscript i",
  "begin mathsize 16px style sum for blank of m subscript i r subscript i space equals top enclose r sum for blank of m subscript i end style",
  // roots
  "cube root of x",
  "y squared equals open parentheses square root of 3 x squared plus 2 end root close parentheses squared equals 3 x squared plus 2",
  "y equals square root of 4 minus x end root space space rightwards double arrow space space y squared equals open parentheses square root of 4 minus x end root close parentheses squared equals 4 minus x",
  "integral cube root of x space straight d x",
  // brackets
  "y equals open square brackets straight f open parentheses x close parentheses close square brackets to the power of n",
  "open curly brackets x colon space... close curly brackets",
  "a open square brackets f left parenthesis x right parenthesis close square brackets squared plus b open square brackets f left parenthesis x right parenthesis close square brackets plus c equals 0",
  // fractions & cancel
  "13 over 4 cross times 8 over 3 equals fraction numerator 13 over denominator up diagonal strike 4 end fraction cross times fraction numerator up diagonal strike 4 cross times 2 over denominator 3 end fraction equals 13 over 1 cross times 2 over 3",
  "up diagonal strike x open parentheses x squared minus 6 x minus 112 close parentheses equals 0",
  "3 over 25 cross times 10 over 11 equals 3 over up diagonal strike 25 to the power of 5 cross times up diagonal strike 10 squared over 11 equals 3 over 5 cross times 2 over 11",
  // percent, comparisons
  "equals space 0.5284 space cross times space 100 equals space 52.84 percent sign",
  "straight f to the power of apostrophe apostrophe end exponent open parentheses 3 close parentheses equals 12 open parentheses 3 close parentheses minus 6 equals 30 greater than 0",
  "0 less than 2 open parentheses 1 close parentheses",
  // tables (the actual reported note)
  "table row cell fraction numerator x over denominator x minus 4 end fraction plus fraction numerator 1 over denominator x plus 2 end fraction end cell equals cell fraction numerator x open parentheses x plus 2 close parentheses over denominator open parentheses x minus 4 close parentheses open parentheses x plus 2 close parentheses end fraction plus fraction numerator open parentheses x minus 4 close parentheses over denominator open parentheses x minus 4 close parentheses open parentheses x plus 2 close parentheses end fraction end cell end table",
  "table row blank blank cell fraction numerator x open parentheses x plus 2 close parentheses plus open parentheses x minus 4 close parentheses over denominator open parentheses x minus 4 close parentheses open parentheses x plus 2 close parentheses end fraction end cell end table equals fraction numerator x squared plus 2 x plus x minus 4 over denominator open parentheses x minus 4 close parentheses open parentheses x plus 2 close parentheses end fraction equals fraction numerator x squared plus 3 x minus 4 over denominator open parentheses x minus 4 close parentheses open parentheses x plus 2 close parentheses end fraction",
  "table row y less than cell 2 x end cell end table",
  // physics energy
  "1 half m v subscript f to the power of 2 space end exponent minus 1 half m v subscript i to the power of 2 space end exponent equals negative open parentheses m g h subscript f space end subscript minus m g h subscript i close parentheses plus-or-minus W D",
  // negatives / ordinals
  "y minus 5 equals negative 1 half open parentheses x minus 1 close parentheses",
  "s open parentheses t close parentheses equals 2 t cubed minus 1 half t squared plus 3 t minus 5",
  "negative fraction numerator 1 over denominator straight f to the power of apostrophe open parentheses 1 close parentheses end fraction equals negative 1 half",
];

function katexOk(tex: string): boolean {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

console.log("== 1. unit samples ==");
let pass = 0, fail = 0;
for (const s of SAMPLES) {
  if (!looksLikeSpeechText(s)) { console.log("DETECT-FAIL:", s.slice(0, 80)); fail++; continue; }
  const tex = speechToTex(s);
  if (tex === null) { console.log("CONVERT-NULL:", s.slice(0, 100)); fail++; continue; }
  if (!katexOk(tex)) { console.log("KATEX-FAIL:", tex.slice(0, 120), "\n  from:", s.slice(0, 80)); fail++; continue; }
  pass++;
}
console.log(`unit: ${pass} pass, ${fail} fail of ${SAMPLES.length}`);

console.log("\n== 2. corpus-wide stats ==");
// silence KaTeX "No character metrics for '€'" render warnings (non-fatal)
const origWarn = console.warn;
console.warn = () => {};
const codeSpan = /`([^`\n]+)`/g;
const dollar = /(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g;
let total = 0, ok = 0, nullRes = 0, katexFail = 0, undetected = 0;
let nullPolluted = 0, nullClean = 0;
const perPkg = new Map<string, { total: number; ok: number }>();
const residualWords = new Map<string, number>();
let sampleFailures: string[] = [];

const isPolluted = (s: string) => s.includes("**") || s.includes("](http") || s.includes("\\n>");

const contentDir = path.join(import.meta.dir, "..", "content");
for (const pkg of fs.readdirSync(contentDir)) {
  const pkgDir = path.join(contentDir, pkg);
  if (!fs.statSync(pkgDir).isDirectory()) continue;
  for (const file of ["notes.json", "questions.json", "flashcards.json"]) {
    const fp = path.join(pkgDir, file);
    if (!fs.existsSync(fp)) continue;
    const raw = fs.readFileSync(fp, "utf8");
    for (const re of [codeSpan, dollar]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw)) !== null) {
        const seg = m[1];
        if (!seg.includes(" ") || seg.length < 12) continue;
        const isSpeech = looksLikeSpeechText(seg);
        if (!isSpeech) {
          // would the OLD pipeline have rendered speech here? count speech-looking but undetected
          if (/open parentheses|fraction numerator|end table|with subscript/.test(seg)) undetected++;
          continue;
        }
        total++;
        const stat = perPkg.get(pkg) ?? { total: 0, ok: 0 };
        stat.total++;
        perPkg.set(pkg, stat);
        const tex = speechToTex(seg);
        if (tex === null) {
          nullRes++;
          if (isPolluted(seg)) nullPolluted++; else nullClean++;
          if (sampleFailures.length < 12 && !isPolluted(seg)) sampleFailures.push(seg);
          const stripped = tex ?? seg;
          for (const w of stripped.replace(/[^a-zA-Z ]/g, " ").split(/\s+/)) {
            if (w.length > 2) residualWords.set(w, (residualWords.get(w) ?? 0) + 1);
          }
          continue;
        }
        if (!katexOk(tex)) {
          katexFail++;
          if (isPolluted(seg)) nullPolluted++; else nullClean++;
          continue;
        }
        ok++;
        stat.ok++;
      }
    }
  }
}
console.warn = origWarn;
console.log(`speech segments detected: ${total}`);
console.log(`  converted+parse OK: ${ok} (${total ? ((ok / total) * 100).toFixed(1) : 0}%)`);
console.log(`  conversion null (residual): ${nullRes} [polluted mega-spans: ${nullPolluted}, clean: ${nullClean}]`);
console.log(`  katex parse fail: ${katexFail} [polluted: included above]`);
console.log(`  strong-speech but undetected by marker: ${undetected}`);
console.log("\n== per-package coverage (worst 12) ==");
for (const [pkg, st] of [...perPkg.entries()].sort((a, b) => a[1].ok / a[1].total - b[1].ok / b[1].total).slice(0, 12)) {
  console.log(`  ${(st.ok / st.total * 100).toFixed(1)}%  ${st.ok}/${st.total}  ${pkg}`);
}

console.log("\n== 3. top residual words in failed conversions ==");
console.log([...residualWords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25));
console.log("\n== sample failures ==");
for (const s of sampleFailures.slice(0, 12)) console.log(" -", s.slice(0, 160));
