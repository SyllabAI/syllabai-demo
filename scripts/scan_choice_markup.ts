/**
 * Scan the production question bank for markup leakage in choice text.
 * Choice text renders as a plain string (not Markdown) in the paper, so any
 * HTML tags in the corpus choices (e.g. "<sup>o</sup>C") print literally.
 */
const BASE = process.argv[2] ?? "https://syllabai-demo.vercel.app";
const LIMIT = 60;

interface Choice { label: string; textMd: string }
interface Q { id: string; marks: number; parts: { choices?: Choice[] }[] }

async function page(offset: number, subtopics?: string): Promise<{ questions: Q[]; total: number }> {
  const p = new URLSearchParams({ slug: "igcse-chemistry-19", limit: String(LIMIT), offset: String(offset) });
  if (subtopics) p.set("subtopics", subtopics);
  const res = await fetch(`${BASE}/api/teacher/question-bank?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

let offset = 0, total = Infinity, scanned = 0, tagged = 0;
const samples: string[] = [];
const tagRe = /<\s*(\/?\s*)(sup|sub|em|strong|b|i|u|br|span|div|p)\b/i;
while (offset < total) {
  const { questions, total: t } = await page(offset);
  total = t;
  for (const q of questions) {
    scanned++;
    for (const part of q.parts) {
      for (const c of part.choices ?? []) {
        if (tagRe.test(c.textMd)) {
          tagged++;
          if (samples.length < 12) samples.push(`${c.textMd.slice(0, 90)}`);
        }
      }
    }
  }
  offset += LIMIT;
  if (questions.length === 0) break;
}
console.log(JSON.stringify({ scanned, tagged, samples }, null, 2));
