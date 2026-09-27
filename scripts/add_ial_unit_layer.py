#!/usr/bin/env python3
"""add_ial_unit_layer.py — Option 1 (content-side): insert the printed Unit
layer into the three IAL science curricula so the KG re-unifies the units.

    SUBJECT -> UNIT -> TOPIC -> SUBTOPIC -> SPEC_POINT

Everything is derived from content truth, nothing invented:
  - unit grouping  : unanimous SPEC_POINT applicability.unit_scope votes per topic
  - unit exam code : parsed from applicability.rule ('unit code WPH11/01')
  - unit title     : f"Unit {n} ({code})"
TOPIC/SUBTOPIC/SPEC_POINT nodes, codes and parents of subs/points are untouched
(manifest counts semantics stay valid). curriculum edges are rewired to mirror
parents. Idempotent: skips courses that already carry UNIT nodes.
"""
import json, re, collections, sys

REPO = "/home/z/my-project/gh_repos/syllabai-demo"
COURSES = ["ial-physics-19", "ial-chemistry-17", "ial-biology-18"]
NODE_KEYS = ["code", "family", "title", "description", "parents",
             "provenanceTier", "order"]


def fail(msg):
    print("FAIL:", msg)
    sys.exit(1)


def compact_write(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")


def derive(slug):
    path = f"{REPO}/content/{slug}/curriculum.json"
    c = json.loads(open(path, encoding="utf-8").read())
    nodes = c["nodes"]
    subject = next((n for n in nodes if n["family"] == "SUBJECT"), None)
    if subject is None:
        fail(f"{slug}: no SUBJECT node")
    if any(n["family"] == "UNIT" for n in nodes):
        return None  # already applied
    subj_code = subject["code"]
    tops = [n for n in nodes if n["family"] == "TOPIC"]
    subs = [n for n in nodes if n["family"] == "SUBTOPIC"]
    pts = [n for n in nodes if n["family"] == "SPEC_POINT"]
    if not tops or not subs or not pts:
        fail(f"{slug}: degenerate bundle {len(tops)}/{len(subs)}/{len(pts)}")

    top_codes = {t["code"] for t in tops}
    top_of_sub = {}
    for s in subs:
        ps = [p for p in s.get("parents", []) if p in top_codes]
        if len(ps) != 1:
            fail(f"{slug}: SUBTOPIC {s['code']} parents {ps}")
        top_of_sub[s["code"]] = ps[0]

    votes = collections.defaultdict(collections.Counter)
    unit_code_of, unit_rule_of = {}, {}
    for p in pts:
        app = p.get("applicability") or {}
        us, rule = app.get("unit_scope"), app.get("rule", "")
        if not us or not re.fullmatch(r"U\d+", us):
            fail(f"{slug}: point {p['code']} bad unit_scope {us!r}")
        m = re.search(r"unit code ([A-Z]{3}\d{2})/", rule)
        if not m:
            fail(f"{slug}: point {p['code']} rule lacks unit code: {rule[:90]}")
        if us in unit_code_of and unit_code_of[us] != m.group(1):
            fail(f"{slug}: {us} maps to {unit_code_of[us]} vs {m.group(1)}")
        unit_code_of[us] = m.group(1)
        unit_rule_of.setdefault(us, rule)
        sub_hits = [x for x in p.get("parents", []) if x in top_of_sub]
        if len(sub_hits) != 1:
            fail(f"{slug}: point {p['code']} parents {p.get('parents')}")
        votes[top_of_sub[sub_hits[0]]][us] += 1

    topic_unit = {}
    for t in tops:
        v = votes.get(t["code"], {})
        if len(v) != 1:
            fail(f"{slug}: topic {t['code']} unit votes {dict(v)} (need 1)")
        topic_unit[t["code"]] = next(iter(v))

    # build UNIT nodes (printed unit number order)
    unit_scopes = sorted(unit_code_of, key=lambda x: int(x[1:]))
    unit_node_of = {}
    for us in unit_scopes:
        num = int(us[1:])
        un = {
            "code": f"{slug}-U{num}",
            "family": "UNIT",
            "title": f"Unit {num} ({unit_code_of[us]})",
            "description": None,
            "parents": [subj_code],
            "provenanceTier": "RULE_DERIVED",
            "order": num,
        }
        assert list(un.keys()) == NODE_KEYS
        unit_node_of[us] = un

    return c, path, subj_code, tops, topic_unit, unit_node_of


def apply(slug):
    derived = derive(slug)
    if derived is None:
        print(f"  skip {slug}: UNIT layer already present")
        return
    c, path, subj_code, tops, topic_unit, unit_node_of = derived

    # re-parent topics
    for t in tops:
        t["parents"] = [unit_node_of[topic_unit[t["code"]]]["code"]]

    # insert UNIT nodes right after the SUBJECT node (array position 1..)
    nodes = c["nodes"]
    subj_idx = next(i for i, n in enumerate(nodes) if n["family"] == "SUBJECT")
    new_units = list(unit_node_of.values())
    nodes[subj_idx + 1:subj_idx + 1] = new_units

    # rewire edges to mirror parents: subject->unit added, subject->topic re-sourced
    edges = c["edges"]
    top_unit_code = {t["code"]: unit_node_of[topic_unit[t["code"]]]["code"] for t in tops}
    subj_topic_idx = [i for i, e in enumerate(edges)
                      if e["source"] == subj_code and e["target"] in {t["code"] for t in tops}]
    if len(subj_topic_idx) != len(tops):
        fail(f"{slug}: expected {len(tops)} subject->topic edges, found {len(subj_topic_idx)}")
    unit_edge = {"source": subj_code, "relation": "PART_OF",
                 "target": None, "provenanceTier": "RULE_DERIVED"}
    for i in subj_topic_idx:
        edges[i]["source"] = top_unit_code[edges[i]["target"]]  # topic PART_OF its unit
    ins = subj_topic_idx[0]
    for k, un in enumerate(list(unit_node_of.values())):
        edges.insert(ins + k, dict(unit_edge, target=un["code"]))

    # mirror completeness re-check
    paired = {(e["source"], e["target"]) for e in edges}
    for n in nodes:
        for p in n.get("parents", []):
            if (p, n["code"]) not in paired:
                fail(f"{slug}: edge mirror missing {p} -> {n['code']}")

    # structural sanity + write
    fam = collections.Counter(n["family"] for n in nodes)
    if fam["UNIT"] != len(new_units) or fam["TOPIC"] != len(tops):
        fail(f"{slug}: family counts wrong {dict(fam)}")
    compact_write(path, c)
    json.loads(open(path, encoding="utf-8").read())  # validity gate
    print(f"  ok   {slug}: +{len(new_units)} UNIT nodes, {len(tops)} topics re-parented "
          f"({', '.join(u['title'] for u in new_units)})")


if __name__ == "__main__":
    print("== IAL unit layer (content truth) ==")
    for slug in COURSES:
        apply(slug)
    print("done")
