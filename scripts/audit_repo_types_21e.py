#!/usr/bin/env python3
"""Per-course file-type breakdown across the three SME domains + official-spec
parse reports. Compares the 10 new courses against the 39 existing ones."""
import json, os
from collections import defaultdict

WORK = "/home/z/my-project/work"
CONTENT = "/home/z/my-project/content"
have = set(os.listdir(CONTENT)) - {"courses.json"}

def load(name):
    return json.load(open(os.path.join(WORK, f"tree_{name}.json")))["tree"]

rn, eq, fc = load("SME-RevisionNotes"), load("SME-ExamQuestion"), load("SME-Flashcards")

def classify(path, domain):
    base = os.path.basename(path)
    depth = path.count("/")
    if domain == "RN":
        if base == "manifest.json" and depth == 1: return "manifest"
        if "/notes/" in path and base.endswith(".md"): return "note_md"
        return "other"
    if domain == "EQ":
        if base == "manifest.json" and depth == 1: return "manifest"
        if base == "spec_point_index.json": return "sp_index"
        if base == "spec_point_map.json": return "sp_map"
        if base == "spec_point_resolution.json": return "sp_res"
        if base == "topic.json": return "topic_json"
        return "other"
    if domain == "FC":
        if base == "deck.json": return "deck"
        return "other"
    return "other"

def per_course(tree, domain):
    out = defaultdict(lambda: defaultdict(int))
    for t in tree:
        if t["type"] != "blob": continue
        slug = t["path"].split("/")[0]
        out[slug][classify(t["path"], domain)] += 1
    return out

rn_c, eq_c, fc_c = per_course(rn, "RN"), per_course(eq, "EQ"), per_course(fc, "FC")
all_slugs = sorted(set(rn_c) | set(eq_c) | set(fc_c))

hdr = f'{"slug":<70}{"RNman":>6}{"notes":>6} | {"EQman":>6}{"spidx":>6}{"spmap":>6}{"spres":>6}{"topic":>6}{"oth":>4} | {"deck":>5}'
print(hdr); print("-" * len(hdr))
for s in all_slugs:
    r, e, f = rn_c.get(s, {}), eq_c.get(s, {}), fc_c.get(s, {})
    tag = "*" if s not in have else " "
    print(f'{tag}{s[:69]:<70}{r.get("manifest",0):>6}{r.get("note_md",0):>6} | '
          f'{e.get("manifest",0):>6}{e.get("sp_index",0):>6}{e.get("sp_map",0):>6}{e.get("sp_res",0):>6}'
          f'{e.get("topic_json",0):>6}{e.get("other",0):>4} | {f.get("deck",0):>5}')

# official spec parse reports for the 3 new subjects
print("\n=== parse_report.json (new subjects) ===")
RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main"
import urllib.request, urllib.error
for subj in ["igcse-english-language-a", "igcse-maths-b", "igcse-science-double-award-modular"]:
    url = f"{RAW}/Official-Specifications/parsed/{subj}/parse_report.json"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "syllabai-demo-importer"})
        d = json.load(urllib.request.urlopen(req))
        print(f"\n{subj}:")
        for k, v in d.items():
            print(f"  {k}: {str(v)[:140]}")
    except Exception as e:
        print(f"  !! {subj}: {e}")
