/**
 * Re-enum: dangling relatedNoteIds corpus-wide (recreated after workspace re-sync).
 * Same-package resolution is the contract; we also report global existence.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "/home/z/my-project/content";

const noteIdsByPkg = new Map<string, Set<string>>();
const globalNoteIndex = new Map<string, string[]>();
const noteMeta = new Map<string, { title: string; pkg: string }>();

for (const pkg of fs.readdirSync(ROOT)) {
  const notesPath = path.join(ROOT, pkg, "notes.json");
  if (!fs.existsSync(notesPath)) continue;
  const notes = JSON.parse(fs.readFileSync(notesPath, "utf8")) as Array<{ noteId: string; title?: string }>;
  const ids = new Set<string>();
  for (const n of notes) {
    if (!n.noteId) continue;
    ids.add(n.noteId);
    noteMeta.set(n.noteId, { title: n.title ?? "(untitled)", pkg });
    globalNoteIndex.set(n.noteId, [...(globalNoteIndex.get(n.noteId) ?? []), pkg]);
  }
  noteIdsByPkg.set(pkg, ids);
}

type Hit = {
  pkg: string; qsetId: string; qsetName: string; qsetSlug: string; section?: string;
  rid: string; existsIn: string[]; resolvedTitle?: string;
};
const hits: Hit[] = [];
let totalRefs = 0;

for (const pkg of fs.readdirSync(ROOT)) {
  const qPath = path.join(ROOT, pkg, "questions.json");
  if (!fs.existsSync(qPath)) continue;
  const qs = JSON.parse(fs.readFileSync(qPath, "utf8")) as Array<{
    topicId?: string; name?: string; slug?: string; section?: string; relatedNoteIds?: string[];
  }>;
  const localIds = noteIdsByPkg.get(pkg) ?? new Set<string>();
  for (const s of qs) {
    for (const rid of s.relatedNoteIds ?? []) {
      totalRefs++;
      if (localIds.has(rid)) continue;
      hits.push({
        pkg, qsetId: s.topicId ?? "?", qsetName: s.name ?? "?", qsetSlug: s.slug ?? "?",
        section: s.section, rid,
        existsIn: globalNoteIndex.get(rid) ?? [],
        resolvedTitle: noteMeta.get(rid)?.title,
      });
    }
  }
}

console.log(`Total relatedNoteIds referenced: ${totalRefs}`);
console.log(`Dangling: ${hits.length}\n`);
for (const h of hits) {
  console.log(
    `${h.pkg} :: "${h.qsetName}" (${h.qsetSlug}) → ${h.rid}` +
      (h.existsIn.length ? `  [GLOBAL: ${h.existsIn.join(",")} as "${h.resolvedTitle}"]` : "  [nowhere]"),
  );
}
fs.mkdirSync("/home/z/my-project/work", { recursive: true });
fs.writeFileSync("/home/z/my-project/work/dangling_related_notes_23c.json", JSON.stringify(hits, null, 2));
