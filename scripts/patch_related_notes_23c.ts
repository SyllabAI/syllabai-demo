/**
 * T-SME-23c — proper re-link of dangling relatedNoteIds.
 *
 * Formula per affected qset:
 *   new = [notes on SME's live "More Revision Notes you might like" widget,
 *          in page order, URL-matched to local notes]
 *       + [legacy refs that still resolve locally, not already included,
 *          in original order]
 * → drops exactly the 16 dangling refs (15 dead + 1 cross-package),
 *   keeps every previously-valid link, adds nothing fabricated.
 *
 * SME hub/overview pages (plot-summary/themes/characters) and /flashcards/
 * links are excluded: hubs are navigation pages (not in the notes corpus),
 * flashcards are a different resource type.
 */
import fs from "node:fs";

const CONTENT = "/home/z/my-project/content";
const DIR = "/home/z/my-project/work/relink_23c";

type Qset = { topicId?: string; slug?: string; relatedNoteIds?: string[]; [k: string]: unknown };

const TARGETS = [
  { pkg: "igcse-english-literature-16", slug: "macbeth--exam-questions", html: `${DIR}/lit-macbeth.1.html` },
  { pkg: "igcse-english-literature-16", slug: "romeo-and-juliet--exam-questions", html: `${DIR}/lit-romeo.1.html` },
  { pkg: "igcse-english-literature-16", slug: "an-inspector-calls---exam-questions", html: `${DIR}/lit-inspector.1.html` },
  { pkg: "igcse-maths-a-modular-24-foundation-unit-1", slug: "linear-equations--exam-questions", html: `${DIR}/math-lin.1.html` },
  { pkg: "igcse-economics-17", slug: "business-costs-revenues-and-profit--exam-questions", html: `${DIR}/econ-costs.1.html` },
];

function normUrl(raw: string): string {
  const m = raw.match(/^https?:\/\/[^/]+(\/[^?#]*)?/);
  const path = m ? m[1] ?? "/" : raw;
  return `https://www.savemyexams.com${path.replace(/\/+$/, "")}`;
}

function widgetNoteUrls(html: string): string[] {
  const urls: string[] = [];
  const anchorRe = /<a\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    if (!m[1].includes("RelatedResources_linkButton")) continue;
    const hm = m[1].match(/href="([^"]+)"/);
    if (!hm) continue;
    // notes only — skip flashcards
    if (hm[1].includes("/flashcards/")) continue;
    urls.push(normUrl(hm[1]));
  }
  return urls;
}

const notesUrlIndex = new Map<string, Map<string, { id: string; title: string }>>();
function noteIndex(pkg: string) {
  if (!notesUrlIndex.has(pkg)) {
    const notes = JSON.parse(fs.readFileSync(`${CONTENT}/${pkg}/notes.json`, "utf8")) as
      Array<{ noteId: string; title: string; sourceUrl: string }>;
    const m = new Map<string, { id: string; title: string }>();
    for (const n of notes) m.set(normUrl(n.sourceUrl), { id: n.noteId, title: n.title });
    notesUrlIndex.set(pkg, m);
  }
  return notesUrlIndex.get(pkg)!;
}

const report: Array<Record<string, unknown>> = [];
let danglingBefore = 0;
let danglingAfter = 0;

for (const t of TARGETS) {
  const qPath = `${CONTENT}/${t.pkg}/questions.json`;
  const qsets = JSON.parse(fs.readFileSync(qPath, "utf8")) as Qset[];
  const qset = qsets.find((s) => s.slug === t.slug);
  if (!qset) throw new Error(`qset not found: ${t.pkg} ${t.slug}`);

  const notes = JSON.parse(fs.readFileSync(`${CONTENT}/${t.pkg}/notes.json`, "utf8")) as
    Array<{ noteId: string; title: string }>;
  const localIds = new Set(notes.map((n) => n.noteId));

  const old = [...(qset.relatedNoteIds ?? [])];
  const oldDead = old.filter((r) => !localIds.has(r));
  danglingBefore += oldDead.length;

  const idx = noteIndex(t.pkg);
  const widgetUrls = widgetNoteUrls(fs.readFileSync(t.html, "utf8"));
  const fresh: string[] = [];
  const unmatchedWidget: string[] = [];
  for (const u of widgetUrls) {
    const hit = idx.get(u);
    if (!hit) {
      unmatchedWidget.push(u);
      continue;
    }
    if (!fresh.includes(hit.id)) fresh.push(hit.id);
  }

  const legacy = old.filter((r) => localIds.has(r) && !fresh.includes(r));
  const next = [...fresh, ...legacy];
  danglingAfter += next.filter((r) => !localIds.has(r)).length;

  qset.relatedNoteIds = next;

  fs.writeFileSync(qPath, JSON.stringify(qsets)); // compact, matches prior patcher output

  console.log(`── ${t.pkg} :: ${t.slug}`);
  console.log(`   before: ${old.length} refs (${oldDead.length} dangling)`);
  console.log(`   widget notes: ${fresh.length} matched, ${unmatchedWidget.length} unmatched (hubs) — widget order kept`);
  console.log(`   legacy kept (valid, off-widget): ${legacy.length}`);
  console.log(`   after: ${next.length} refs, ${next.filter((r) => !localIds.has(r)).length} dangling`);
  if (oldDead.length) console.log(`   removed dangling: ${oldDead.join(", ")}`);
  console.log("");

  report.push({
    pkg: t.pkg, slug: t.slug,
    before: old, removedDangling: oldDead,
    widgetOrder: fresh, unmatchedWidgetHubs: unmatchedWidget, legacyKept: legacy, after: next,
  });
}

fs.writeFileSync(`${DIR}/relink_report.json`, JSON.stringify(report, null, 2));
console.log(`TOTAL dangling before: ${danglingBefore} | after: ${danglingAfter}`);
if (danglingAfter !== 0) {
  console.error("FAIL: dangling refs remain");
  process.exit(1);
}
console.log("OK — all relatedNoteIds now resolve within their packages.");
