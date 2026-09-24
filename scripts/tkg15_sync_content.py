#!/usr/bin/env python3
"""T-KG-15 demo sync — content curriculum for geography after the Paper-2
Rural/Urban row capture (upstream 2dd126f1).

ADDED igcse-geography S6.082 (Rural), S6.083 (Urban); nothing removed.
Re-materializes the curriculum from the rebuilt spine (Stage-3 flip
contract), after proving zero corpus references to the added codes'
siblings... and that all corpus anchors still resolve. Compact JSON +
trailing newline (demo house style).
"""
import json
import re
from pathlib import Path

REPO = Path("/home/z/my-project/download/syllabai-demo")
SLUG = "igcse-geography-19"
ADDED = {"IGCSE_GEOGRAPHY:S6.082", "IGCSE_GEOGRAPHY:S6.083"}


def dump(path, doc):
    with open(path, "w") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")


def corpus_refs(slug):
    refs = set()
    d = REPO / "content" / slug
    for fn in ("notes.json", "questions.json", "flashcards.json",
               "learner-sim.json", "concept-graph.json"):
        refs |= set(re.findall(r"(?:IGCSE|IAL)_[A-Z_]+:S[A-Z]?\d+\.\d+[A-Z]?",
                               (d / fn).read_text()))
    return refs


spine = json.loads((REPO / "spines" / f"{SLUG}.json").read_text())
cur_path = REPO / "content" / SLUG / "curriculum.json"
cur = json.loads(cur_path.read_text())
old_sp = {n["code"] for n in cur["nodes"] if n.get("family") == "SPEC_POINT"}
new_sp = {n["code"] for n in spine["curriculum"]["nodes"]
          if n.get("family") == "SPEC_POINT"}
added, dead = new_sp - old_sp, old_sp - new_sp
if added != ADDED or dead:
    print(f"ABORT: unexpected set change added={sorted(added)} dead={sorted(dead)}")
    raise SystemExit(1)

refs = corpus_refs(SLUG)
live = {n["code"] for n in spine["curriculum"]["nodes"]}
dangling = refs - live
if dangling:
    print(f"ABORT: corpus refs not in spine: {sorted(dangling)[:8]}")
    raise SystemExit(1)

cur["nodes"] = spine["curriculum"]["nodes"]
cur["edges"] = spine["curriculum"]["edges"]
dump(cur_path, cur)
missing = refs - {n["code"] for n in cur["nodes"]}
print(f"{SLUG}: SPEC_POINTs {len(old_sp)} -> {len(new_sp)} (added {sorted(added)}); "
      f"nodes {len(cur['nodes'])}, edges {len(cur['edges'])}; "
      f"corpus anchors resolve: {not missing}")
raise SystemExit(0 if not missing else 1)
