#!/usr/bin/env python3
"""
syllabai-demo content importer.

Downloads a curated, provenance-preserving subset of the real SyllabAI corpora
from GitHub (syllabai-resources) and emits versioned JSON bundles the demo app
commits under content/. The demo is hermetic at runtime (no GitHub dependency).

Everything emitted keeps its canonical identity:
  - spec point codes (4CH1-x.y format), note ids (rn_*), question ids (qstn_*)
  - validation/provenance tiers (RULE_DERIVED, AI_SUGGESTED, HUMAN_VALIDATED)
  - source URLs + license references

Bundles written:
  content/igcse-chemistry/manifest.json        corpus manifest + provenance
  content/igcse-chemistry/curriculum.json      spec-point skeleton (topics/subtopics/SPs)
  content/igcse-chemistry/concept-graph.json   T-C11 concepts + misconceptions + edges
  content/igcse-chemistry/notes.json           selected revision notes (md + spec map)
  content/igcse-chemistry/questions.json       selected exam question sets (parts + solutions)
  content/igcse-chemistry/flashcards.json      DEMO_DERIVED flashcards from notes
  content/igcse-chemistry/learner-sim.json     SIMULATED learner overlay (never canonical)
  public/content-assets/<hash>.<ext>           bounded image assets with rewritten refs
"""
import hashlib
import json
import os
import re
import urllib.request

RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main"
API = "https://api.github.com"
OUT = "/home/z/my-project/content/igcse-chemistry"
PUB = "/home/z/my-project/public/content-assets"
RECON = "/home/z/my-project/scripts/recon"

os.makedirs(OUT, exist_ok=True)
os.makedirs(PUB, exist_ok=True)

HEADERS = {"User-Agent": "syllabai-demo-importer"}
TOKEN = open("/home/z/my-project/scripts/.gh_token").read().strip()
AUTH_HEADERS = {"User-Agent": "syllabai-demo-importer", "Authorization": f"Bearer {TOKEN}"}


def fetch(repo_path: str) -> str:
    url = f"{RAW}/{urllib.request.quote(repo_path)}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", errors="replace")


def fetch_json(repo_path: str):
    return json.loads(fetch(repo_path))


def fetch_bytes(repo_path: str) -> bytes:
    url = f"{RAW}/{urllib.request.quote(repo_path)}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


# ── graph-as-code sources ────────────────────────────────────────────
import yaml  # noqa: E402

print("fetching graph-as-code ...")
relationships = yaml.safe_load(fetch("graph/relationships.yaml"))
concepts_doc = yaml.safe_load(fetch("graph/concepts.yaml"))
edges_doc = yaml.safe_load(fetch("graph/concept_edges.yaml"))

# ── curriculum skeleton from topics.yaml + specification_points.yaml + relationships.yaml ──
print("fetching curriculum skeleton (topics + spec points) ...")
topics_doc = yaml.safe_load(fetch("graph/topics.yaml"))
sps_doc = yaml.safe_load(fetch("graph/specification_points.yaml"))

nodes_out = []
edges_out = []
SUBJECT_CODE = "4CH1"
nodes_out.append({
    "code": SUBJECT_CODE, "family": "SUBJECT", "title": "Chemistry (International GCSE)",
    "description": "Pearson Edexcel International GCSE Chemistry — operator-governed spec skeleton",
    "parents": [], "provenanceTier": "RULE_DERIVED",
})
for t in topics_doc.get("topics", []):
    nodes_out.append({
        "code": t["code"], "family": "TOPIC", "title": t.get("title") or t.get("title_md") or t["code"],
        "description": None, "parents": [SUBJECT_CODE],
        "provenanceTier": (t.get("provenance") or {}).get("tier", "RULE_DERIVED"),
    })
    edges_out.append({"source": SUBJECT_CODE, "relation": "PART_OF", "target": t["code"], "provenanceTier": "RULE_DERIVED"})
for st in topics_doc.get("subtopics", []):
    parent = st.get("parent") or st.get("parents", [None])[0]
    nodes_out.append({
        "code": st["code"], "family": "SUBTOPIC",
        "title": st.get("title") or st.get("title_md") or st["code"],
        "description": None, "parents": [parent] if parent else [],
        "provenanceTier": (st.get("provenance") or {}).get("tier", "RULE_DERIVED"),
    })
    if parent:
        edges_out.append({"source": parent, "relation": "PART_OF", "target": st["code"], "provenanceTier": "RULE_DERIVED"})
for sp in sps_doc.get("specification_points", []):
    parents = [p for p in [sp.get("section"), sp.get("subsection")] if p]
    nodes_out.append({
        "code": sp["code"], "family": "SPEC_POINT",
        "title": sp.get("official_wording") or sp["code"],
        "description": None, "parents": parents,
        "provenanceTier": (sp.get("provenance") or {}).get("tier", "RULE_DERIVED"),
    })
    for p in parents:
        edges_out.append({"source": p, "relation": "PART_OF", "target": sp["code"], "provenanceTier": "RULE_DERIVED"})

rel_edges = relationships.get("edges", [])
for e in rel_edges:
    src, tgt, rel = e.get("source"), e.get("target"), e.get("relation")
    if not src or not tgt:
        continue  # skip malformed upstream records — fail-visible in manifest counts
    edges_out.append({
        "source": src, "relation": rel or "RELATED_TO", "target": tgt,
        "provenanceTier": (e.get("provenance") or {}).get("tier", "RULE_DERIVED"),
    })

# ── T-C11 concepts + misconceptions + semantic edges ─────────────────
c11_nodes = []
def norm_sp(v):
    """spec-point entries may be plain codes or {code: ...} records — normalize."""
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        return v.get("code") or v.get("id") or None
    return None

for n in concepts_doc.get("nodes", []):
    sps = [s for s in (norm_sp(v) for v in (n.get("spec_points") or n.get("specPoints") or [])) if s]
    c11_nodes.append({
        "code": n.get("code"),
        "family": n.get("family"),
        "title": n.get("title"),
        "aliases": [a for a in (n.get("aliases") or []) if isinstance(a, str)],
        "summary": n.get("summary") or n.get("definition") or None,
        "specPoints": sps,
        "provenanceTier": (n.get("provenance") or {}).get("tier", "AI_SUGGESTED"),
        "extractionPass": (n.get("provenance") or {}).get("extraction_pass"),
    })
c11_edges = []
for e in edges_doc.get("edges", []):
    src, tgt = e.get("source"), e.get("target")
    if not src or not tgt:
        continue  # skip malformed upstream records
    ev = e.get("evidence") or []
    first_quote = None
    for item in ev:
        if isinstance(item, dict) and item.get("quote"):
            first_quote = item["quote"]
            break
    c11_edges.append({
        "source": src, "relation": e.get("relation") or "RELATED_TO", "target": tgt,
        "role": e.get("role"),
        "evidenceQuote": first_quote,
        "provenanceTier": (e.get("provenance") or {}).get("tier", "AI_SUGGESTED"),
        "extractionPass": (e.get("provenance") or {}).get("extraction_pass"),
        "derivationMethod": (e.get("provenance") or {}).get("derivation_method"),
    })

concept_graph = {
    "curriculumCode": "4CH1-2017",
    "edgeVocabulary": concepts_doc.get("meta", {}).get("edge_vocabulary"),
    "counts": concepts_doc.get("meta", {}).get("counts"),
    "validationGate": concepts_doc.get("meta", {}).get("validation_gate"),
    "nodes": c11_nodes,
    "edges": c11_edges,
}

curriculum = {
    "board": "Pearson Edexcel", "level": "International GCSE", "subject": "Chemistry",
    "code": "4CH1", "syllabusVersion": "2017 (Issue 3)",
    "nodes": nodes_out, "edges": edges_out,
}

# ── revision notes selection ─────────────────────────────────────────
NOTES = [
    # (repo path, relative display order key)
    "SME-RevisionNotes/igcse-chemistry-19/notes/1-principles-of-chemistry/1-1-states-of-matter/1-1-1-the-three-states-of-matter.md",
    "SME-RevisionNotes/igcse-chemistry-19/notes/1-principles-of-chemistry/1-1-states-of-matter/1-1-2-diffusion--dilution.md",
    "SME-RevisionNotes/igcse-chemistry-19/notes/1-principles-of-chemistry/1-2-elements-compounds-and-mixtures/1-2-1-element-compound-or-mixture.md",
    "SME-RevisionNotes/igcse-chemistry-19/notes/1-principles-of-chemistry/1-2-elements-compounds-and-mixtures/1-2-3-separation-techniques.md",
    "SME-RevisionNotes/igcse-chemistry-19/notes/1-principles-of-chemistry/1-3-atomic-structure/1-3-1-atoms-definitions-and-structure.md",
    "SME-RevisionNotes/igcse-chemistry-19/notes/1-principles-of-chemistry/1-4-the-periodic-table/1-4-1-periodic-table-basics.md",
    "SME-RevisionNotes/igcse-chemistry-19/notes/1-principles-of-chemistry/1-4-the-periodic-table/1-4-2-electronic-configurations.md",
    "SME-RevisionNotes/igcse-chemistry-19/notes/1-principles-of-chemistry/1-5-chemical-formulae-equations-calculations/1-5-1-word-and-chemical-equations.md",
    "SME-RevisionNotes/igcse-chemistry-19/notes/1-principles-of-chemistry/1-5-chemical-formulae-equations-calculations/1-5-3-moles-mass-and-rfm.md",
    "SME-RevisionNotes/igcse-chemistry-19/notes/1-principles-of-chemistry/1-6-ionic-bonding/1-6-1-ionic-bonding.md",
]
# fallback if 1-6-1 path differs: discover from tree
tree_paths = open(f"{RECON}/resources_tree.txt").read().splitlines()
def resolve(p):
    if p in tree_paths:
        return p
    hits = [t for t in tree_paths if p.rsplit("/", 1)[-1] == t.rsplit("/", 1)[-1] and t.startswith("SME-RevisionNotes/")]
    return hits[0] if hits else None

FRONT_RE = re.compile(r"^---\n(.*?)\n---\n", re.S)
img_re = re.compile(r"!\[([^\]]*)\]\((assets/[^)]+)\)")

downloaded = {}
def get_asset(note_dir: str, asset_rel: str) -> str | None:
    """Locate + download a note asset; returns public url path or None."""
    candidates = [
        f"{note_dir}/{asset_rel}",
        f"Chemistry IGCSE Revision Notes/{asset_rel}",
        f"Chemistry IGCSE Revision Notes/assets/{os.path.basename(asset_rel)}",
        f"SME-RevisionNotes/igcse-chemistry-19/{asset_rel}",
        f"SME-RevisionNotes/igcse-chemistry-19/notes/{asset_rel}",
        f"SME-RevisionNotes/igcse-chemistry-19/assets/{os.path.basename(asset_rel)}",
    ]
    note_dir_root = note_dir.split("/notes/")[0]
    candidates.append(f"{note_dir_root}/{asset_rel}")
    candidates.append(f"{note_dir_root}/assets/{os.path.basename(asset_rel)}")
    for cand in candidates:
        if cand in downloaded:
            return downloaded[cand]
        if cand in tree_paths or f"Chemistry IGCSE Revision Notes/assets/{os.path.basename(asset_rel)}" == cand:
            try:
                data = fetch_bytes(cand)
            except Exception:
                continue
            if len(data) > 900_000:
                continue
            ext = os.path.splitext(cand)[1] or ".png"
            h = hashlib.sha1(cand.encode()).hexdigest()[:16]
            pub_name = f"{h}{ext}"
            with open(f"{PUB}/{pub_name}", "wb") as f:
                f.write(data)
            url = f"/content-assets/{pub_name}"
            downloaded[cand] = url
            return url
    return None

notes_out = []
total_assets = 0
MAX_ASSETS = 18
for path in NOTES:
    real = resolve(path)
    if not real:
        print(f"  !! note not found: {path}")
        continue
    md = fetch(real)
    m = FRONT_RE.match(md)
    fm = yaml.safe_load(m.group(1)) if m else {}
    body = md[m.end():] if m else md
    note_dir = os.path.dirname(real)
    def rewrite(match):
        global total_assets
        alt, rel = match.group(1), match.group(2)
        if total_assets >= MAX_ASSETS:
            return f"*[{alt or 'diagram'} — image omitted in demo bundle]*"
        url = get_asset(note_dir, rel)
        if url:
            total_assets += 1
            return f"![{alt}]({url})"
        return f"*[{alt or 'diagram'} — asset unavailable]*"
    body = img_re.sub(rewrite, body)
    notes_out.append({
        "noteId": fm.get("note_id"),
        "title": fm.get("title"),
        "sourceUrl": fm.get("source"),
        "specPointIds": fm.get("spec_point_ids") or [],
        "specPointCodes": fm.get("spec_point_codes") or [],
        "guidedStudy": bool(fm.get("guided_study")),
        "path": fm.get("path"),
        "updatedAt": str(fm.get("updated_at")),
        "bodyMd": body.strip(),
    })
    print(f"  note: {fm.get('note_id')} {fm.get('title')}")

# ── exam questions selection ─────────────────────────────────────────
QUESTION_TOPICS = [
    "SME-ExamQuestion/igcse-chemistry-19/1-principles-of-chemistry/1-1-states-of-matter",
    "SME-ExamQuestion/igcse-chemistry-19/1-principles-of-chemistry/1-3-atomic-structure",
    "SME-ExamQuestion/igcse-chemistry-19/1-principles-of-chemistry/1-4-the-periodic-table",
]
ASSET_RE = re.compile(r"!\[[^\]]*\]\((assets/[^)]+)\)")
q_topics_out = []
q_assets = 0
for topic_path in QUESTION_TOPICS:
    tj = fetch_json(f"{topic_path}/topic.json")
    parts_assets = []
    # download a bounded number of question assets
    for q in tj.get("questions", []):
        for prt in q.get("parts", []):
            text = (prt.get("problem_md") or "") + (prt.get("solution_md") or "")
            for rel in ASSET_RE.findall(text):
                if q_assets >= 12:
                    continue
                url = get_asset(topic_path, rel)
                if url:
                    q_assets += 1
                    parts_assets.append({"topic": tj["topic"]["slug"], "asset": rel, "url": url})
    def fix_urls(md):
        if not md:
            return md
        for a in parts_assets:
            md = md.replace(a["asset"], a["url"])
        md = ASSET_RE.sub(lambda m: f"*[{(m.group(1).split('/')[-1])[:40]} — asset omitted]*", md)
        return md
    questions = []
    for q in tj.get("questions", []):
        questions.append({
            "id": q.get("id"), "order": q.get("order"), "difficulty": q.get("difficulty"),
            "style": q.get("style"), "totalMarks": q.get("total_marks"),
            "parts": [{
                "id": p.get("id"), "order": p.get("order"), "questionType": p.get("question_type"),
                "marks": p.get("marks"), "commandWord": p.get("command_word"),
                "specPointIds": p.get("spec_point_ids") or [],
                "specPointCodes": p.get("spec_point_codes") or [],
                "problemMd": fix_urls(p.get("problem_md")),
                "solutionMd": fix_urls(p.get("solution_md")),
            } for p in q.get("parts", [])],
        })
    q_topics_out.append({
        "topicId": tj["topic"]["id"], "slug": tj["topic"]["slug"], "name": tj["topic"]["name"],
        "section": tj["section"]["name"], "sectionSlug": tj["section"]["slug"],
        "curriculum": {
            "board": tj["curriculum"]["board"], "level": tj["curriculum"]["level"],
            "subject": tj["curriculum"]["subject"], "code": tj["curriculum"]["code"],
            "syllabusVersion": tj["curriculum"]["syllabus_version"],
        },
        "source": {"provider": tj["source"]["provider"], "license": tj["source"]["license"],
                   "pageUrl": tj["source"].get("page_url")},
        "schema": tj.get("schema"),
        "relatedRevisionNotesFolder": tj.get("related_revision_notes_folder"),
        "questions": questions,
    })
    print(f"  questions: {tj['topic']['name']} ({len(questions)})")

# ── flashcards: DEMO_DERIVED from notes' spec-point blockquotes ──────
flash_out = []
for n in notes_out:
    if not n["bodyMd"]:
        continue
    # spec point callouts: "> **Spec point** — `code` · <text>"
    for m in re.finditer(r"Spec point\*?\*?\s*[—-]\s*`([^`]+)`\s*·\s*(.+)", n["bodyMd"]):
        code, text = m.group(1).strip(), m.group(2).strip().rstrip()
        flash_out.append({
            "id": f"fc_{hashlib.sha1((n['noteId'] + code).encode()).hexdigest()[:12]}",
            "specPointCode": code, "specPointId": None,
            "front": f"Which specification point covers: {text[:140]}{'…' if len(text) > 140 else ''}",
            "back": f"**{code}** — {text}",
            "sourceNoteId": n["noteId"],
            "sourceTitle": n["title"],
            "provenanceTier": "DEMO_DERIVED",
        })
    # definition-style headings → Q/A
    for m in re.finditer(r"^####?\s+(?:Summary of the |What are |Define )?([A-Z][^\n]{8,90})$", n["bodyMd"], re.M):
        title = m.group(1).strip()
        chunk = n["bodyMd"][m.end():m.end() + 700]
        bullet = re.search(r"^- (.+)$", chunk, re.M)
        if bullet:
            flash_out.append({
                "id": f"fc_{hashlib.sha1((n['noteId'] + title).encode()).hexdigest()[:12]}",
                "specPointCode": (n["specPointCodes"] or [None])[0],
                "specPointId": None,
                "front": f"{title}?",
                "back": bullet.group(1).strip()[:400],
                "sourceNoteId": n["noteId"],
                "sourceTitle": n["title"],
                "provenanceTier": "DEMO_DERIVED",
            })

# dedupe
seen = set()
flash_out = [f for f in flash_out if not (f["id"] in seen or seen.add(f["id"]))]

# ── SIMULATED learner overlay (deterministic, clearly non-canonical) ─
import random  # noqa: E402
rng = random.Random(42)
sp_codes = sorted({sp for n in notes_out for sp in (n["specPointCodes"] or [])})
skill_states = []
for i, code in enumerate(sp_codes):
    mastery = round(rng.uniform(0.05, 0.92), 3)
    band = "SECURE" if mastery >= 0.65 else ("DEVELOPING" if mastery >= 0.35 else "LOW")
    skill_states.append({
        "nodeId": code, "code": code, "title": code,
        "mastery": mastery, "effectiveMastery": round(mastery * 0.95, 3),
        "band": band, "attempts": rng.randint(0, 14),
        "correctCount": int(mastery * 12), "lastPracticedAt": "2026-09-1%dT10:00:00Z" % (rng.randint(1, 6)),
    })
mis_nodes = [n for n in c11_nodes if n["family"] == "MISCONCEPTION"]
misconceptions = [{
    "misconceptionNodeId": m["code"], "code": m["code"], "title": m["title"],
    "probability": round(rng.uniform(0.15, 0.7), 2), "active": rng.random() < 0.4,
    "evidenceCount": rng.randint(1, 5),
} for m in mis_nodes[:8]]
learner_sim = {
    "learnerId": "sim-learner-01", "displayName": "Demo Learner (SIMULATED)",
    "disclaimer": "SIMULATED state overlay generated deterministically for the demo. Never a governed learner model.",
    "skillStates": skill_states, "misconceptionStates": misconceptions,
}

# ── manifest ─────────────────────────────────────────────────────────
manifest = {
    "schema": "syllabai-demo-content/1.0",
    "generatedUtc": "2026-09-17T13:30:00Z",
    "importSource": {
        "repo": "SyllabAI/syllabai-resources", "ref": "main",
        "upstreamSchemas": ["syllabai.sme-exam-questions/1.1", "graph-as-code (T-C09/C11)"],
    },
    "curriculum": {"board": "Pearson Edexcel", "level": "IGCSE", "subject": "Chemistry",
                   "code": "4CH1", "syllabusVersion": "2017"},
    "license": "operator-authorized pilot corpus; see syllabai-resources LICENSE-DATA.md (SME attestation 2026-09-17)",
    "statusDiscipline": {
        "RULE_DERIVED": "spec skeleton edges — operator-governed",
        "AI_SUGGESTED": "T-C11 concepts/edges — NOT validated; shown with provenance in the demo",
        "DEMO_DERIVED": "flashcards generated for the demo — never canonical content",
        "SIMULATED": "learner overlay — deterministic fiction, clearly labelled",
    },
    "counts": {
        "curriculumNodes": len(nodes_out), "curriculumEdges": len(edges_out),
        "graphNodes": len(c11_nodes), "graphEdges": len(c11_edges),
        "notes": len(notes_out), "questionTopics": len(q_topics_out),
        "questions": sum(len(t["questions"]) for t in q_topics_out),
        "flashcards": len(flash_out), "assets": len(downloaded),
    },
}

def write(name, obj):
    with open(f"{OUT}/{name}", "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
    kb = os.path.getsize(f"{OUT}/{name}") // 1024
    print(f"wrote {name} ({kb} KB)")

write("manifest.json", manifest)
write("curriculum.json", curriculum)
write("concept-graph.json", concept_graph)
write("notes.json", notes_out)
write("questions.json", q_topics_out)
write("flashcards.json", flash_out)
write("learner-sim.json", learner_sim)
print(f"\nDONE — assets downloaded: {len(downloaded)}")
