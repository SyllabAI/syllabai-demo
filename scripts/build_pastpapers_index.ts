/**
 * build_pastpapers_index.ts — generate the committed Past Papers index.
 *
 * Source: SyllabAI/syllabai-pastpapers (public, ~4 GB of PDFs — never cloned).
 * The GitHub git-trees API returns the COMPLETE file list in one call, so we
 * walk it and derive the paper inventory from the canonical layout:
 *
 *   past-papers/<board>/<qual>/<subject>/<spec>/
 *     ├── specification.yaml
 *     ├── past-papers/<YYYY-MM>/<PAPER-DIR>/{manifest.yaml,qp.pdf,ms.pdf,...}
 *     └── specimen/<PAPER-DIR>/...
 *
 * The demo app only needs, per paper dir: which materials exist + their byte
 * sizes (load hints + download). Full authoritative metadata lives in each
 * dir's manifest.yaml in the corpus repo — we do NOT duplicate it here; the
 * app surfaces the AI-IDENTIFIED provenance note instead.
 *
 * Output: src/data/pastpapers-index.json (bundled, server-side only).
 * Re-run whenever the corpus grows: bun scripts/build_pastpapers_index.ts
 * (uses GITHUB_TOKEN or scripts/.gh_token if present; unauthenticated works
 * but is rate-limited).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO = "SyllabAI/syllabai-pastpapers";
const OUT = path.join(process.cwd(), "src/data/pastpapers-index.json");
const CACHE = path.join(process.cwd(), "upload/pp_tree.json");

interface TreeResp {
  sha: string;
  truncated?: boolean;
  tree: Array<{ path: string; type: string; size?: number }>;
}

async function fetchTree(): Promise<TreeResp> {
  let token: string | null = null;
  try {
    token = process.env.GITHUB_TOKEN ?? readFileSync("scripts/.gh_token", "utf8").trim();
  } catch {
    token = null;
  }
  const url = `https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`;
  const headers: Record<string, string> = { "User-Agent": "syllabai-demo-index-builder" };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`tree API ${res.status}`);
    const json = (await res.json()) as TreeResp;
    if (json.truncated) throw new Error("tree response truncated — must not build partial index");
    return json;
  } catch (err) {
    if (existsSync(CACHE)) {
      console.warn(`WARN: live fetch failed (${(err as Error).message}); using cached tree ${CACHE}`);
      return JSON.parse(readFileSync(CACHE, "utf8")) as TreeResp;
    }
    throw err;
  }
}

interface IndexPaper {
  /** paper dir name, e.g. "4CH1-1C" */
  d: string;
  /** material byte sizes; canonical names where present */
  qp?: number;
  ms?: number;
  er?: number;
  /** non-canonical pdf extras: [filename, bytes] */
  x?: Array<[string, number]>;
}

interface IndexSession {
  /** "2021-06" | "specimen" */
  id: string;
  papers: IndexPaper[];
}

interface IndexSpec {
  board: string;
  qual: string;
  subject: string;
  spec: string;
  sessions: IndexSession[];
}

function sessionRank(id: string): number {
  if (id === "specimen") return -1;
  const m = id.match(/^(\d{4})-(\d{2})$/);
  return m ? Number(m[1]) * 12 + Number(m[2]) : -2;
}

async function main() {
  const tree = await fetchTree();
  const specs = new Map<string, IndexSpec>();
  let qpCount = 0;
  let msCount = 0;
  let paperDirs = new Set<string>();

  // path regexes for the two layouts we model
  const reSeries =
    /^past-papers\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/past-papers\/([^/]+)\/([^/]+)\/([^/]+)$/;
  const reSpecimen =
    /^past-papers\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/specimen\/([^/]+)\/([^/]+)$/;

  for (const entry of tree.tree) {
    if (entry.type !== "blob" || !entry.path.endsWith(".pdf")) continue;
    const size = entry.size ?? 0;

    let board: string, qual: string, subject: string, spec: string, sessionId: string, dir: string, file: string;
    let m = entry.path.match(reSeries);
    if (m) {
      [, board, qual, subject, spec, sessionId, dir, file] = m;
    } else {
      m = entry.path.match(reSpecimen);
      if (!m) continue;
      [, board, qual, subject, spec, dir, file] = m;
      sessionId = "specimen";
    }

    const key = `${board}/${qual}/${subject}/${spec}`;
    let s = specs.get(key);
    if (!s) {
      s = { board, qual, subject, spec, sessions: [] };
      specs.set(key, s);
    }
    let session = s.sessions.find((x) => x.id === sessionId);
    if (!session) {
      session = { id: sessionId, papers: [] };
      s.sessions.push(session);
    }
    let paper = session.papers.find((p) => p.d === dir);
    if (!paper) {
      paper = { d: dir };
      session.papers.push(paper);
      paperDirs.add(`${key}/${sessionId}/${dir}`);
    }
    if (file === "qp.pdf") {
      paper.qp = size;
      qpCount++;
    } else if (file === "ms.pdf") {
      paper.ms = size;
      msCount++;
    } else if (file === "er.pdf") {
      paper.er = size;
    } else {
      (paper.x ??= []).push([file, size]);
    }
  }

  // sessions newest-first (specimen last); papers alphabetical
  for (const s of specs.values()) {
    s.sessions.sort((a, b) => sessionRank(b.id) - sessionRank(a.id));
    for (const sess of s.sessions) sess.papers.sort((a, b) => a.d.localeCompare(b.d));
  }

  const out = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: REPO,
      treeSha: tree.sha,
      note: "Inventory derived from the corpus git tree; authoritative metadata = per-dir manifest.yaml (AI-IDENTIFIED provenance). Regenerate with bun scripts/build_pastpapers_index.ts.",
    },
    specs: Object.fromEntries([...specs.entries()].sort()),
  };

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));

  const totalPapers = paperDirs.size;
  console.log(
    `index written: ${OUT}\n  specs=${specs.size} paperDirs=${totalPapers} qp=${qpCount} ms=${msCount}\n  bytes=${JSON.stringify(out).length}`,
  );
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
