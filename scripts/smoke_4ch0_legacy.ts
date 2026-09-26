/** Smoke test: igcse-chemistry-19 archive must now include badged 4CH0 rows. */
import { corpusPapersForCourse } from "../src/lib/pastpapers-corpus";

const papers = corpusPapersForCourse("igcse-chemistry-19");
const legacy = papers.filter((p) => p.unit === "4CH0");
const current = papers.filter((p) => p.unit === "4CH1");

console.log(`total=${papers.length} current(4CH1)=${current.length} legacy(4CH0)=${legacy.length}`);
console.log("first 3 (newest):", papers.slice(0, 3).map((p) => `${p.sessionId} ${p.ref}${p.specBadge ? " [" + p.specBadge + "]" : ""}`));
console.log("legacy sample:", legacy.slice(0, 4).map((p) => `${p.sessionId} ${p.ref} ${p.specBadge} qp=${p.qpBytes ? "Y" : "N"} ms=${p.msBytes ? "Y" : "N"} dur=${p.durationMin}`));
console.log("legacy last (oldest):", legacy.slice(-2).map((p) => `${p.sessionId} ${p.ref} ${p.specBadge}`));

const sessions = new Set(papers.map((p) => p.sessionId));
console.log("sessions:", sessions.size, "chronological order ok:", papers.every((p, i, a) => i === 0 || sessionRank(a[i - 1].sessionId) >= sessionRank(p.sessionId)));

function sessionRank(id: string): number {
  if (id === "specimen") return -1;
  const m = id.match(/^(\d{4})-(\d{2})$/);
  return m ? Number(m[1]) * 12 + Number(m[2]) : -2;
}

const bad = legacy.filter((p) => p.specBadge !== "Legacy spec");
console.log("legacy rows missing badge:", bad.length);
const cur = current.filter((p) => p.specBadge !== null);
console.log("current rows wrongly badged:", cur.length);
