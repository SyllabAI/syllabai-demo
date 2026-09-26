/**
 * Smoke test — reconstruction coverage badges.
 * Verifies, against the committed blueprint file:
 *   1. blueprints parse and every entry is internally consistent
 *      (marks sum to total; inferred gaps filled; totals plausible)
 *   2. known anchor cases hold:
 *      - Jun 2021 4CH1/1C reconstruction is COMPLETE (10/10 · 110/110)
 *      - Jun 2019 4CH1/1C: the "Ju1c"+"Ju1C" provenance shapes merge into
 *        one complete reconstruction (15/15 · 110/110, Q7 inferred)
 *      - Jan 2020 4CH1/1C reconstruction is PARTIAL (1/10)
 *      - Nov 2020 4CH1/1C holds all questions with one +1 mark SME
 *        reallocation → "marks-differ" (111/110)
 *   3. every matched corpus row across ALL registry courses computes a
 *      coverage without crashing, and no coverage over-claims (a "complete"
 *      state never coexists with missing/extra questions).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { collectPastPapers, findPastPaper } from "../src/lib/past-papers";
import { corpusPapersForCourse } from "../src/lib/pastpapers-corpus";
import {
  matchReconstructions,
  computeCoverage,
  blueprintFor,
  coverageChipLabel,
} from "../src/lib/pastpapers-reconstruction";

const ROOT = path.resolve(import.meta.dir, "..");
let failures = 0;
function check(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ok  ${msg}`);
  } else {
    failures++;
    console.error(`  FAIL ${msg}`);
  }
}

// ── 1. blueprint file sanity ───────────────────────────────────────────────
const bpFile = path.join(ROOT, "src/data/pastpapers-blueprints.json");
const bp = JSON.parse(readFileSync(bpFile, "utf8")) as {
  meta: { papers: number; treeSha: string };
  papers: Record<string, { marks: Record<string, number>; total: number; paperTotal: number | null; inferred: string[] }>;
};
console.log(`blueprints: ${bp.meta.papers} papers · treeSha ${bp.meta.treeSha.slice(0, 8)}…`);
check(bp.meta.papers > 100, `blueprint count ${bp.meta.papers} > 100`);

let bpBad = 0;
for (const [key, b] of Object.entries(bp.papers)) {
  const sum = Object.values(b.marks).reduce((a, x) => a + x, 0);
  if (sum !== b.total) bpBad++;
  for (const inf of b.inferred) if (!b.marks[inf]) bpBad++;
  if (Object.keys(b.marks).length < 3) bpBad++;
}
check(bpBad === 0, `all blueprints internally consistent (${bpBad} bad)`);

// ── 2. anchor cases (chemistry) ────────────────────────────────────────────
const banks = JSON.parse(readFileSync(path.join(ROOT, "content/igcse-chemistry-19/questions.json"), "utf8"));
const reconstructions = collectPastPapers(banks);
const papers = corpusPapersForCourse("igcse-chemistry-19");
const { reconForCorpus } = matchReconstructions(papers, reconstructions);

console.log("anchors:");
{
  const cov = computeCoverage(reconForCorpus.get("2021-06:4CH1-1C")!, blueprintFor("2021-06:4CH1-1C"));
  check(cov?.state === "complete", `Jun 2021 1C complete (${cov?.state} ${coverageChipLabel(cov)})`);
  check(cov?.heldMarks === 110 && cov.officialMarks === 110, `Jun 2021 1C marks 110/110 (${cov?.heldMarks}/${cov?.officialMarks})`);
}
{
  // merged Ju1c + Ju1C shapes → one complete reconstruction
  const merged = reconstructions.find((r) => r.key === "2019-ju1c");
  check(!!merged, `2019 Ju1c/Ju1C merged into one reconstruction`);
  const cov = computeCoverage(merged!, blueprintFor("2019-06:4CH1-1C"));
  check(cov?.state === "complete", `Jun 2019 1C complete after merge (${cov?.state} ${coverageChipLabel(cov)})`);
  check(blueprintFor("2019-06:4CH1-1C")?.inferred.includes("7") === true, `Jun 2019 1C Q7 inferred from paper total`);
}
{
  const cov = computeCoverage(reconForCorpus.get("2020-01:4CH1-1C")!, blueprintFor("2020-01:4CH1-1C"));
  check(cov?.state === "partial", `Jan 2020 1C partial (${cov?.state} ${coverageChipLabel(cov)})`);
}
{
  const cov = computeCoverage(reconForCorpus.get("2020-11:4CH1-1C")!, blueprintFor("2020-11:4CH1-1C"));
  check(cov?.state === "marks-differ", `Nov 2020 1C marks-differ (${cov?.state} ${cov?.heldMarks}/${cov?.officialMarks})`);
}
{
  // a row without a blueprint (specimen) → null → UI stays "unverified"
  const cov = computeCoverage(reconForCorpus.get("specimen:4CH1-1C") ?? null, blueprintFor("specimen:4CH1-1C"));
  check(cov === null || cov.state === "unverified", `specimen 1C unverified or unmatched (${cov?.state ?? "null"})`);
}

// ── 3. sweep all registry courses ──────────────────────────────────────────
const registry = JSON.parse(readFileSync(path.join(ROOT, "content/courses.json"), "utf8"));
const courses: Array<{ slug: string }> = Array.isArray(registry) ? registry : registry.courses;
let sweepBad = 0;
let covered = 0;
let complete = 0;
for (const { slug } of courses) {
  const qfile = path.join(ROOT, "content", slug, "questions.json");
  if (!existsSync(qfile)) continue;
  const rs = collectPastPapers(JSON.parse(readFileSync(qfile, "utf8")));
  const ps = corpusPapersForCourse(slug);
  const { reconForCorpus: m } = matchReconstructions(ps, rs);
  for (const [key, recon] of m) {
    const cov = computeCoverage(recon, blueprintFor(key));
    if (!cov) continue;
    covered++;
    if (cov.state === "complete") complete++;
    // no over-claiming: complete must never have missing/extra questions
    if (cov.state === "complete" && (cov.missing.length > 0 || cov.extra.length > 0)) sweepBad++;
    if (cov.state === "complete" && cov.heldMarks !== cov.officialMarks) sweepBad++;
  }
}
console.log(`sweep: ${covered} covered matched rows · ${complete} complete`);
check(sweepBad === 0, `no over-claiming across all courses (${sweepBad} bad)`);

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nALL COVERAGE CHECKS PASSED");
