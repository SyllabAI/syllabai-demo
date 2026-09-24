/** Inventory distinct HTML tags inside bank choice text (informs the safe renderer). */
const BASE = process.argv[2] ?? "https://syllabai-demo.vercel.app";
const LIMIT = 60;
interface Choice { label: string; textMd: string }
interface Q { id: string; marks: number; parts: { choices?: Choice[] }[] }
async function page(offset: number) {
  const p = new URLSearchParams({ slug: "igcse-chemistry-19", limit: String(LIMIT), offset: String(offset) });
  const res = await fetch(`${BASE}/api/teacher/question-bank?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ questions: Q[]; total: number }>;
}
const tagCounts = new Map<string, number>();
let offset = 0, total = Infinity;
while (offset < total) {
  const { questions, total: t } = await page(offset);
  total = t;
  for (const q of questions)
    for (const part of q.parts)
      for (const c of part.choices ?? [])
        for (const m of c.textMd.matchAll(/<\s*(\/?\s*)([a-zA-Z][a-zA-Z0-9]*)/g)) {
          const key = `${m[1] ? "/" : ""}${m[2].toLowerCase()}`;
          tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
        }
  offset += LIMIT;
  if (questions.length === 0) break;
}
console.log(JSON.stringify([...tagCounts.entries()].sort((a, b) => b[1] - a[1])));
