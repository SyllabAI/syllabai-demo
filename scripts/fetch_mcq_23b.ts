/**
 * T-SME-23b STEP 5: fetch the 5 SME multiple-choice-questions page variants
 * whose spans the 23a patcher missed because the corpus qset source.pageUrl
 * pointed at the /structured-questions/ variant instead.
 * Same extraction core as fetch_sme_math_23a.ts; resumeable cache shared.
 * Run: bun scripts/fetch_mcq_23b.ts
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { MathMLToLaTeX } from "mathml-to-latex";

const CACHE = "/home/z/my-project/work/mathml-cache";
mkdirSync(CACHE, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const URLS = [
  // ial physics — MCQ variants of the qsets whose spans stayed unfixed
  "https://www.savemyexams.com/international-a-level/physics/edexcel/19/topic-questions/2-waves-and-electricity/current-potential-difference-resistance-and-power/multiple-choice-questions/",
  "https://www.savemyexams.com/international-a-level/physics/edexcel/19/topic-questions/5-thermodynamics-radiation-oscillations-and-cosmology/astronomy/multiple-choice-questions/",
  "https://www.savemyexams.com/international-a-level/physics/edexcel/19/topic-questions/5-thermodynamics-radiation-oscillations-and-cosmology/kinetic-theory-and-ideal-gases/multiple-choice-questions/",
  "https://www.savemyexams.com/international-a-level/physics/edexcel/19/topic-questions/5-thermodynamics-radiation-oscillations-and-cosmology/nuclear-fusion-and-fission/multiple-choice-questions/",
  // ial chemistry — organic synthesis MCQ variant
  "https://www.savemyexams.com/international-a-level/chemistry/edexcel/17/topic-questions/5-transition-metals-and-organic-nitrogen-chemistry/5-6-organic-synthesis/multiple-choice-questions/",
  // 23b: rounding / standard-form note pages (circle/box menclose spans)
  "https://www.savemyexams.com/igcse/maths/edexcel/a-modular/24/foundation-unit-2/revision-notes/number/standard-form/converting-to-and-from-standard-form",
  "https://www.savemyexams.com/igcse/maths/edexcel/a-modular/24/foundation-unit-1/revision-notes/number/rounding-estimation-and-error-intervals-/rounding-to-a-given-place-value",
  "https://www.savemyexams.com/igcse/maths/edexcel/a-modular/24/foundation-unit-1/revision-notes/number/rounding-estimation-and-error-intervals-/rounding-to-significant-figures",
  "https://www.savemyexams.com/igcse/maths/edexcel/a-modular/24/higher-unit-1/revision-notes/number/rounding-estimation-and-bounds/rounding-and-estimation",
  // 23b: bare-text residue sources
  "https://www.savemyexams.com/international-a-level/biology/edexcel/18/topic-questions/6-microbiology-immunity-and-forensics/immunity/exam-questions/",
];

const PAIR_RE =
  /<span\b[^>]*\bdata-mathml\b[^>]*\baria-label="([^"]*)"[^>]*>(<math\b[\s\S]*?<\/math>)<\/span>|<span\b[^>]*\baria-label="([^"]*)"[^>]*\bdata-mathml\b[^>]*>(<math\b[\s\S]*?<\/math>)<\/span>/g;
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
  let m: RegExpExecArray | null;
  PAIR_RE.lastIndex = 0;
  while ((m = PAIR_RE.exec(html))) add(decodeEntities(m[1] ?? m[3]), m[2] ?? m[4]);
  JSON_EQ_RE.lastIndex = 0;
  while ((m = JSON_EQ_RE.exec(html))) add(decodeJsonString(m[1]), decodeJsonString(m[2]));
  return { dict, unparsed };
}

function curl(url: string): { ok: boolean; body: string; status: number } {
  const proc = Bun.spawnSync(
    ["curl", "-sL", "--max-time", "35", "-A", UA, "-H", "Accept-Language: en-GB,en;q=0.9", "-w", "\n%{http_code}", url],
    { timeout: 45_000 },
  );
  const out = proc.stdout.toString();
  const nl = out.lastIndexOf("\n");
  return {
    ok: proc.exitCode === 0 && status0(out, nl) === 200 && out.slice(0, nl).length > 50_000,
    body: out.slice(0, nl),
    status: status0(out, nl),
  };
}
function status0(out: string, nl: number): number {
  return parseInt(out.slice(nl + 1).trim() || "0", 10);
}

const key = (u: string) => createHash("sha1").update(u).digest("hex").slice(0, 16);

for (const url of URLS) {
  const fp = `${CACHE}/${key(url)}.json`;
  if (existsSync(fp)) {
    console.log(`SKIP (cached): ${url}`);
    continue;
  }
  let done = false;
  for (let attempt = 1; attempt <= 3 && !done; attempt++) {
    const { ok, body, status } = curl(url);
    if (ok) {
      const { dict, unparsed } = extractDict(body);
      writeFileSync(
        fp,
        JSON.stringify({ url, fetchedAt: new Date().toISOString(), pairs: Object.keys(dict).length, unparsed, dict }),
      );
      console.log(`OK pairs=${Object.keys(dict).length} unparsed=${unparsed}: ${url}`);
      done = true;
    } else {
      console.log(`attempt ${attempt} status=${status} len=${body.length}: ${url}`);
      if (attempt < 3) Bun.sleepSync(1500);
    }
  }
  if (!done) console.log(`FAILED: ${url}`);
  Bun.sleepSync(800 + Math.floor(Math.random() * 400));
}
console.log("done");
