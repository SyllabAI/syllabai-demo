/** Debug: dump reconstruction (date, number) pairs for a course vs corpus refs. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const slug = process.argv[2] ?? "igcse-chemistry-19";
const dir = path.join(process.cwd(), "content", slug);
const questions = JSON.parse(readFileSync(path.join(dir, "questions.json"), "utf8")) as {
  questions?: Array<{
    parts?: Array<{ sourcePaper?: { date?: string; number?: string } }>;
  }>;
};

const seen = new Map<string, number>();
for (const q of questions.questions ?? []) {
  for (const p of q.parts ?? []) {
    const sp = p.sourcePaper;
    if (sp?.date || sp?.number) {
      const key = `${sp.date} | ${sp.number}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
}
console.log("date | number  (count)");
for (const [k, n] of [...seen.entries()].sort().slice(0, 30)) console.log(`${k}  (${n})`);
