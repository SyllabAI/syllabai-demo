/**
 * Task 2 diagnosis — the 14 zero-interactive courses.
 * For each: what does the corpus index hold, and what do the reconstruction
 * sourcePaper shapes look like? Classifies:
 *   no-spec-map   → course has no COURSE_SPECS entry (corpusPapersForCourse = [])
 *   no-index-dirs → spec mapped but the index has no paper dirs for it
 *   shape-miss    → index has dirs but parseReconstruction yields no usable match
 *   session-miss  → parsed fine, but sessions don't overlap
 * Usage: bun scripts/diagnose_zero_interactive.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "/home/z/my-project";

const indexJson = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/pastpapers-index.json"), "utf8"),
);
const { corpusPapersForCourse } = await import(
  path.join(ROOT, "src/lib/pastpapers-corpus.ts")
);
const { collectPastPapers } = await import(
  path.join(ROOT, "src/lib/past-papers.ts")
);
const { parseReconstruction } = await import(
  path.join(ROOT, "src/lib/pastpapers-reconstruction.ts")
);

const ZERO: Array<[string, string]> = [
  ["igcse-biology-modular-24-unit-1", "4bi1"],
  ["igcse-biology-modular-24-unit-2", "4bi1"],
  ["igcse-chemistry-modular-24-unit-1", "4ch1"],
  ["igcse-chemistry-modular-24-unit-2", "4ch1"],
  ["igcse-physics-modular-24-unit-1", "4ph1"],
  ["igcse-physics-modular-24-unit-2", "4ph1"],
  ["igcse-maths-a-modular-24-foundation-unit-1", "4ma1"],
  ["igcse-maths-a-modular-24-foundation-unit-2", "4ma1"],
  ["igcse-maths-a-modular-24-higher-unit-1", "4ma1"],
  ["igcse-maths-a-modular-24-higher-unit-2", "4ma1"],
  ["igcse-science-double-award-17-biology", "4sd0"],
  ["igcse-science-double-award-17-chemistry", "4sd0"],
  ["igcse-science-double-award-17-physics", "4sd0"],
  ["igcse-business-19", "4bs1"],
  ["igcse-economics-17", "4ec1"],
  ["igcse-ict-17", "4it1"],
  ["igcse-english-literature-16", "4et1"],
  ["igcse-english-language-a-16-paper-1-non-fiction-texts-and-transactional-writing", "4ea1"],
  ["igcse-english-language-a-16-paper-2-poetry-and-prose-texts-and-imaginative-writing", "4ea1"],
  ["igcse-accounting-17-introduction-to-bookkeeping-and-accounting", "4ac1"],
  ["ial-maths-20-decision-1", "WDM11"],
  ["ial-further-maths-18-further-pure-1", "WFM01"],
];

// spec folders present in the index
const specs = indexJson.specs as Record<string, { sessions?: Record<string, { dirs?: Record<string, unknown> }> }>;
const specFolderSummary: Record<string, number> = {};
for (const [folder, spec] of Object.entries(specs)) {
  let dirs = 0;
  for (const s of Object.values(spec.sessions ?? {})) dirs += Object.keys(s.dirs ?? {}).length;
  specFolderSummary[folder] = dirs;
}

for (const [slug, code] of ZERO) {
  const papers = corpusPapersForCourse(slug);
  const banks = JSON.parse(
    fs.readFileSync(path.join(ROOT, "content", slug, "questions.json"), "utf8"),
  );
  const recons = collectPastPapers(banks);

  // distinct sourcePaper shapes — walk banks exactly like collectPastPapers does
  const bankList: any[] = Array.isArray(banks) ? banks : banks.questions ? [banks] : [];
  const parts: any[] = bankList.flatMap((b: any) =>
    (b.questions ?? []).flatMap((q: any) => q.parts ?? []),
  );
  const tagged = parts.filter((p) => p.sourcePaper);
  const shapeCounts = new Map<string, number>();
  for (const p of tagged) {
    const d = p.sourcePaper?.date ?? "?";
    const n = p.sourcePaper?.number ?? "?";
    shapeCounts.set(`${d} | ${n}`, (shapeCounts.get(`${d} | ${n}`) ?? 0) + 1);
  }
  const parsedOk = tagged.filter((p) => {
    const pr = parseReconstruction(p.sourcePaper?.date ?? "", p.sourcePaper?.number ?? "");
    return pr && pr.sessionIds.length > 0;
  }).length;

  // how many index dirs exist under the course's spec folders?
  const specMap = (await import(path.join(ROOT, "src/lib/pastpapers-corpus.ts"))).corpusSpecsForCourse(slug);
  const folders = specMap ? [...specMap.specs, ...(specMap.legacySpecs ?? [])] : [];
  const folderDirs = folders.map((f) => `${f.split("/").slice(-2).join("/")}:${specFolderSummary[f] ?? 0}`);
  // sample corpus sessions
  const corpusSessions = [...new Set(papers.map((p) => p.sessionId))].sort();
  const reconSessions = new Set(
    tagged.flatMap((p) => parseReconstruction(p.sourcePaper?.date ?? "", p.sourcePaper?.number ?? "")?.sessionIds ?? []),
  );
  const overlap = corpusSessions.filter((s) => reconSessions.has(s));

  console.log(`\n## ${slug} (${code})`);
  console.log(`   reconstructions: ${recons.length} · tagged parts: ${tagged.length} · parseable: ${parsedOk}`);
  console.log(`   spec-map: ${specMap ? "YES" : "NO"} · corpus rows: ${papers.length} · index dirs by folder: ${folderDirs.join(" ") || "n/a"}`);
  console.log(`   corpus sessions: ${corpusSessions.slice(0, 6).join(" ")}${corpusSessions.length > 6 ? ` …(+${corpusSessions.length - 6})` : ""}`);
  console.log(`   recon sessions:  ${[...reconSessions].sort().slice(0, 6).join(" ")}${reconSessions.size > 6 ? ` …(+${reconSessions.size - 6})` : ""} · overlap: ${overlap.length}`);
  const top = [...shapeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`   top shapes: ${top.map(([k, v]) => `${JSON.stringify(k)}×${v}`).join(" · ")}`);
}
