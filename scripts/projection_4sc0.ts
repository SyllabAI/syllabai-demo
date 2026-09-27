/**
 * 4SC0-wave projection — simulate matchReconstructions for the double-award
 * physics course against (a) the current corpus index, (b) the index with the
 * planned 4PH0 R-variant rows injected, to verify the wave before downloading.
 *
 * Usage: bun scripts/projection_4sc0.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "/home/z/my-project";
const { corpusPapersForCourse } = await import(
  path.join(ROOT, "src/lib/pastpapers-corpus.ts")
);
const { collectPastPapers } = await import(path.join(ROOT, "src/lib/past-papers.ts"));
const {
  matchReconstructions,
  parseReconstruction,
} = await import(path.join(ROOT, "src/lib/pastpapers-reconstruction.ts"));

const banks = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "content/igcse-science-double-award-17-physics/questions.json"),
    "utf8",
  ),
);
const recons = collectPastPapers(banks);

// ── 1. parse inventory: which recon keys parse to which (session, variant) ──
const parsed = recons.map((r) => ({ key: r.key, date: r.date, number: r.number, p: parseReconstruction(r.date, r.number) }));
const ok = parsed.filter((x) => x.p);
const bad = parsed.filter((x) => !x.p);
const needVariants = new Set(ok.flatMap((x) => x.p!.sessionIds.map((s) => `${s}:${x.p!.variant}`)));
console.log(`recons=${recons.length} parseable=${ok.length} unparseable=${bad.length}`);
console.log("unparseable:", bad.map((b) => `${b.date} + ${b.number}`).join(" | "));
const byVariant: Record<string, number> = {};
for (const x of ok) byVariant[x.p!.variant] = (byVariant[x.p!.variant] ?? 0) + 1;
console.log("parsed variant census:", byVariant);

// ── 2. simulate planned index (inject 4PH0 R rows into a runtime copy) ──
const idxPath = path.join(ROOT, "src/data/pastpapers-index.json");
const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
const spec = idx.specs["pearson-edexcel/international-gcse/physics/4ph0"];
const R_SESSIONS = ["2018-06", "2017-06", "2016-06", "2015-06", "2014-06", "2013-06"];
const R_HAS_QP = new Set(["2018-06", "2017-06", "2016-06", "2014-06", "2013-06"]); // 2015-06: ms only
for (const ss of spec.sessions) {
  if (!R_SESSIONS.includes(ss.id)) continue;
  for (const v of ["1PR", "2PR"]) {
    if (ss.papers.some((p: { d: string }) => p.d === `4PH0-${v}`)) continue;
    ss.papers.push({
      d: `4PH0-${v}`,
      qp: R_HAS_QP.has(ss.id) ? 500000 : null,
      ms: 300000,
    });
  }
}
const plannedIdx = idx;

// patch the module cache: rewrite index JSON is too invasive — instead monkey-patch
// corpusPapersForCourse by importing pastpapers-corpus with an env override? Not
// supported; so replicate its logic here from the planned index.
interface Entry { sessionId: string; dir: string; unit: string; variant: string; specKey: string }

function papersFor(map: { specs: string[]; legacySpecs?: string[]; variants?: string[] }, index: typeof idx): Entry[] {
  const out: Entry[] = [];
  for (const specKey of [...map.specs, ...(map.legacySpecs ?? [])]) {
    const sp = index.specs[specKey];
    if (!sp) continue;
    for (const session of sp.sessions) {
      for (const p of session.papers) {
        if (p.qp == null && p.ms == null) continue;
        const cut = p.d.lastIndexOf("-");
        if (cut <= 0) continue;
        const unit = p.d.slice(0, cut), variant = p.d.slice(cut + 1);
        if (map.variants && !map.variants.includes(variant)) continue;
        out.push({ specKey, sessionId: session.id, dir: p.d, unit, variant });
      }
    }
  }
  return out;
}

const IG = "pearson-edexcel/international-gcse";
const CURRENT_MAP = { specs: [`${IG}/science-double-award/4sd0`], variants: ["1P", "1PR"] };
const PLANNED_MAP = {
  specs: [`${IG}/science-double-award/4sd0`],
  legacySpecs: [`${IG}/physics/4ph0`],
  variants: ["1P", "1PR", "2P", "2PR"],
};

for (const [label, map, index] of [
  ["CURRENT (4sd0 only)", CURRENT_MAP, idx],
  ["PLANNED (+4ph0 legacy R rows)", PLANNED_MAP, plannedIdx],
] as const) {
  const papers = papersFor(map, index as typeof idx);
  const { matchKeys, matchedReconKeys } = matchReconstructions(papers as never, recons);
  console.log(`\n== ${label} ==`);
  console.log(`corpus rows=${papers.length} matched corpus rows=${matchKeys.size} matched recons=${matchedReconKeys.size}/${recons.length}`);
  const unmatched = recons.filter((r) => !matchedReconKeys.has(r.key));
  console.log(`still unmatched (${unmatched.length}):`);
  for (const u of unmatched.slice(0, 15)) {
    console.log(`   ${u.date} + ${u.number} (${u.questions.length} q)`);
  }
  if (unmatched.length > 15) console.log(`   … +${unmatched.length - 15} more`);
}

// ── 3. which planned corpus rows serve which recon keys (spot check) ──
const papers2 = papersFor(PLANNED_MAP, plannedIdx);
const { matchKeys } = matchReconstructions(papers2 as never, recons);
const rowsServing = [...matchKeys.entries()].filter(([k]) => k.includes("4ph0"));
console.log(`\n4ph0 legacy rows matched: ${rowsServing.length}`);
for (const [k, v] of rowsServing.slice(0, 40)) console.log(`   ${k} → ${v}`);
