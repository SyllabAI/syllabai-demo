#!/usr/bin/env python3
"""Diff audit: old vs new kg exports — per file, which top-level fields changed,
and inside those, which keys/labels moved. Expect: 3 IAL sciences substantive;
other 46 only generatedUtc."""
import json, subprocess, sys

REPO = "/home/z/my-project/gh_repos/syllabai-demo"
files = subprocess.run(
    ["git", "diff", "--numstat", "public/kg/data/"], cwd=REPO, capture_output=True, text=True
).stdout.split("\n")
paths = [l.split("\t")[2] for l in files if l.strip()]

substantive = []
for p in paths:
    name = p.split("/")[-1]
    old_raw = subprocess.run(["git", "show", f"HEAD:{p}"], cwd=REPO,
                             capture_output=True, text=True).stdout
    if name == "index.json":
        old = json.loads(old_raw); new = json.load(open(f"{REPO}/{p}"))
        oc = {c["slug"]: c["counts"] for c in old["courses"]}
        nc = {c["slug"]: c["counts"] for c in new["courses"]}
        diff = {s for s in oc if oc[s] != nc.get(s)}
        print(f"index.json: counts changed for {sorted(diff)}")
        continue
    old = json.loads(old_raw); new = json.load(open(f"{REPO}/{p}"))
    changed = [k for k in old if json.dumps(old[k], sort_keys=True) != json.dumps(new.get(k), sort_keys=True)]
    if changed == ["meta"] and list(old["meta"]) == list(new["meta"]):
        meta_changed = [k for k in old["meta"]
                        if json.dumps(old["meta"][k], sort_keys=True) != json.dumps(new["meta"].get(k), sort_keys=True)]
        if meta_changed == ["generatedUtc"]:
            continue
    substantive.append((name, changed))

print()
for name, changed in substantive:
    print(f"SUBSTANTIVE {name}: {changed}")
print(f"\nsubstantive files: {len(substantive)} (expect 3: ial-biology-18, ial-chemistry-17, ial-physics-19)")

# structural detail of the 3
for name in ["ial-physics-19.json", "ial-chemistry-17.json", "ial-biology-18.json"]:
    new = json.load(open(f"{REPO}/public/kg/data/{name}"))
    secs = {k: v["label"] for k, v in new["sections"].items()}
    subs = {k: [s[0] for s in v] for k, v in new["subtopics"].items()}
    print(f"\n{name}: sections={secs}")
    print(f"  subtopics per section: {subs}")
    print(f"  meta.counts={new['meta']['counts']}")
    print(f"  anchors={len(new['sectionAnchors'])} | nodes={len(new['nodes'])} edges={len(new['edges'])}")
    # every point still reachable, one parent
    pars = {}
    ok = True
    for e in new["edges"]:
        if e[2] != "hier": ok = False
        if e[1] in pars: ok = False
        pars[e[1]] = e[0]
    roots = [i for i in pars if i not in pars.values()]
    ids = {n["id"] for n in new["nodes"]}
    dangling = [e for e in new["edges"] if e[0] not in ids or e[1] not in ids]
    print(f"  single-parent tree ok={ok} roots={roots} dangling={len(dangling)} ids_unique={len(ids)==len(new['nodes'])}")
