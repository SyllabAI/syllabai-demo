/**
 * Baseline/post harness for the physics date-spelling normalization.
 *
 * Captures, per question part: the real parseReconstruction(date, number)
 * output (src/lib/pastpapers-reconstruction.ts) plus the raw date/number, and
 * the collectPastPapers grouping key (slugify(date)-slugify(number)) so we can
 * diff before vs after and PROVE only the intended parts changed.
 *
 * Usage: bun scripts/verify_physics_date_norm.ts <path-to-questions.json>
 * Output: section "PARSE" (minified JSON, partId → parse) + "GROUP" (recon
 * keys with part counts) + "SUMMARY" line.
 */
import { parseReconstruction } from "../src/lib/pastpapers-reconstruction";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface PartLike {
  id: string;
  sourcePaper?: { date?: string | null; number?: string | null } | null;
}
interface QLike {
  id: string;
  parts: PartLike[];
}
interface BlockLike {
  slug: string;
  questions: QLike[];
}

const file = process.argv[2];
if (!file) throw new Error("usage: verify_physics_date_norm.ts <questions.json>");
const blocks: BlockLike[] = JSON.parse(await Bun.file(file).text());

const parse: Record<string, unknown> = {};
const groups = new Map<string, { date: string; number: string; parts: number; questions: Set<string> }>();

for (const block of blocks) {
  for (const q of block.questions) {
    for (const p of q.parts) {
      const sp = p.sourcePaper;
      if (!sp || (!sp.date && !sp.number)) continue;
      const date = sp.date ?? "";
      const number = sp.number ?? "";
      const parsed = parseReconstruction(date, number);
      parse[p.id] = parsed
        ? { date, number, sessionIds: parsed.sessionIds, unit: parsed.unit, variant: parsed.variant }
        : { date, number, sessionIds: null, unit: null, variant: null };
      // collectPastPapers groups by the FIRST part with provenance on the question
      const first = q.parts.find((x) => x.sourcePaper && (x.sourcePaper.date || x.sourcePaper.number));
      if (first && first.id === p.id) {
        const key = `${slugify(first.sourcePaper!.date ?? "")}-${slugify(first.sourcePaper!.number ?? "")}`;
        let g = groups.get(key);
        if (!g) {
          g = { date: first.sourcePaper!.date ?? "", number: first.sourcePaper!.number ?? "", parts: 0, questions: new Set() };
          groups.set(key, g);
        }
        g.parts++;
        g.questions.add(q.id);
      }
    }
  }
}

console.log("PARSE");
console.log(JSON.stringify(parse));
console.log("GROUP");
for (const [key, g] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`${key}\tparts=${g.parts}\tquestions=${g.questions.size}\tdate=${JSON.stringify(g.date)}\tnumber=${JSON.stringify(g.number)}`);
}
console.log(`SUMMARY\treconRows=${groups.size}`);
