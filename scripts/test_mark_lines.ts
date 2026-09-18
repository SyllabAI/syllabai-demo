/** Quick sanity checks for splitMarkLines (bun). */
import { splitMarkLines } from "../src/components/part-problem";

const cases: { name: string; md: string; expect: string }[] = [
  {
    name: "orphan [2] becomes marks segment",
    md: "(i) Give **two other** types of optical storage device.\n[2]",
    expect: "md|marks",
  },
  {
    name: "orphan (1 mark)",
    md: "State what is meant by momentum.\n(1 mark)",
    expect: "md|marks",
  },
  {
    name: "inline trailing tag untouched",
    md: "The car accelerates from rest; [2] shows the speed.",
    expect: "md",
  },
  {
    name: "table row untouched",
    md: "| a | [2] |\n|---|---|",
    expect: "md",
  },
  {
    name: "fenced line untouched",
    md: "```\n[2]\n```",
    expect: "md",
  },
  {
    name: "bold-wrapped **[2 marks]**",
    md: "Explain.\n**[2 marks]**",
    expect: "md|marks",
  },
];

let fail = 0;
for (const c of cases) {
  const segs = splitMarkLines(c.md);
  const got = segs.map((s) => s.kind).join("|");
  const marksTotal = segs.filter((s) => s.kind === "marks").map((s) => (s as any).count);
  const ok = got === c.expect;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${c.name} → [${got}]${marksTotal.length ? " counts=" + marksTotal : ""}`);
}
// expected counts
const segs = splitMarkLines("(i) Give two.\n[2]\nExplain.\n**[3 marks]**");
const counts = segs.filter((s) => s.kind === "marks").map((s) => (s as any).count);
const countsOk = counts.join(",") === "2,3";
if (!countsOk) fail++;
console.log(`${countsOk ? "PASS" : "FAIL"} counts extracted → ${counts}`);
process.exit(fail ? 1 : 0);
