/**
 * T-SME-23a: fetch all SME pages that hold math needed for corpus repair.
 * - 721 affected note pages + 448 affected question pages (+ any note pages
 *   referenced by affected flashcards that are not already covered)
 * - extracts (aria-label -> LaTeX) dictionaries via MathMLToLaTeX
 * - resumeable: skips URLs whose cache file already exists
 * - polite: 2 workers, 700-1200ms jitter delay, 3 retries w/ backoff
 * Run: bun scripts/fetch_sme_math_23a.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { MathMLToLaTeX } from "mathml-to-latex";
import { looksLikeSpeechText } from "../src/lib/speech-math";

const CONTENT = "/home/z/my-project/content";
const CACHE = "/home/z/my-project/work/mathml-cache";
mkdirSync(CACHE, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const MARK = /\b(open parentheses|close parentheses|open bracket|close bracket|open curly|close curly|fraction numerator|over denominator|end fraction|end table|end cell|end row|to the power of|end exponent|square root of|end root|cube root|with bar on top|open square brackets|close square brackets|plus-or-minus|direct double arrow|rightwards arrow|identical to|cross times|plus sign|minus sign|percent sign|subscript|superscript|stack sum|sum from|end style|begin mathsize)\b/;
const CODE = /`([^`\n]+)`/g;
const DOLLAR = /(?<!\\)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\\)\$(?!\$)/g;

function polluted(text: string): boolean {
  for (const m of text.matchAll(CODE)) if (MARK.test(m[1])) return true;
  for (const m of text.matchAll(DOLLAR)) if (MARK.test(m[1])) return true;
  return false;
}

function* iterTexts(obj: any): Generator<string> {
  if (typeof obj === "string") yield obj;
  else if (Array.isArray(obj)) for (const v of obj) yield* iterTexts(v);
  else if (obj && typeof obj === "object") for (const v of Object.values(obj)) yield* iterTexts(v);
}

// ---------- 1. build URL work list ----------
const noteUrls = new Set<string>();
const qsetUrls = new Set<string>();
const noteIdToUrl = new Map<string, string>();

for (const pkg of readdirSync(CONTENT)) {
  const dir = `${CONTENT}/${pkg}`;
  if (!existsSync(`${dir}/manifest.json`)) continue;
  // notes
  if (existsSync(`${dir}/notes.json`)) {
    const notes = JSON.parse(readFileSync(`${dir}/notes.json`, "utf-8"));
    const items = Array.isArray(notes) ? notes : notes.notes ?? [];
    for (const n of items) {
      if (n.noteId) noteIdToUrl.set(n.noteId, n.sourceUrl);
      if ([...iterTexts(n)].some(polluted) && n.sourceUrl) noteUrls.add(n.sourceUrl);
    }
  }
  // questions
  if (existsSync(`${dir}/questions.json`)) {
    const q = JSON.parse(readFileSync(`${dir}/questions.json`, "utf-8"));
    const sets = Array.isArray(q) ? q : q.questionSets ?? [];
    for (const s of sets) {
      if ([...iterTexts(s)].some(polluted)) {
        const u = s.source?.pageUrl;
        if (u) qsetUrls.add(u);
      }
    }
  }
  // flashcards -> resolve source note urls
  if (existsSync(`${dir}/flashcards.json`)) {
    const f = JSON.parse(readFileSync(`${dir}/flashcards.json`, "utf-8"));
    const cards = Array.isArray(f) ? f : f.flashcards ?? [];
    for (const c of cards) {
      if ([...iterTexts(c)].some(polluted)) {
        const u = noteIdToUrl.get(c.sourceNoteId);
        if (u) noteUrls.add(u);
      }
    }
  }
}

const allUrls = [...noteUrls, ...qsetUrls];
console.log(`work list: ${noteUrls.size} note pages + ${qsetUrls.size} question pages = ${allUrls.length}`);

// ---------- 2. curl fetch with retries ----------
function curl(url: string): Promise<{ ok: boolean; body: string; status: number }> {
  return new Promise((resolve) => {
    const proc = Bun.spawnSync(
      ["curl", "-sL", "--max-time", "35", "-A", UA, "-H", "Accept-Language: en-GB,en;q=0.9", "-w", "\n%{http_code}", url],
      { timeout: 45_000 },
    );
    const out = proc.stdout.toString();
    const nl = out.lastIndexOf("\n");
    const body = out.slice(0, nl);
    const status = parseInt(out.slice(nl + 1).trim() || "0", 10);
    resolve({ ok: proc.exitCode === 0 && status === 200 && body.length > 50000, body, status });
  });
}

const PAIR_RE =
  /<span\b[^>]*\bdata-mathml\b[^>]*\baria-label="([^"]*)"[^>]*>(<math\b[\s\S]*?<\/math>)<\/span>|<span\b[^>]*\baria-label="([^"]*)"[^>]*\bdata-mathml\b[^>]*>(<math\b[\s\S]*?<\/math>)<\/span>/g;
// ProseMirror equation nodes inside the RSC flight payload:
// {"type":"equation","attrs":{"alt":"<speech>","src":"","width":..,"height":..,"mathml":"<math …>…</math>"}}
const JSON_EQ_RE = /"alt":"((?:[^"\\]|\\.)*)"[^{}]*?"mathml":"((?:[^"\\]|\\.)*)"/g;

function decodeJsonString(s: string): string {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function extractDict(html: string): { dict: Record<string, string>; unparsed: number } {
  const dict: Record<string, string> = {};
  let unparsed = 0;
  const add = (rawKey: string, mathml: string) => {
    const aria = rawKey.replace(/\s+/g, " ").trim();
    if (!aria || dict[aria] !== undefined) return;
    try {
      const tex = MathMLToLaTeX.convert(mathml);
      if (tex.trim()) dict[aria] = tex;
      else unparsed++;
    } catch {
      unparsed++;
    }
  };
  // A: static HTML wrappers
  let m: RegExpExecArray | null;
  PAIR_RE.lastIndex = 0;
  while ((m = PAIR_RE.exec(html))) add(decodeEntities(m[1] ?? m[3]), m[2] ?? m[4]);
  // B: RSC flight payload equation nodes
  JSON_EQ_RE.lastIndex = 0;
  while ((m = JSON_EQ_RE.exec(html))) add(decodeJsonString(m[1]), decodeJsonString(m[2]));
  return { dict, unparsed };
}

const key = (u: string) => createHash("sha1").update(u).digest("hex").slice(0, 16);
let done = 0,
  skipped = 0,
  failed = 0,
  totalPairs = 0;

async function worker(urls: string[], wid: number) {
  for (const url of urls) {
    const k = key(url);
    const fp = `${CACHE}/${k}.json`;
    if (existsSync(fp)) {
      skipped++;
      continue;
    }
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      const { ok: okResp, body, status } = await curl(url);
      if (okResp) {
        const { dict, unparsed } = extractDict(body);
        writeFileSync(
          fp,
          JSON.stringify({ url, fetchedAt: new Date().toISOString(), pairs: Object.keys(dict).length, unparsed, dict }),
        );
        totalPairs += Object.keys(dict).length;
        ok = true;
      } else {
        if (attempt === 3) {
          failed++;
          writeFileSync(fp, JSON.stringify({ url, error: `status=${status}`, empty: true }));
          console.log(`  [w${wid}] FAIL ${status} ${url.slice(0, 100)}`);
        } else {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
    }
    done++;
    if (done % 40 === 0)
      console.log(`  [w${wid}] ${done + skipped}/${allUrls.length} done (${failed} failed, ${totalPairs} pairs)`);
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 500));
  }
}

const W = 2;
const buckets: string[][] = Array.from({ length: W }, () => []);
allUrls.forEach((u, i) => buckets[i % W].push(u));
console.time("fetch");
await Promise.all(buckets.map((b, i) => worker(b, i)));
console.timeEnd("fetch");
console.log(`DONE fetched=${done} skipped=${skipped} failed=${failed} totalPairs=${totalPairs}`);
