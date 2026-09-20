#!/usr/bin/env python3
"""Fetch old-vs-new samples from syllabai-resources and compare schemas:
EQ manifest / topic.json / spec_point_index / RN manifest / note md / deck."""
import json, os, urllib.request

RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main"
import os as _os

def _gh_headers():
    tok = ""
    _p = "/home/z/my-project/scripts/.gh_token"
    if _os.path.exists(_p):
        tok = open(_p).read().strip()
    h = {"User-Agent": "syllabai-demo-importer"}
    if tok:
        h["Authorization"] = f"token {tok}"
    return h

HDRS = _gh_headers()
CACHE = "/home/z/my-project/work/sample-cache"

def raw(path):
    dest = os.path.join(CACHE, path)
    if os.path.exists(dest):
        return open(dest, encoding="utf8").read()
    req = urllib.request.Request(f"{RAW}/{urllib.request.quote(path)}", headers=_gh_headers())
    with urllib.request.urlopen(req) as r:
        text = r.read().decode("utf8", "replace")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w") as f:
        f.write(text)
    return text

def j(path):
    return json.loads(raw(path))

def shape(o, depth=0):
    if depth > 2: return type(o).__name__
    if isinstance(o, dict):
        return {k: shape(v, depth + 1) for k, v in list(o.items())[:14]}
    if isinstance(o, list):
        return f"list[{len(o)}]" + (f" of {shape(o[0], depth + 1)}" if o else "")
    return type(o).__name__

ELA1 = "igcse-english-language-a-16-paper-1-non-fiction-texts-and-transactional-writing"
CHEM = "igcse-chemistry-19"
MB = "igcse-maths-b-16"
SDAB1 = "igcse-science-double-award-modular-24-biology-unit-1"

print("=" * 72)
print("1) EQ manifest.json — old vs new")
old_m = j(f"SME-ExamQuestion/{CHEM}/manifest.json")
new_mb = j(f"SME-ExamQuestion/{MB}/manifest.json")
new_ela = j(f"SME-ExamQuestion/{ELA1}/manifest.json")
new_sda = j(f"SME-ExamQuestion/{SDAB1}/manifest.json")
print(" OLD keys:", sorted(old_m.keys()))
print(" NEW(MB) keys:", sorted(new_mb.keys()))
print(" NEW(MB):", json.dumps(new_mb, ensure_ascii=False)[:400])
print(" NEW(SDAB1):", json.dumps(new_sda, ensure_ascii=False)[:300])
print(" NEW(ELA1) keys:", sorted(new_ela.keys()))
print(" NEW(ELA1) head:", json.dumps(new_ela, ensure_ascii=False)[:400])

print("=" * 72)
print("2) EQ topic.json — old vs ELA new (schema + counts)")
eq_tree = json.load(open("/home/z/my-project/work/tree_SME-ExamQuestion.json"))["tree"]
old_topic_path = next(t["path"] for t in eq_tree
                      if t["type"] == "blob" and t["path"].startswith(CHEM + "/") and t["path"].endswith("topic.json"))
print(" OLD topic path:", old_topic_path)
old_t = j(f"SME-ExamQuestion/{old_topic_path}")
print(" OLD top keys:", list(old_t.keys()))
qs_old = old_t.get("questions") or old_t.get("question_sets") or []
print(" OLD question container:", type(qs_old).__name__, len(qs_old))
if qs_old:
    print(" OLD item keys:", sorted(qs_old[0].keys())[:20])
ela_t = j(f"SME-ExamQuestion/{ELA1}/paper-1-non-fiction/paper-1-section-a-reading/topic.json")
print(" NEW top keys:", list(ela_t.keys()))
print(" NEW schema:", ela_t.get("schema"))
qs_new = ela_t.get("questions") or ela_t.get("question_sets") or []
print(" NEW container:", type(qs_new).__name__, len(qs_new))
if qs_new:
    it = qs_new[0]
    if isinstance(it, dict) and "question_sets" in it:
        print("  set[0] keys:", sorted(it.keys()))
        inner = it["question_sets"]
        print(f"  inner sets: {len(inner)}; inner[0] keys:", sorted(inner[0].keys()) if inner else None)
        qs2 = inner[0].get("questions") if inner else []
        print(f"  inner[0] questions: {len(qs2)}; q keys:", sorted(qs2[0].keys())[:22] if qs2 else None)
    else:
        print("  item keys:", sorted(it.keys())[:22])

print("=" * 72)
print("3) spec_point_index.json — old vs new")
old_i = j(f"SME-ExamQuestion/{CHEM}/spec_point_index.json")
new_i = j(f"SME-ExamQuestion/{MB}/spec_point_index.json")
print(" OLD keys:", list(old_i.keys()))
print(" OLD sp count:", len(old_i.get("spec_points", {})))
print(" NEW keys:", list(new_i.keys()))
print(" NEW sp count:", len(new_i.get("spec_points", {})))
ok, nk = list(old_i.get("spec_points", {}).items())[:1], list(new_i.get("spec_points", {}).items())[:1]
print(" OLD sample:", json.dumps(ok, ensure_ascii=False)[:260])
print(" NEW sample:", json.dumps(nk, ensure_ascii=False)[:260])

print("=" * 72)
print("4) RN manifest.json — old vs new")
old_r = j(f"SME-RevisionNotes/{CHEM}/manifest.json")
new_r = j(f"SME-RevisionNotes/{MB}/manifest.json")
print(" OLD keys:", sorted(old_r.keys()))
print(" NEW keys:", sorted(new_r.keys()))
print(" NEW(MB):", json.dumps({k: v for k, v in new_r.items() if not isinstance(v, list)}, ensure_ascii=False)[:400])
if isinstance(new_r.get("sections"), list) and new_r["sections"]:
    print(" NEW section[0] keys:", sorted(new_r["sections"][0].keys()))

print("=" * 72)
print("5) note md frontmatter — old vs new")
rn_tree = json.load(open("/home/z/my-project/work/tree_SME-RevisionNotes.json"))["tree"]
old_note_path = next(t["path"] for t in rn_tree
                     if t["type"] == "blob" and t["path"].startswith(CHEM + "/notes/") and t["path"].endswith(".md"))
print(" OLD note path:", old_note_path)
old_n = raw(f"SME-RevisionNotes/{old_note_path}")
new_n = None
import re
for cand in re.finditer(r'"path": "notes/([^"]+\.md)"', json.dumps(new_r)[:200000]):
    pass
# discover one new note path from the manifest json text
m = re.search(r'notes/[A-Za-z0-9\-/]+\.md', json.dumps(new_r))
print(" NEW note path sample:", m.group(0) if m else "?")
if m:
    new_n = raw(f"SME-RevisionNotes/{MB}/{m.group(0)}")
print(" OLD frontmatter:", old_n[:old_n.find("---", 3)].replace(chr(10), " | ")[:400])
if new_n:
    print(" NEW frontmatter:", new_n[:new_n.find("---", 3)].replace(chr(10), " | ")[:400])

print("=" * 72)
print("6) FC deck.json — old vs new (maths-b has 62 decks)")
old_d = j("SME-Flashcards/igcse-chemistry-19/1-principles-of-chemistry/1-1-states-of-matter/deck.json")
print(" OLD keys:", sorted(old_d.keys()))
print(" OLD deck keys:", sorted((old_d.get("deck") or {}).keys()))
print(" OLD cards:", len(old_d.get("cards", [])))
# find a maths-b deck path from tree
fc_tree = json.load(open("/home/z/my-project/work/tree_SME-Flashcards.json"))["tree"]
mb_deck = next(t["path"] for t in fc_tree if t["type"] == "blob" and t["path"].startswith(MB) and t["path"].endswith("deck.json"))
print(" NEW deck path:", mb_deck)
mb_note = next(t["path"] for t in rn_tree if t["type"] == "blob" and t["path"].startswith(MB + "/notes/") and t["path"].endswith(".md"))
print(" NEW note path:", mb_note)
new_n = raw(f"SME-RevisionNotes/{mb_note}")
print(" NEW frontmatter:", new_n[:new_n.find("---", 3)].replace(chr(10), " | ")[:400])
new_d = j(f"SME-Flashcards/{mb_deck}")
print(" NEW keys:", sorted(new_d.keys()))
print(" NEW deck keys:", sorted((new_d.get("deck") or {}).keys()))
print(" NEW cards:", len(new_d.get("cards", [])))
print(" NEW sample card:", json.dumps(new_d["cards"][0], ensure_ascii=False)[:220])
