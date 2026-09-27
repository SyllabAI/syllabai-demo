/**
 * Snapshot matched corpusKey→reconKey pairs per course, for before/after diffing
 * when parseReconstruction changes. Writes /tmp/recon-match-snapshot.json
 * Usage: bun scripts/match_snapshot.ts [outPath]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "/home/z/my-project";
const out = process.argv[2] ?? "/tmp/recon-match-snapshot.json";

const { corpusPapersForCourse } = await import(path.join(ROOT, "src/lib/pastpapers-corpus.ts"));
const { collectPastPapers } = await import(path.join(ROOT, "src/lib/past-papers.ts"));
const { matchReconstructions } = await import(path.join(ROOT, "src/lib/pastpapers-reconstruction.ts"));

const registryRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "content/courses.json"), "utf8"));
const courses: Array<{ slug: string }> = registryRaw.courses ?? registryRaw;

const snap: Record<string, Record<string, string>> = {}; // slug → corpusKey → reconKey
for (const { slug } of courses) {
  const qfile = path.join(ROOT, "content", slug, "questions.json");
  if (!fs.existsSync(qfile)) continue;
  const banks = JSON.parse(fs.readFileSync(qfile, "utf8"));
  const recons = collectPastPapers(banks);
  if (recons.length === 0) continue;
  const papers = corpusPapersForCourse(slug);
  const { matchKeys } = matchReconstructions(papers, recons);
  const m: Record<string, string> = {};
  for (const [k, v] of matchKeys) m[k] = v;
  if (Object.keys(m).length) snap[slug] = m;
}
fs.writeFileSync(out, JSON.stringify(snap, null, 1));
const total = Object.values(snap).reduce((a, m) => a + Object.keys(m).length, 0);
console.log(`snapshot saved: ${total} matched pairs across ${Object.keys(snap).length} courses → ${out}`);
