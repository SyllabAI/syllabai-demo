/**
 * T-SME-23a + 23b: corpus-wide math repair from SME source MathML.
 *
 * 23b additions (residual 47 spans):
 *   - MARK extended to the verify-gate superset (menclose family, angle
 *     brackets, strikes, proportional/almost-equal, set ops)
 *   - dict tex repair chain: _{}^{} artifact, \hdots→\cdots, \hcancel→\sout,
 *     \left(\right. / \left.\right) pairing, unbalanced trailing \left|
 *   - EXACT_FORMULAS overrides (KaTeX-verified hand-authored LaTeX for the
 *     5 keys whose dict conversion is semantically broken)
 *   - strip-space dictionary level: arias whose literal " space " token runs
 *     differ between corpus and page (incl. newlines) still match
 *   - multiline spans whose whole content matches one aria → \begin{array}
 *   - \text{}…\textrm{ }…\text{} prose-run merging (kills lone \text{of})
 *
 * Root cause: SME wraps every <math> in <span data-mathml role="math"
 * aria-label="…speech text…">. The original scrape stored the aria-label
 * (Chrome MathML speech text) instead of parsing the MathML.
 * Repair: aria-label IS the join key — for each polluted span/segment in the
 * corpus, look up the page's (aria-label -> MathML -> LaTeX) dictionary.
 *
 * Lookup chain per polluted span (memoized):
 *   1. exact aria-label in the item's page dict
 *   2. greedy segmentation over the page dict (concatenated-math spans)
 *   3. exact over global merged dict (all pages)
 *   4. segmentation over global dict
 *   5. speech-math.ts reconstruction (existing runtime converter)
 *   6. leave untouched + record (renders as code, never garbage)
 * Every replacement must parse with KaTeX.
 *
 * Also normalizes scraped emphasis `**text **` / `*text *` (trailing-space
 * delimiters render literally) — letter-bounded, prose-only.
 * Run: bun scripts/patch_corpus_math_23a.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import katex from "katex";
import { looksLikeSpeechText, speechToTexSafe } from "../src/lib/speech-math";
import {
  speechExtras,
  symbolPreMap,
  stripSpaceTokens,
  hasResidualGrammar,
  genericChain,
} from "../src/lib/speech-extras";

const CONTENT = "/home/z/my-project/content";
const CACHE = "/home/z/my-project/work/mathml-cache";

const MARK = /\b(open parentheses|close parentheses|open bracket|close bracket|open curly|close curly|open angle brackets|close angle brackets|fraction numerator|over denominator|end fraction|end table|end cell|end row|end stack|end attributes|end style|end enclose|enclose|to the power|end exponent|square root|end root|cube root|with bar on top|open square brackets|close square brackets|plus-or-minus|direct double arrow|rightwards arrow|identical to|cross times|plus sign|minus sign|percent sign|presubscript|presuperscript|subscript|superscript|stack sum|sum from|sum for|begin mathsize|left parenthesis|right parenthesis|left bracket|right bracket|left square brackets|right square brackets|horizontal strike|vertical strike|vertical line|end strike|up diagonal strike|down diagonal strike|asterisk times|almost equal to|proportional to|less or equal than|greater or equal than|intersection|union|empty set|apostrophe)\b/i;
const CODE = /`([^`\n]+)`/g;
const DOLLAR = /(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g;
const FENCE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;

function katexOk(tex: string): boolean {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ---------- 23b: dict-tex repair chain ----------
function repairTex(tex: string): string {
  let t = tex;
  // scraped en/em dashes used as minus signs
  t = t.replace(/[\u2013\u2014]/g, "-");
  // mathml-to-latex mmultiscripts/stack artifact: empty sub+superscript pair
  t = t.replace(/_\{\}\^\{\}/g, "");
  // KaTeX has no \hdots (midline ellipsis → \cdots)
  t = t.replace(/\\hdots/g, "\\cdots");
  // menclose horizontalstrike → \hcancel is not KaTeX; \sout is
  t = t.replace(/\\hcancel/g, "\\sout");
  // lone right bar used as conditional separator (\left missing)
  t = t.replace(/\\right\|/g, "\\vert");
  // trailing unbalanced \left| (menclose "left" alone) → close with null
  const opens = (t.match(/\\left(?![a-zA-Z])/g) || []).length;
  const closes = (t.match(/\\right(?![a-zA-Z])/g) || []).length;
  if (opens > closes) t += " \\right.".repeat(opens - closes);
  else if (closes > opens) t = "\\left. ".repeat(closes - opens) + t;
  // menclose circle around a single digit = recurring-decimal marker → circle
  t = t.replace(/\\boxed\{(\d)\}/g, "\\textcircled{$1}");
  return t;
}

// ---------- 23b: repair recon-era $…$ segments that carry word artifacts ----------
function reconTexRepair(tex: string): string {
  let t = tex;
  // f "double-prime": ^{apostrophe} + \text{apostrophe} → ^{\prime\prime}
  t = t.replace(/\^\{apostrophe\}\s*\\text\s*\{apostrophe\}/g, "^{\\prime\\prime}");
  // remaining superscript word-primes
  t = t.replace(/\^\{apostrophe\}/g, "^{\\prime}");
  // bare word-primes attach to the previous atom
  t = t.replace(/\\text\s*\{apostrophe\}/g, "'");
  // apostrophe inside prose text runs: \text{don apostrophe t win} → don't
  t = t.replace(/\\text\s*\{([^{}]*)\}/g, (_w, c: string) =>
    c.includes("apostrophe") ? `\\text{${c.replace(/\s*apostrophe\s*/g, "'").trim()}}` : _w,
  );
  // nested recon forms first (flat rules below would destroy them):
  // \text{A \text{intersection} B [\text{intersection} C]}
  t = t.replace(
    /\\text\s*\{([^{}]*?)\\text\s*\{\s*intersection\s*\}([^{}]*?)\\text\s*\{\s*intersection\s*\}([^{}]*?)\}/g,
    (_w, a: string, b: string, c: string) => `\\text{${a.trim()}} \\cap \\text{${b.trim()}} \\cap \\text{${c.trim()}}`,
  );
  t = t.replace(
    /\\text\s*\{([^{}]*?)\\text\s*\{\s*intersection\s*\}([^{}]*?)\}/g,
    (_w, a: string, b: string) => `\\text{${a.trim()}} \\cap \\text{${b.trim()}}`,
  );
  t = t.replace(
    /\\text\s*\{([^{}]*?)\\text\s*\{\s*union\s*\}([^{}]*?)\}/g,
    (_w, a: string, b: string) => `\\text{${a.trim()}} \\cup \\text{${b.trim()}}`,
  );
  // set operators spoken as words
  t = t.replace(/\\text\s*\{intersection\}/g, "\\cap");
  t = t.replace(/\\text\s*\{union\}/g, "\\cup");
  // whole words inside one \text{}: "A intersection B" → A ∩ B
  t = t.replace(/(\\text\s*\{[^{}]*?)\s+intersection\s+([^{}]*?\})/g, "$1} \\cap \\text{$2");
  t = t.replace(/(\\text\s*\{[^{}]*?)\s+union\s+([^{}]*?\})/g, "$1} \\cup \\text{$2");
  // ordinal fraction words: 1 half → \frac{1}{2}
  const ord: Record<string, string> = { half: "2", third: "3", quarter: "4", fourth: "4", fifth: "5", sixth: "6" };
  t = t.replace(/(\d+)\s*\\text\s*\{(half|third|quarter|fourth|fifth|sixth)\}/g, (_w, n: string, w: string) => `\\frac{${n}}{${ord[w]}}`);
  return t;
}

// ---------- 23b: hand-authored overrides (KaTeX-verified) ----------
const EXACT_FORMULAS = new Map<string, string>([
  [
    "text P( end text right enclose 2 to the power of nd space is space white end enclose space 1 to the power of st space is space white right parenthesis equals 5 over 8",
    "\\text{P}\\left(2^{\\text{nd}}\\text{ is white} \\;\\middle|\\; 1^{\\text{st}}\\text{ is white}\\right) = \\frac{5}{8}",
  ],
  [
    "box enclose degree apostrophe double apostrophe end enclose",
    "\\boxed{{}^{\\circ}\\;{}^{\\prime}\\;{}^{\\prime\\prime}}",
  ],
  [
    "x to the power of 1 fifth end exponent equals fifth root of x",
    "x^{\\frac{1}{5}} = \\sqrt[5]{x}",
  ],
  [
    "y to the power of 3 over 5 end exponent equals fifth root of y cubed end root equals open parentheses fifth root of y close parentheses cubed",
    "y^{\\frac{3}{5}} = \\sqrt[5]{y^{3}} = \\left(\\sqrt[5]{y}\\right)^{3}",
  ],
  [
    "straight P open parentheses A space and space B close parentheses equals straight P open parentheses A close parentheses cross times straight P open parentheses B close parentheses",
    "\\mathrm{P}\\left(A \\text{ and } B\\right) = \\mathrm{P}\\left(A\\right) \\times \\mathrm{P}\\left(B\\right)",
  ],
]);

// ---------- 23b: strip-space dictionary (aria " space " token mismatch) ----------
const stripTokens = (s: string) =>
  s
    .replace(/\bthin space\b/g, " ")
    .replace(/\bspace\b/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();

let globalStrip: Map<string, string> | null = null;
function globalStripIndex(): Map<string, string> {
  if (!globalStrip) {
    globalStrip = new Map();
    for (const [k, v] of globalDict) {
      const nk = stripTokens(k);
      if (nk && !globalStrip.has(nk)) globalStrip.set(nk, v);
    }
  }
  return globalStrip;
}

// ---------- load dictionaries ----------
const pageDicts = new Map<string, Map<string, string>>(); // by url
const globalDict = new Map<string, string>();
for (const f of readdirSync(CACHE)) {
  if (!f.endsWith(".json")) continue;
  const p = JSON.parse(readFileSync(`${CACHE}/${f}`, "utf-8"));
  if (p.empty || !p.dict) continue;
  const m = new Map(Object.entries(p.dict));
  pageDicts.set(p.url, m);
  for (const [k, v] of m) if (!globalDict.has(k)) globalDict.set(k, v);
}
console.log(`page dicts: ${pageDicts.size}, global unique aria keys: ${globalDict.size}`);

// perf helpers: memoized sorted keys + first-word index; result memo per key
const sortedKeysCache = new WeakMap<Map<string, string>, string[]>();
const firstWordCache = new WeakMap<Map<string, string>, Map<string, string[]>>();
function sortedKeys(dict: Map<string, string>): string[] {
  let k = sortedKeysCache.get(dict);
  if (!k) {
    k = [...dict.keys()].sort((a, b) => b.length - a.length);
    sortedKeysCache.set(dict, k);
  }
  return k;
}
function byFirstWord(dict: Map<string, string>): Map<string, string[]> {
  let m = firstWordCache.get(dict);
  if (!m) {
    m = new Map();
    for (const key of sortedKeys(dict)) {
      const w = key.split(" ", 1)[0];
      const arr = m.get(w);
      if (arr) arr.push(key);
      else m.set(w, [key]);
    }
    firstWordCache.set(dict, m);
  }
  return m;
}

function segmentLookup(text: string, dict: Map<string, string>): string | null {
  const idx = byFirstWord(dict);
  let rest = text;
  let out = "";
  while (rest.length) {
    if (rest.startsWith(" ")) {
      rest = rest.slice(1);
      continue;
    }
    const w = rest.split(" ", 1)[0];
    const candidates = idx.get(w);
    if (!candidates) return null;
    const k = candidates.find((c) => rest.startsWith(c));
    if (!k) return null;
    out += dict.get(k)!;
    rest = rest.slice(k.length);
  }
  return out;
}

const lookupMemo = new Map<string, { tex: string; via: string } | null>();
function lookupTex(key: string, page: Map<string, string> | null): { tex: string; via: string } | null {
  const k = key.replace(/\s+/g, " ").trim();
  const onPage = page ? (page.has(k) ? "1" : "0") : "n";
  const memoKey = onPage + "|" + k;
  if (lookupMemo.has(memoKey)) return lookupMemo.get(memoKey)!;
  let res: { tex: string; via: string } | null = null;
  // 0. hand-authored overrides win over any dict conversion
  const exact = EXACT_FORMULAS.get(k);
  if (exact && katexOk(exact)) res = { tex: exact, via: "exact-formula" };
  if (!res && page && onPage === "1") {
    const tex = repairTex(page.get(k)!);
    if (katexOk(tex)) res = { tex, via: "page-exact" };
  }
  if (!res && page) {
    const seg = segmentLookup(k, page);
    if (seg && katexOk(repairTex(seg))) res = { tex: repairTex(seg), via: "page-seg" };
  }
  if (!res && globalDict.has(k)) {
    const tex = repairTex(globalDict.get(k)!);
    if (katexOk(tex)) res = { tex, via: "global-exact" };
  }
  if (!res) {
    const seg = segmentLookup(k, globalDict);
    if (seg && katexOk(repairTex(seg))) res = { tex: repairTex(seg), via: "global-seg" };
  }
  // 23b: strip-space match — aria " space " token runs differ corpus↔page
  if (!res) {
    const nk = stripTokens(k);
    if (nk.length > 3) {
      const tex = globalStripIndex().get(nk);
      if (tex && katexOk(repairTex(tex))) res = { tex: repairTex(tex), via: "strip-space" };
    }
  }
  if (!res) {
    // targeted mini-grammar handlers (recurring decimals, stacks, placeholders…)
    const extra = speechExtras(k);
    if (extra && katexOk(extra)) res = { tex: extra, via: "extras" };
  }
  if (!res && looksLikeSpeechText(k)) {
    // recon variants: pre-mapped vocab gaps + stripped Chrome "space" tokens
    const variants = [
      k,
      symbolPreMap(k),
      stripSpaceTokens(k),
      stripSpaceTokens(symbolPreMap(k)),
    ];
    for (const v of variants) {
      if (!looksLikeSpeechText(v)) continue;
      const tex = speechToTexSafe(v);
      if (tex && katexOk(tex) && !hasResidualGrammar(tex)) {
        res = { tex, via: "speech-recon" };
        break;
      }
    }
  }
  if (lookupMemo.size < 300000) lookupMemo.set(memoKey, res);
  return res;
}

// ---------- text patching ----------
const stats = {
  spansSeen: 0, spanFixed: 0, spanVia: {} as Record<string, number>,
  dollarSeen: 0, dollarFixed: 0, spanUnfixed: [] as { loc: string; text: string }[],
  emphasisFixed: 0, multilineSeen: 0, multilineConverted: 0, reconTexFixed: 0, bareFixed: 0,
  audit: [] as { loc: string; via: string; before: string; after: string }[],
};

function recordHit(loc: string, via: string, before: string, after: string) {
  if (
    stats.audit.length < 5000 &&
    (via === "extras" || via.includes("seg") || via === "speech-recon" || via === "strip-space" || via === "exact-formula")
  )
    stats.audit.push({ loc, via, before: before.slice(0, 200), after: after.slice(0, 200) });
}

// ---------- 23b: \text{}…\textrm{ }…\text{} prose-run merge ----------
function mergeTextRuns(src: string): string {
  let t = src;
  for (let i = 0; i < 6; i++) {
    const next = t.replace(
      /\\(?:text|textrm|mathrm)\{([^{}]*)\}(?:\\textrm\{\s*\}|\\text\{\s*\}|[ \t])+\\(?:text|textrm|mathrm)\{([^{}]*)\}/g,
      (_w, a: string, b: string) => `\\text{${a} ${b}}`,
    );
    if (next === t) break;
    t = next;
  }
  // a bare \textrm{ } gap inside math adds nothing
  t = t.replace(/\\textrm\{\s*\}/g, "");
  return t;
}

// ---------- 23b: bare speech-text lines (scrape lost the formatting) ----------
const MARK_STRONG =
  /\b(end enclose|end table|end cell|end row|end stack|end attributes|end style|begin mathsize|presubscript|presuperscript|end strike|fraction numerator|over denominator|end fraction|end exponent|stack sum)\b/i;
// scraping artifact: runs of literal "space" word tokens
const SPACE_RUN = /(?:\bspace\b[\s]*){3,}/;

const PREFIX_MARK = /^(\s*(?:>\s*|[-*]\s+|\d+\.\s+)?)([\s\S]*)$/;

// normalized prefix match: corpus line may be a truncated aria
function prefixMatch(normLine: string): string | null {
  if (normLine.length < 20) return null;
  let best: string | null = null;
  for (const [k, v] of globalDict) {
    if (k.length > normLine.length && k.startsWith(normLine) && (!best || k.length < best.length)) best = v;
  }
  return best;
}

function patchBareLines(src: string, page: Map<string, string> | null, loc: string): string {
  if (!MARK_STRONG.test(src) && !SPACE_RUN.test(src)) return src;
  const lines = src.split("\n");
  const isCandidate = (line: string): boolean => {
    const t = line.trim();
    if (!t || t.startsWith("![") || line.includes("`") || line.includes("$")) return false;
    return MARK_STRONG.test(t) || SPACE_RUN.test(t);
  };
  const wrap = (tex: string): string =>
    tex.includes("\\\\") && !tex.includes("\\begin{")
      ? `\\begin{array}{${/\\underline|\\hline/.test(tex) ? "r" : "l"}} ${tex} \\end{array}`
      : tex;

  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isCandidate(lines[i])) {
      let j = i;
      while (j + 1 < lines.length && isCandidate(lines[j + 1])) j++;
      const seg = lines.slice(i, j + 1);
      const firstPrefix = (lines[i].match(PREFIX_MARK) || ["", ""])[1];
      const joined = seg
        .map((l) => {
          const m = l.match(PREFIX_MARK);
          return m ? m[2] : l;
        })
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      let replaced = false;
      if (joined.length >= 8 && joined.length <= 2000) {
        const hit = lookupTex(joined, page);
        if (hit) {
          stats.bareFixed++;
          recordHit(loc, hit.via + "-bare", joined, hit.tex);
          out.push(`${firstPrefix}$${wrap(hit.tex)}$`);
          replaced = true;
        } else {
          // truncated aria: corpus line is a prefix of a full dict key
          const tex = prefixMatch(joined.replace(/\s+/g, " "));
          if (tex && katexOk(repairTex(tex))) {
            stats.bareFixed++;
            recordHit(loc, "prefix-bare", joined, tex);
            out.push(`${firstPrefix}$${wrap(repairTex(tex))}$`);
            replaced = true;
          }
        }
      }
      if (!replaced) out.push(...seg);
      i = j + 1;
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out.join("\n");
}

function recordUnfixed(loc: string, text: string) {
  if (stats.spanUnfixed.length < 400) stats.spanUnfixed.push({ loc, text: text.slice(0, 140) });
}

function patchMarkdown(src: string, page: Map<string, string> | null, loc: string): string {
  const hasTextRuns = /\\(?:text|textrm)\s*\{/.test(src);
  if ((!src.includes("`") && !src.includes("$") && !hasTextRuns) || (!MARK.test(src) && !hasTextRuns)) return src;

  const parts = src.split(new RegExp(FENCE, "g"));
  let out = parts.map((part, i) => {
    if (i % 2 === 1 && part.startsWith("```")) return part; // fenced block

    if (i % 2 === 1) {
      // inline code span captured whole
      const m = part.match(/^`([^`\n]*)`$/);
      if (m && MARK.test(m[1])) {
        stats.spansSeen++;
        const hit = lookupTex(m[1], page);
        if (hit) {
          stats.spanFixed++;
          stats.spanVia[hit.via] = (stats.spanVia[hit.via] ?? 0) + 1;
          recordHit(loc, hit.via, m[1], hit.tex);
          return `$${hit.tex}$`;
        }
        recordUnfixed(loc, m[1]);
        return part;
      }
      return part;
    }
    // text chunk: $..$ segments then remaining code spans
    if (part.includes("$")) {
      part = part.replace(DOLLAR, (whole, inner: string) => {
        // 23b: repair recon-era word artifacts (intersection/apostrophe/half…)
        if (/\^\{apostrophe\}|\bapostrophe\b|\bintersection\b|\bunion\b|\\text\s*\{[^{}]*\b(half|third|quarter|fourth|fifth|sixth)\b[^{}]*\}/.test(inner)) {
          const fixed = reconTexRepair(inner);
          if (fixed !== inner && katexOk(fixed)) {
            stats.reconTexFixed++;
            return `$${fixed}$`;
          }
        }
        if (!MARK.test(inner)) return whole;
        stats.dollarSeen++;
        const hit = lookupTex(inner, page);
        if (hit) {
          stats.dollarFixed++;
          stats.spanVia[hit.via] = (stats.spanVia[hit.via] ?? 0) + 1;
          recordHit(loc, hit.via, inner, hit.tex);
          return `$${hit.tex}$`;
        }
        recordUnfixed(loc, whole);
        return whole;
      });
    }
    // multi-line broken spans: `text\n...more` — try whole-span aria match
    // (page aria uses " space " tokens where the corpus wrapped lines),
    // then fall back to line-wise repair, unwrap
    if (part.includes("`") && part.includes("\n")) {
      part = part.replace(/`([^`]+)`/gs, (whole, inner: string) => {
        if (!inner.includes("\n")) return whole; // single-line handled elsewhere
        stats.multilineSeen++;
        // whole-span authoritative match first (23b)
        const wholeHit = lookupTex(inner, page);
        if (wholeHit && wholeHit.tex.includes("\\\\")) {
          const col = /\\underline|\\hline/.test(wholeHit.tex) ? "r" : "l";
          stats.multilineConverted++;
          stats.spanFixed++;
          stats.spanVia[wholeHit.via] = (stats.spanVia[wholeHit.via] ?? 0) + 1;
          recordHit(loc, wholeHit.via, inner, wholeHit.tex);
          return `$\\begin{array}{${col}} ${wholeHit.tex} \\end{array}$`;
        }
        const lines = inner.split("\n").map((line) => {
          if (!MARK.test(line)) return line; // prose/markdown line untouched
          const hit = lookupTex(line, page);
          if (hit) return `$${hit.tex}$`;
          const gc = genericChain(line);
          if (gc && !hasResidualGrammar(gc) && katexOk(gc)) return `$${gc}$`;
          return line; // leave line as-is
        });
        const fixedLines = lines.filter((l, idx) => l !== inner.split("\n")[idx]).length;
        if (fixedLines > 0) stats.multilineConverted++;
        return lines.join("\n");
      });
    }
    if (part.includes("`")) {
      part = part.replace(CODE, (whole, inner: string) => {
        if (!MARK.test(inner)) return whole;
        stats.spansSeen++;
        const hit = lookupTex(inner, page);
        if (hit) {
          stats.spanFixed++;
          stats.spanVia[hit.via] = (stats.spanVia[hit.via] ?? 0) + 1;
          recordHit(loc, hit.via, inner, hit.tex);
          return `$${hit.tex}$`;
        }
        recordUnfixed(loc, inner);
        return whole;
      });
    }
    return part;
  }).join("");

  // 23b: bare speech-text lines (quote-block equations with lost formatting)
  out = patchBareLines(out, page, loc);

  // 23b: merge \text{}…\textrm{ }…\text{} prose runs inside $…$ math
  let merged = out;
  if (hasTextRuns) {
    merged = merged.replace(DOLLAR, (whole, inner: string) => {
      if (!/\\(?:text|textrm)\s*\{/.test(inner)) return whole;
      const m = mergeTextRuns(inner);
      return m !== inner ? `$${m}$` : whole;
    });
  }
  out = merged;

  // emphasis normalization: trim stray spaces inside *…* / **…** whose
  // trimmed content is letter-bounded prose (never math/multiplication)
  return out.replace(/(\*\*|(?<!\*)\*(?!\*))([^*\n]+?)\1/g, (whole, delim: string, inner: string) => {
    const trimmed = inner.replace(/\s+/g, " ").trim();
    if (trimmed === inner.trim() || !trimmed) return whole;
    if (!/^[A-Za-z][A-Za-z0-9,'’%\-() ]*[A-Za-z.)]$/.test(trimmed)) return whole;
    stats.emphasisFixed++;
    return `${delim}${trimmed}${delim}`;
  });
}

// ---------- walk corpus ----------
const noteIdToUrl = new Map<string, string>();
for (const pkg of readdirSync(CONTENT)) {
  const dir = `${CONTENT}/${pkg}`;
  if (!existsSync(`${dir}/manifest.json`)) continue;
  const notesPath = `${dir}/notes.json`;
  if (existsSync(notesPath)) {
    const notes = JSON.parse(readFileSync(notesPath, "utf-8"));
    for (const n of Array.isArray(notes) ? notes : notes.notes ?? [])
      if (n.noteId) noteIdToUrl.set(n.noteId, n.sourceUrl);
  }
}

const urlPageCache = new Map<string, Map<string, string> | null>();
function pageFor(url?: string | null): Map<string, string> | null {
  if (!url) return null;
  if (urlPageCache.has(url)) return urlPageCache.get(url)!;
  let res: Map<string, string> | null = pageDicts.get(url) ?? null;
  if (!res) {
    try {
      const u = new URL(url);
      for (const [k, v] of pageDicts) {
        if (new URL(k).pathname === u.pathname) {
          res = v;
          break;
        }
      }
    } catch { /* not a url */ }
  }
  urlPageCache.set(url, res);
  return res;
}

function walkPatch(obj: any, page: Map<string, string> | null, loc: string): boolean {
  let changed = false;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const v = obj[i];
      if (typeof v === "string") {
        const p = patchMarkdown(v, page, loc);
        if (p !== v) {
          obj[i] = p;
          changed = true;
        }
      } else if (walkPatch(v, page, loc)) changed = true;
    }
    return changed;
  }
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "string") {
        const p = patchMarkdown(v, page, loc);
        if (p !== v) {
          obj[k] = p;
          changed = true;
        }
      } else if (walkPatch(v, page, loc)) changed = true;
    }
  }
  return changed;
}

function save(path: string, data: any) {
  writeFileSync(path, JSON.stringify(data)); // corpus convention: compact
}

const pkgReport: string[] = [];
for (const pkg of readdirSync(CONTENT)) {
  const dir = `${CONTENT}/${pkg}`;
  if (!existsSync(`${dir}/manifest.json`)) continue;
  const touched: string[] = [];

  const notesPath = `${dir}/notes.json`;
  if (existsSync(notesPath)) {
    const data = JSON.parse(readFileSync(notesPath, "utf-8"));
    const items = Array.isArray(data) ? data : data.notes ?? [];
    let any = false;
    for (const n of items) {
      const page = pageFor(n.sourceUrl);
      if (walkPatch(n, page, `${pkg}:notes:${n.noteId}`)) {
        any = true;
        touched.push(`note ${n.noteId}`);
      }
    }
    if (any) save(notesPath, data);
  }

  const qPath = `${dir}/questions.json`;
  if (existsSync(qPath)) {
    const data = JSON.parse(readFileSync(qPath, "utf-8"));
    const sets = Array.isArray(data) ? data : data.questionSets ?? [];
    let any = false;
    for (const s of sets) {
      const page = pageFor(s.source?.pageUrl);
      if (walkPatch(s, page, `${pkg}:questions:${s.slug}`)) {
        any = true;
        touched.push(`qset ${s.slug}`);
      }
    }
    if (any) save(qPath, data);
  }

  const fPath = `${dir}/flashcards.json`;
  if (existsSync(fPath)) {
    const data = JSON.parse(readFileSync(fPath, "utf-8"));
    const cards = Array.isArray(data) ? data : data.flashcards ?? [];
    let any = false;
    for (const c of cards) {
      const page = pageFor(noteIdToUrl.get(c.sourceNoteId));
      if (walkPatch(c, page, `${pkg}:flashcards:${c.id}`)) {
        any = true;
        touched.push(`card ${c.id}`);
      }
    }
    if (any) save(fPath, data);
  }

  if (touched.length) {
    pkgReport.push(`${pkg}: ${touched.length} items`);
    console.log(`${pkg}: ${touched.length} items patched`);
  }
}

console.log("\n==== SUMMARY ====");
console.log(`code spans: seen=${stats.spansSeen} fixed=${stats.spanFixed}`);
console.log(`$..$ segments: seen=${stats.dollarSeen} fixed=${stats.dollarFixed}`);
console.log(`recon-tex $..$ repaired: ${stats.reconTexFixed}`);
console.log(`bare speech lines repaired: ${stats.bareFixed}`);
console.log(`via:`, stats.spanVia);
console.log(`emphasis fixed: ${stats.emphasisFixed}`);
console.log(`multi-line spans: seen=${stats.multilineSeen} converted=${stats.multilineConverted}`);
console.log(`UNFIXED: ${stats.spanUnfixed.length}`);
for (const u of stats.spanUnfixed.slice(0, 25)) console.log(`  UNFIXED ${u.loc}: ${u.text}`);
writeFileSync("/home/z/my-project/work/patch_math_23a_report.json", JSON.stringify({
  stats, pkgReport, unfixed: stats.spanUnfixed, audit: stats.audit,
}, null, 2));
console.log("report -> work/patch_math_23a_report.json");
