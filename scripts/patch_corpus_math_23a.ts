/**
 * T-SME-23a: corpus-wide math repair from SME source MathML.
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

const MARK = /\b(open parentheses|close parentheses|open bracket|close bracket|open curly|close curly|fraction numerator|over denominator|end fraction|end table|end cell|end row|to the power of|end exponent|square root of|end root|cube root|with bar on top|open square brackets|close square brackets|plus-or-minus|direct double arrow|rightwards arrow|identical to|cross times|plus sign|minus sign|percent sign|presubscript|presuperscript|subscript|superscript|stack sum|sum from|end style|begin mathsize|left parenthesis|right parenthesis|left bracket|right bracket|left square brackets|right square brackets|horizontal strike|vertical strike|vertical line)\b/;
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
  if (page && onPage === "1") {
    const tex = page.get(k)!;
    if (katexOk(tex)) res = { tex, via: "page-exact" };
  }
  if (!res && page) {
    const seg = segmentLookup(k, page);
    if (seg && katexOk(seg)) res = { tex: seg, via: "page-seg" };
  }
  if (!res && globalDict.has(k)) {
    const tex = globalDict.get(k)!;
    if (katexOk(tex)) res = { tex, via: "global-exact" };
  }
  if (!res) {
    const seg = segmentLookup(k, globalDict);
    if (seg && katexOk(seg)) res = { tex: seg, via: "global-seg" };
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
  emphasisFixed: 0, multilineSeen: 0, multilineConverted: 0,
  audit: [] as { loc: string; via: string; before: string; after: string }[],
};

function recordHit(loc: string, via: string, before: string, after: string) {
  if (stats.audit.length < 5000 && (via === "extras" || via.includes("seg") || via === "speech-recon"))
    stats.audit.push({ loc, via, before: before.slice(0, 200), after: after.slice(0, 200) });
}

function recordUnfixed(loc: string, text: string) {
  if (stats.spanUnfixed.length < 400) stats.spanUnfixed.push({ loc, text: text.slice(0, 140) });
}

function patchMarkdown(src: string, page: Map<string, string> | null, loc: string): string {
  if ((!src.includes("`") && !src.includes("$")) || !MARK.test(src)) return src;

  const parts = src.split(new RegExp(FENCE, "g"));
  const out = parts.map((part, i) => {
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
    // multi-line broken spans: `text\n...more` — line-wise repair, unwrap
    if (part.includes("`") && part.includes("\n")) {
      part = part.replace(/`([^`]+)`/gs, (whole, inner: string) => {
        if (!inner.includes("\n")) return whole; // single-line handled elsewhere
        stats.multilineSeen++;
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
console.log(`via:`, stats.spanVia);
console.log(`emphasis fixed: ${stats.emphasisFixed}`);
console.log(`multi-line spans: seen=${stats.multilineSeen} converted=${stats.multilineConverted}`);
console.log(`UNFIXED: ${stats.spanUnfixed.length}`);
for (const u of stats.spanUnfixed.slice(0, 25)) console.log(`  UNFIXED ${u.loc}: ${u.text}`);
writeFileSync("/home/z/my-project/work/patch_math_23a_report.json", JSON.stringify({
  stats, pkgReport, unfixed: stats.spanUnfixed, audit: stats.audit,
}, null, 2));
console.log("report -> work/patch_math_23a_report.json");
