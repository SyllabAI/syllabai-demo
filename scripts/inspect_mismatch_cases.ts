/**
 * Inspect mark-mismatch cases between SME reconstructions and official QPs:
 *   - Nov 2020 1C Q5, Nov 2020 2C Q2, Jan 2021 1C Q3 (igcse-chemistry-19)
 * plus the "Ju1c" vs "Ju1C" case-collision shape.
 * Prints each corpus entry tagged with the qn, its marks and part structure,
 * so reconciliation (dedupe vs data edit) can be decided on evidence.
 */
const banks = require("../content/igcse-chemistry-19/questions.json");

const CASES = [
  { date: "2020", num: "Nov1C", qn: 5 },
  { date: "2020", num: "Nov2C", qn: 2 },
  { date: "2021", num: "Ja1C", qn: 3 },
];

for (const c of CASES) {
  console.log(`\n=== ${c.date} ${c.num} Q${c.qn} ===`);
  for (const b of banks) {
    for (const q of b.questions ?? []) {
      for (const p of q.parts ?? []) {
        const sp = p.sourcePaper;
        if (!sp || sp.date !== c.date || sp.number !== c.num || sp.questionNumber !== c.qn) continue;
        const partMarks = (q.parts ?? []).map((pp) => pp.marks ?? 0);
        const partSum = partMarks.reduce((a, x) => a + x, 0);
        console.log(`  ${q.id} · totalMarks=${q.totalMarks} · partsSum=${partSum} · ${q.parts.length} parts [${partMarks.join(",")}]`);
        console.log(`    prompt: ${String(q.prompt ?? q.text ?? "").slice(0, 110).replace(/\s+/g, " ")}`);
        break;
      }
    }
  }
}

// full paper listings for the three sessions (held entries per qn)
console.log("\n=== full held listings ===");
for (const num of ["Nov1C", "Nov2C", "Ja1C"]) {
  const rows = new Map();
  for (const b of banks) {
    for (const q of b.questions ?? []) {
      for (const p of q.parts ?? []) {
        const sp = p.sourcePaper;
        if (!sp || sp.date !== "2020" && sp.date !== "2021" || sp.number !== num) continue;
        const qn = sp.questionNumber;
        if (!rows.has(qn)) rows.set(qn, []);
        rows.get(qn).push(q.totalMarks);
        break;
      }
    }
  }
  const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]);
  console.log(`${num}: ${sorted.map(([qn, ms]) => `Q${qn}(${ms.join("/")})`).join("  ")}`);
}

// case-collision: Ju1c vs Ju1C in 2019
console.log("\n=== 2019 Ju1c vs Ju1C case-collision ===");
for (const b of banks) {
  for (const q of b.questions ?? []) {
    for (const p of q.parts ?? []) {
      const sp = p.sourcePaper;
      if (!sp || sp.date !== "2019" || !/ju1c/i.test(sp.number ?? "")) continue;
      const partMarks = (q.parts ?? []).map((pp) => pp.marks ?? 0);
      console.log(
        `  ${q.id} · number="${sp.number}" qn=${sp.questionNumber} · totalMarks=${q.totalMarks} parts[${partMarks.join(",")}] · ${String(q.prompt ?? "").slice(0, 80).replace(/\s+/g, " ")}`,
      );
      break;
    }
  }
}
