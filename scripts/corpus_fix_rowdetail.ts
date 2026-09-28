/**
 * Per-row coverage detail for the double-award physics + 4PH1 physics courses:
 * every matched corpus row with its blueprint marks vs the recon's held
 * questions, to explain status flips after the corpus fix.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "/home/z/my-project";
const { corpusPapersForCourse } = await import(path.join(ROOT, "src/lib/pastpapers-corpus.ts"));
const { collectPastPapers } = await import(path.join(ROOT, "src/lib/past-papers.ts"));
const { matchReconstructions, blueprintFor, computeCoverage } = await import(
  path.join(ROOT, "src/lib/pastpapers-reconstruction.ts")
);

for (const slug of ["igcse-science-double-award-17-physics", "igcse-physics-19"]) {
  console.log(`\n=== ${slug}`);
  const banks = JSON.parse(fs.readFileSync(path.join(ROOT, "content", slug, "questions.json"), "utf8"));
  const reconstructions = collectPastPapers(banks);
  const papers = corpusPapersForCourse(slug);
  const { matchKeys, matchedReconKeys, reconForCorpus } = matchReconstructions(papers, reconstructions);
  console.log(`corpus rows=${papers.length} matched=${matchKeys.size} recons=${reconstructions.length}`);
  for (const [corpusKey, recon] of reconForCorpus) {
    const bp = blueprintFor(corpusKey);
    const cov = computeCoverage(recon, bp);
    const held = Object.keys(recon.questions ?? {}).length ?? "?";
    const bpQ = bp ? Object.keys(bp.marks ?? {}).length : 0;
    const markCmp = bp
      ? Object.entries(recon.questions ?? {})
          .slice(0, 3)
          .map(([q, rq]: [string, any]) => `Q${q}:${rq.totalMarks ?? "?"}/${bp.marks?.[q] ?? "?"}`)
          .join(" ")
      : "no-blueprint";
    console.log(
      `  ${corpusKey.padEnd(20)} state=${(cov?.state ?? "unverified").padEnd(12)} held=${String(held).padEnd(3)} bpQ=${String(bpQ).padEnd(3)} ${markCmp}`,
    );
  }
}
