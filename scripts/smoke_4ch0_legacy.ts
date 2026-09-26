/**
 * Smoke test — legacy-spec archive surfacing across ALL registry courses.
 * Verifies: every registry course resolves; legacy rows carry "Legacy spec";
 * current rows never do; maths tier filters still hold; chronology intact.
 */
import { readFileSync } from "node:fs";
import { corpusPapersForCourse } from "../src/lib/pastpapers-corpus";

const LEGACY_SPEC_KEYS = new Set([
  // IGCSE retired lines
  "pearson-edexcel/international-gcse/chemistry/4ch0",
  "pearson-edexcel/international-gcse/biology/4bi0",
  "pearson-edexcel/international-gcse/physics/4ph0",
  "pearson-edexcel/international-gcse/mathematics-a/4ma0",
  "pearson-edexcel/international-gcse/mathematics-b/4mb0",
  "pearson-edexcel/international-gcse/further-pure-mathematics/4pm0",
  "pearson-edexcel/international-gcse/economics/4ec0",
  "pearson-edexcel/international-gcse/ict/4it0",
  // old IAL 2008-spec units
  ...["01", "02", "03", "04", "05", "06"].flatMap((u) => [
    `pearson-edexcel/international-a-level/chemistry/wch${u}`,
    `pearson-edexcel/international-a-level/physics/wph${u}`,
    `pearson-edexcel/international-a-level/biology/wbi${u}`,
  ]),
]);

function sessionRank(id: string): number {
  if (id === "specimen") return -1;
  const m = id.match(/^(\d{4})-(\d{2})$/);
  return m ? Number(m[1]) * 12 + Number(m[2]) : -2;
}

const registry = JSON.parse(readFileSync("content/courses.json", "utf8")) as {
  courses: Array<{ slug: string; label: string }>;
};

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error("  FAIL:", msg);
};

let totalLegacy = 0;
for (const c of registry.courses) {
  const papers = corpusPapersForCourse(c.slug);
  const legacy = papers.filter((p) => LEGACY_SPEC_KEYS.has(p.specKey));
  totalLegacy += legacy.length;

  for (const p of papers) {
    const should = LEGACY_SPEC_KEYS.has(p.specKey);
    if (should && p.specBadge !== "Legacy spec") fail(`${c.slug} ${p.ref} missing badge`);
    if (!should && p.specBadge !== null) fail(`${c.slug} ${p.ref} wrongly badged`);
  }
  for (let i = 1; i < papers.length; i++) {
    if (sessionRank(papers[i - 1].sessionId) < sessionRank(papers[i].sessionId))
      fail(`${c.slug} chronology broken at ${papers[i].ref}`);
  }
  if (c.slug === "igcse-maths-a-18-foundation" && papers.some((p) => p.variant.includes("H")))
    fail("foundation course contains H papers");
  if (c.slug === "igcse-maths-a-18-higher" && papers.some((p) => p.variant.includes("F")))
    fail("higher course contains F papers");

  const tag = legacy.length > 0 ? ` (+${legacy.length} legacy)` : "";
  console.log(`${c.slug.padEnd(70)} ${String(papers.length).padStart(4)} papers${tag}`);
}

console.log(`\nlegacy rows surfaced across all courses: ${totalLegacy}`);
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
