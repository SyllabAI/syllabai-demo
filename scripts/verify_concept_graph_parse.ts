/**
 * Parse concept-graph.json through the app's real Zod contract to prove the
 * retargeted edges are schema-safe before deploy.
 * Run: bun scripts/verify_concept_graph_parse.ts
 */
import { readFileSync } from "node:fs";
import { ConceptGraph } from "../src/lib/contracts";

const raw = readFileSync("content/igcse-chemistry-19/concept-graph.json", "utf-8");
const parsed = ConceptGraph.safeParse(JSON.parse(raw));
if (!parsed.success) {
  console.error("ZOD PARSE FAILED:", parsed.error.issues.slice(0, 5));
  process.exit(1);
}
const g = parsed.data;
const prLeftover = g.edges.filter((e) => /-PR-\d/.test(e.source + e.target));
const retargeted = g.edges.filter((e) =>
  ["4CH1-1.7C", "4CH1-1.13", "4CH1-1.36", "4CH1-1.60C", "4CH1-3.8", "4CH1-3.15", "4CH1-3.16"].includes(
    e.source,
  ),
);
console.log("zod parse: OK");
console.log("nodes:", g.nodes.length, "edges:", g.edges.length);
console.log("PR leftovers:", prLeftover.length);
console.log("retargeted prerequisite edges (7 spec codes):", retargeted.length);
console.log(
  "relations:",
  [...new Set(retargeted.map((e) => e.relation))].join(", "),
);
process.exit(prLeftover.length === 0 && retargeted.length === 12 ? 0 : 1);
