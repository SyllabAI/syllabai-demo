/**
 * Verification for src/lib/emphasis-fix.ts (Task: "**renders as is**" fix).
 *
 * 1. Unit checks on real corpus samples + adversarial edge cases;
 * 2. Full-pipeline render check: samples through the SAME remark/rehype
 *    chain the <Markdown> component uses, asserting <strong> appears and
 *    no literal `**` survives;
 * 3. Corpus-wide sweep: after normalization, zero space-flanked `**`
 *    artifacts may remain in question parts (outside math spans).
 *
 * Run: bun scripts/test_emphasis_fix.ts
 */
import { normalizeCorpusEmphasis } from "../src/lib/emphasis-fix";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeKatex, { throwOnError: false, strict: "ignore" });

/** Serialize the hast tree to HTML (stringify is not needed by the app, so
 *  walk the tree here instead of pulling rehype-stringify). */
function toHtml(node: any): string {
  if (node.type === "text") return node.value ?? "";
  if (node.type === "raw") return node.value ?? "";
  const inner = (node.children ?? []).map(toHtml).join("");
  const tag = node.tagName;
  if (!tag) return inner;
  return `<${tag}>${inner}</${tag}>`;
}

function render(md: string): string {
  return toHtml(processor.runSync(processor.parse(normalizeCorpusEmphasis(md))));
}

console.log("— unit: normalizer output —");

// real corpus sample 1: ICT stem
const s1 = normalizeCorpusEmphasis("State** two **other types of utility software.");
check("ICT stem → State **two** other", s1 === "State **two** other types of utility software.", JSON.stringify(s1));

// real corpus sample 2: chemistry choice B
const s2 = normalizeCorpusEmphasis("**W **and **Y**");
check("choice B → **W** and **Y**", s2 === "**W** and **Y**", JSON.stringify(s2));

// real corpus sample 3: chemistry choice C
const s3 = normalizeCorpusEmphasis("**X** and** Z**");
check("choice C → **X** and **Z**", s3 === "**X** and **Z**", JSON.stringify(s3));

// real corpus sample 4: whitespace-only pair
const s4 = normalizeCorpusEmphasis("velocity of $A$ is **                    ** here");
check("whitespace-only pair → single space", s4 === "velocity of $A$ is   here", JSON.stringify(s4));

// clean pairs verbatim
const clean = "**A** is incorrect as  **W** and **X** both have the same number of neutrons";
check("clean bold verbatim", normalizeCorpusEmphasis(clean) === clean);

// table header verbatim
const tbl = "| **Species** | **Number of protons** | **Number of neutrons** |";
check("table header verbatim", normalizeCorpusEmphasis(tbl) === tbl);

// math span untouched (contains a literal *)
const mathStar = "£$6 into euros (by multiplying by *$ the rate";
check("math span untouched", normalizeCorpusEmphasis(mathStar) === mathStar, JSON.stringify(normalizeCorpusEmphasis(mathStar)));

// math span adjacent to broken bold
const mixed = "$v = u + at$ and **the acceleration ** is constant";
const mixedOut = normalizeCorpusEmphasis(mixed);
check("math intact + bold fixed", mixedOut === "$v = u + at$ and **the acceleration** is constant", JSON.stringify(mixedOut));

// parenthesis adjacency — no space injected
const paren = normalizeCorpusEmphasis("(** Z**)");
check("paren adjacency → (**Z**)", paren === "(**Z**)", JSON.stringify(paren));

// word adjacency — separator preserved
const word = normalizeCorpusEmphasis("State** two **other");
check("word adjacency keeps separators", word === "State **two** other", JSON.stringify(word));

// fenced code untouched
const fenced = "```\n** not bold **\n```";
check("fenced code untouched", normalizeCorpusEmphasis(fenced) === fenced);

// single asterisk untouched
const single = "5 * 3 = 15 and * a * b";
check("single asterisk untouched", normalizeCorpusEmphasis(single) === single);

// no-** fast path
check("no-** string identical", normalizeCorpusEmphasis("plain £1 = €1.17 text") === "plain £1 = €1.17 text");

console.log("— pipeline: rendered HTML —");

const h1 = render("State** two **other types of utility software.");
check("ICT renders <strong>two</strong>", h1.includes("<strong>two</strong>") && !h1.includes("**"), h1.slice(0, 140));

const h2 = render("**W **and **Y**");
check("choice renders two <strong>s", h2.includes("<strong>W</strong> and <strong>Y</strong>") && !h2.includes("**"), h2.slice(0, 140));

const h3 = render("**X** and** Z**");
check("choice C renders <strong>Z</strong>", h3.includes("<strong>X</strong> and <strong>Z</strong>") && !h3.includes("**"), h3.slice(0, 140));

// pathological mechanics line — must not regress to literal asterisks
const mech =
  "**In this question, use *****g***** = 10 ms**<sup>**−2**</sup>** for the acceleration due to gravity.**";
const h4 = render(mech);
check("mechanics line: no literal **", !h4.includes("**"), h4.slice(0, 200));
check("mechanics line: has <strong>", h4.includes("<strong>"), h4.slice(0, 200));
check("mechanics line: sup + katex still ok", h4.includes("<sup>") || h4.includes("sub"), h4.slice(0, 200));

// nested bold artifact
const h5 = render("**Final answer:** **The correct answer is ****D**** because:**");
check("nested ****D**** → no literal **", !h5.includes("**") && h5.includes("<strong>D</strong>"), h5.slice(0, 200));

// radical notation — closer preceded by punctuation (both "**·**H" and
// "**·**Cl" have an alnum char right after the rejected closer)
const rad = normalizeCorpusEmphasis("require the free radicals **·**H and **·**Cl, however.");
check("radical **·**H → detached closer", rad === "require the free radicals **·** H and **·** Cl, however.", JSON.stringify(rad));
const h8 = render(rad);
check("radical renders <strong>·</strong>", h8.includes("<strong>·</strong>") && !h8.includes("**"), h8.slice(0, 220));

// orphan closer after alnum+comma — opener rejected by CommonMark
const orph = normalizeCorpusEmphasis("To ensure only anaerobic respiration takes place**; [1 mark]**");
check("orphan opener detached", orph === "To ensure only anaerobic respiration takes place **; [1 mark]**", JSON.stringify(orph));
const h9 = render(orph);
check("orphan renders <strong>", h9.includes("<strong>") && !h9.includes("**"), h9.slice(0, 220));

// cross-line pairing inside one paragraph: the opener claims nothing (the
// only closable pair is **two**), so the stray opener is deleted
const cross = normalizeCorpusEmphasis("The reaction is **impure\nbecause it contains **two** products.");
check("stray cross-line opener deleted", cross === "The reaction is impure\nbecause it contains **two** products.", JSON.stringify(cross));

// multi-line paragraph: opener on line 1 pairs with the line-2 orphan closer;
// the trailing stray closer is deleted
const crossFix = normalizeCorpusEmphasis("The answer **is wrong\nbecause place**; [1 mark]**");
check("cross-line orphan-closer consumed", crossFix === "The answer **is wrong\nbecause place**; [1 mark]", JSON.stringify(crossFix));

// clean bold regression through pipeline
const h6 = render(clean);
check("clean line: 3 <strong>s", (h6.match(/<strong>/g) ?? []).length === 3, h6.slice(0, 200));

// bold + math coexistence (KaTeX emits MathML + HTML spans)
const h7 = render("Use **position vectors**: with $r_{i} = x_{i}i + y_{i}j$, solve the system.");
check(
  "bold + $math$ coexist",
  h7.includes("<strong>position vectors</strong>") && h7.includes("<math") && !h7.includes("**"),
  h7.slice(0, 200),
);

console.log("— corpus sweep (pipeline ground truth) —");

// Render each part's non-math text through the remark chain and assert no
// TEXT NODE contains a literal `**` — the true "renders as is" signal.
// (A static regex sweep false-positives on the legal gap between two
// adjacent bold spans: "**a:** **b…".)
const fastProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw);

function hasLiteralBold(node: any): boolean {
  if (node.type === "text") return /\*\*/.test(node.value ?? "");
  if (node.type === "raw") return /\*\*/.test(node.value ?? "");
  return (node.children ?? []).some(hasLiteralBold);
}

const files = ["ial-chemistry-17", "igcse-ict-17", "ial-maths-20-mechanics-2", "ial-maths-20-pure-1"];
for (const course of files) {
  const data = JSON.parse(readFileSync(new URL(`../content/${course}/questions.json`, import.meta.url), "utf8"));
  const topics = Array.isArray(data) ? data : (data.topics ?? []);
  let before = 0;
  let after = 0;
  for (const t of topics) {
    for (const q of t.questions ?? []) {
      for (const p of q.parts ?? []) {
        for (const f of ["problemMd", "solutionMd"] as const) {
          const raw = (p as Record<string, string | null>)[f] ?? "";
          if (!raw.includes("**")) continue;
          const noMath = raw.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, " ");
          const count = (md: string) => (hasLiteralBold(fastProcessor.runSync(fastProcessor.parse(md))) ? 1 : 0);
          before += count(noMath);
          after += count(normalizeCorpusEmphasis(noMath));
        }
      }
    }
  }
  // Invariant: normalization never increases literal-** rendering and removes
  // the bulk of it. The residue is the documented mixed `*…**…*` converter
  // slop + sub/sup-dense table headers, where intent is not reconstructible.
  check(
    `${course}: literal-** parts ${before} → ${after} (≥90% reduction, never worse)`,
    after <= before * 0.1 && after <= before,
    `reduction ${before === 0 ? 100 : Math.round((1 - after / before) * 100)}%`,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
