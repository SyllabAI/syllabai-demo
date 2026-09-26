/**
 * Per-subject breakdown of reconstruction coverage — mirrors the live app
 * code path exactly (page.tsx): corpusPapersForCourse + collectPastPapers +
 * matchReconstructions + computeCoverage + blueprintFor.
 *
 * Usage: bun scripts/coverage_by_subject.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "/home/z/my-project";

const { corpusPapersForCourse } = await import(
  path.join(ROOT, "src/lib/pastpapers-corpus.ts")
);
const { collectPastPapers } = await import(
  path.join(ROOT, "src/lib/past-papers.ts")
);
const {
  matchReconstructions,
  blueprintFor,
  computeCoverage,
} = await import(path.join(ROOT, "src/lib/pastpapers-reconstruction.ts"));

const registryRaw = JSON.parse(
  fs.readFileSync(path.join(ROOT, "content/courses.json"), "utf8"),
);
const courses: Array<{ slug: string; label: string; level: string }> =
  registryRaw.courses ?? registryRaw;

interface Row {
  slug: string;
  label: string;
  level: string;
  reconstructions: number;
  interactive: number; // matched corpus rows
  complete: number;
  marksDiffer: number;
  partial: number;
  unverified: number;
  unmatched: number; // reconstructions with no corpus PDF counterpart
}

const rows: Row[] = [];
let tRecon = 0, tInteractive = 0, tComplete = 0, tPartial = 0, tMarksDiffer = 0, tUnverified = 0, tUnmatched = 0;

for (const { slug, label, level } of courses) {
  const qfile = path.join(ROOT, "content", slug, "questions.json");
  if (!fs.existsSync(qfile)) continue;
  const banks = JSON.parse(fs.readFileSync(qfile, "utf8"));
  const reconstructions = collectPastPapers(banks);
  if (reconstructions.length === 0) continue;

  const papers = corpusPapersForCourse(slug);
  const { matchKeys, matchedReconKeys, reconForCorpus } = matchReconstructions(
    papers,
    reconstructions,
  );

  const row: Row = {
    slug,
    label,
    level,
    reconstructions: reconstructions.length,
    interactive: matchKeys.size,
    complete: 0,
    marksDiffer: 0,
    partial: 0,
    unverified: 0,
    unmatched: reconstructions.filter((r) => !matchedReconKeys.has(r.key)).length,
  };
  for (const [corpusKey, recon] of reconForCorpus) {
    const cov = computeCoverage(recon, blueprintFor(corpusKey));
    switch (cov?.state) {
      case "complete": row.complete++; break;
      case "marks-differ": row.marksDiffer++; break;
      case "partial": row.partial++; break;
      default: row.unverified++; break;
    }
  }
  tRecon += row.reconstructions; tInteractive += row.interactive;
  tComplete += row.complete; tPartial += row.partial;
  tMarksDiffer += row.marksDiffer; tUnverified += row.unverified;
  tUnmatched += row.unmatched;
  rows.push(row);
}

rows.sort((a, b) => b.interactive - a.interactive);

const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
const rpad = (s: string, n: number) => (" ".repeat(n) + s).slice(-n);

console.log(
  pad("course", 52), pad("subject", 26),
  rpad("rec", 5), rpad("int", 5), rpad("done", 6), rpad("part", 6),
  rpad("mdif", 6), rpad("unvf", 6), rpad("unmt", 6),
);
console.log("-".repeat(118));
for (const r of rows) {
  console.log(
    pad(r.slug, 52), pad(r.label.slice(0, 25), 26),
    rpad(String(r.reconstructions), 5), rpad(String(r.interactive), 5),
    rpad(String(r.complete), 6), rpad(String(r.partial), 6),
    rpad(String(r.marksDiffer), 6), rpad(String(r.unverified), 6),
    rpad(String(r.unmatched), 6),
  );
}
console.log("-".repeat(118));
console.log(
  `TOTAL ${rows.length} courses · rec=${tRecon} int=${tInteractive} complete=${tComplete} partial=${tPartial} marks-differ=${tMarksDiffer} unverified=${tUnverified} unmatched=${tUnmatched}`,
);
