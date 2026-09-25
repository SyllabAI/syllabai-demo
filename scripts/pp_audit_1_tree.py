#!/usr/bin/env python3
"""Tree-level audit of syllabai-pastpapers from the blobless clone listing.
Checks: structure conformance, duplicate blobs (misplacement signal),
missing manifests, orphan files, quarantine census."""
import collections, json, re, sys

LS = "/home/z/my-project/upload/pp_ls_tree.txt"
OUT = "/home/z/my-project/upload/pp_inventory.json"

entries = []
for line in open(LS):
    meta, path = line.rstrip("\n").split("\t", 1)
    mode, otype, sha = meta.split()
    entries.append({"path": path, "type": otype, "sha": sha})

print(f"total entries: {len(entries)}")
print(f"blobs: {sum(1 for e in entries if e['type']=='blob')}")
print(f"trees: {sum(1 for e in entries if e['type']=='tree')}")

# --- canonical paper dir pattern
RE_SERIES = re.compile(
    r"^past-papers/([^/]+)/([^/]+)/([^/]+)/([^/]+)/past-papers/([^/]+)/([^/]+)/([^/]+)$")
RE_SPECIMEN = re.compile(
    r"^past-papers/([^/]+)/([^/]+)/([^/]+)/([^/]+)/specimen/([^/]+)/([^/]+)$")

paper_dirs = {}      # dirpath -> {board,qual,subject,spec,session,files:{}}
nonconforming = []   # blobs under past-papers/ that don't match canonical layout

for e in entries:
    if e["type"] != "blob":
        continue
    p = e["path"]
    if not p.startswith("past-papers/"):
        continue
    m = RE_SERIES.match(p)
    if m:
        board, qual, subject, spec, session, d, f = m.groups()
        dp = f"past-papers/{board}/{qual}/{subject}/{spec}/past-papers/{session}/{d}"
        paper_dirs.setdefault(dp, {
            "board": board, "qual": qual, "subject": subject, "spec": spec,
            "session": session, "dir": d, "files": {}})
        paper_dirs[dp]["files"][f] = {"sha": e["sha"]}
        continue
    m = RE_SPECIMEN.match(p)
    if m:
        board, qual, subject, spec, d, f = m.groups()
        dp = f"past-papers/{board}/{qual}/{subject}/{spec}/specimen/{d}"
        paper_dirs.setdefault(dp, {
            "board": board, "qual": qual, "subject": subject, "spec": spec,
            "session": "specimen", "dir": d, "files": {}})
        paper_dirs[dp]["files"][f] = {"sha": e["sha"]}
        continue
    nonconforming.append(p)

print(f"\npaper dirs: {len(paper_dirs)}")
print(f"non-conforming blobs under past-papers/: {len(nonconforming)}")
for p in nonconforming[:20]:
    print("  ", p)

# --- non-pdf files in paper dirs
other_ext = collections.Counter()
for dp, info in paper_dirs.items():
    for f in info["files"]:
        ext = f.rsplit(".", 1)[-1].lower() if "." in f else "<none>"
        if ext != "pdf":
            other_ext[ext] += 1
print(f"\nnon-pdf extensions in paper dirs: {dict(other_ext)}")

# --- manifest coverage
no_manifest = [dp for dp, i in paper_dirs.items() if "manifest.yaml" not in i["files"]]
print(f"dirs missing manifest.yaml: {len(no_manifest)}")
for p in no_manifest[:10]:
    print("  ", p)

# --- materials census
mat = collections.Counter()
for dp, i in paper_dirs.items():
    has_qp = "qp.pdf" in i["files"]
    has_ms = "ms.pdf" in i["files"]
    mat[(has_qp, has_ms)] += 1
print(f"\nmaterial combos (qp,ms): {dict(mat)}")

# --- duplicate blob SHAs across different paper dirs (same filename only, to cut noise)
by_sha = collections.defaultdict(list)
for dp, i in paper_dirs.items():
    for f, fi in i["files"].items():
        if f in ("qp.pdf", "ms.pdf", "er.pdf"):
            by_sha[(f, fi["sha"])].append(dp)

dups = {k: v for k, v in by_sha.items() if len(v) > 1}
print(f"\nduplicate (material, sha) groups across dirs: {len(dups)}")
# same spec+session only = strongest misplacement signal
suspect = {}
for (f, sha), dps in sorted(dups.items()):
    specs = collections.Counter("/".join(dp.split("/")[1:5]) + "/" + dp.split("/")[5] for dp in dps)
    if len(set(dps)) > 1 and len(specs) > 1 or True:
        # classify: same spec+session dup (suspicious), cross-session (maybe legit covid reuse), cross-spec (very suspicious)
        keys = {(i["board"], i["qual"], i["subject"], i["spec"], i["session"]) for i in
                (paper_dirs[dp] for dp in dps)}
        cls = ("same-session" if len(keys) == 1 else
               "same-spec-cross-session" if len({k[:4] for k in keys}) == 1 else
               "cross-spec")
        suspect.setdefault(cls, []).append((f, sha[:12], dps))

for cls in ("cross-spec", "same-spec-cross-session", "same-session"):
    rows = suspect.get(cls, [])
    print(f"  {cls}: {len(rows)}")
    for f, sha, dps in rows[:12]:
        print(f"     {f} {sha} -> {len(dps)} dirs: {dps[:3]}{'...' if len(dps)>3 else ''}")

# --- quarantine census
q = collections.Counter()
q_files = collections.defaultdict(list)
for e in entries:
    if e["type"] == "blob" and e["path"].startswith("_quarantine/"):
        parts = e["path"].split("/")
        cat = parts[1]
        q[cat] += 1
        if e["path"].endswith(".pdf"):
            q_files[cat].append(e["path"])
print(f"\nquarantine census: {dict(q)}")

json.dump({
    "paper_dirs": paper_dirs,
    "nonconforming": nonconforming,
    "dups": {cls: [(f, sha, dps) for f, sha, dps in rows] for cls, rows in suspect.items()},
    "quarantine": dict(q),
    "quarantine_files": {k: v for k, v in q_files.items()},
}, open(OUT, "w"))
print(f"\nwrote {OUT}")
