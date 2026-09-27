/**
 * dump_doubleaward_needs.ts — what (session, variant) pairs do the three
 * double-award-17 courses' reconstructions actually need from the archive?
 *
 * Runs parseReconstruction over every recon and aggregates the needed
 * corpus keys, so the 4SD0 upload can target exactly those papers.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SLUGS = [
  "igcse-science-double-award-17-biology",
  "igcse-science-double-award-17-chemistry",
  "igcse-science-double-award-17-physics",
];

const { collectPastPapers } = await import(path.join(ROOT, "src/lib/past-papers.ts"));
const { parseReconstruction } = await import(
  path.join(ROOT, "src/lib/pastpapers-reconstruction.ts")
);

for (const slug of SLUGS) {
  const banks = JSON.parse(
    fs.readFileSync(path.join(ROOT, "content", slug, "questions.json"), "utf8"),
  );
  const recons = collectPastPapers(banks);
  const needs = new Map<string, { recons: number; questions: number }>();
  const unparsed: string[] = [];
  const units = new Set<string>();

  for (const r of recons) {
    const p = parseReconstruction(r.date, r.number);
    if (!p) {
      unparsed.push(`${r.date} | ${r.number}`);
      continue;
    }
    if (p.unit) units.add(p.unit);
    const qCount = r.questions?.length ?? 0;
    for (const s of p.sessionIds) {
      const k = `${s}  ${p.variant}`;
      const cur = needs.get(k) ?? { recons: 0, questions: 0 };
      needs.set(k, { recons: cur.recons + 1, questions: cur.questions + qCount });
    }
  }

  console.log(`\n== ${slug} — ${recons.length} reconstructions`);
  for (const [k, v] of [...needs.entries()].sort()) {
    console.log(`   ${k}  ← ${v.recons} recon(s), ${v.questions} questions`);
  }
  if (units.size) console.log(`   units seen: ${[...units].join(", ")}`);
  if (unparsed.length) {
    console.log(
      `   UNPARSED (${unparsed.length}): ${unparsed.slice(0, 8).join(" | ")}${unparsed.length > 8 ? " …" : ""}`,
    );
  }
}
