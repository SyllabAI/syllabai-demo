#!/usr/bin/env python3
"""Enumerate exact EQ filenames for the 10 new lanes; fetch format samples
(new vs old) for RN manifest / note md / deck.json / EQ manifest / spec index."""
import json, os, urllib.request

WORK = "/home/z/my-project/work"
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

def raw(path):
    req = urllib.request.Request(f"{RAW}/{urllib.request.quote(path)}", headers=_gh_headers())
    with urllib.request.urlopen(req) as r:
        return r.read().decode("utf8", "replace")

tree = json.load(open(os.path.join(WORK, "tree_SME-ExamQuestion.json")))["tree"]
NEW = [s for s in [t["path"].split("/")[0] for t in tree if t["type"] == "blob"]]
import collections
seen = []
for t in tree:
    if t["type"] != "blob":
        continue
    slug = t["path"].split("/")[0]
    if "english-language-a" in slug or "maths-b" in slug or "double-award-modular" in slug:
        print(f"EQ {t['path']}  ({t.get('size',0)}B)")
