#!/usr/bin/env python3
"""kg_course_sweep.py — runtime sweep of every exported KG course.

For each public/kg/data/<slug>.json (minus index/canonicalKG) this drives the
fork page through agent-browser against a local static server and verifies
EVERY course-identity surface the P9..P15 patches make dynamic:

  __KG_STATUS ready
  #graph aria-label      == "SyllabAI knowledge graph for <qual>. <boilerplate>"
  .treeScope             == <qual> + <N> + " SpecificationPoints"
  document.title         == <subjectLabel> + " — Knowledge Graph"
  #hud .title            == <subjectLabel>
  #search placeholder    contains <subjectLabel> lowercased
  subject node label     == <subjectLabel>
  hierarchyPath(sample)  no duplicate ids (P14i class defect)
  no "chemistry" token   in any checked surface for non-chemistry courses

where <qual> = meta.board + meta.level + meta.subject joined (kg_export v1.1).

Zero mutation: read-only over data files; the browser only loads pages.

Usage:  python3 scripts/kg_course_sweep.py [base_url]
        base_url defaults to http://127.0.0.1:8778/kg
        (serve the public/ dir:  python3 -m http.server 8778 -d public)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.parse
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "public" / "kg" / "data"
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8778/kg"
BOILER = ("Use Tab to enter the graph, arrow keys to navigate, Enter to "
          "open, and Space to expand or open a specification point.")

EVAL = """(function(){
 try{
  var st=window.__KG_STATUS;
  if(st!=='ready')return 'NOTREADY:'+st;
  var g=document.getElementById('graph');
  var aria=g?String(g.getAttribute('aria-label')):'NOGRAPH';
  var ts=document.querySelector('.treeScope');
  var tsTxt=ts?ts.textContent:'NO_SCOPE';
  var t=document.title;
  var hud=document.querySelector('#hud .title');
  var hudTxt=hud?hud.textContent:'NO_HUD';
  var se=document.getElementById('search');
  var ph=se?se.placeholder:'NO_SEARCH';
  var subjN=state.nodes.find(function(n){return n.id==='subject'});
  var subj=subjN?String(subjN.label):'NO_SUBJECT_NODE';
  var p=state.nodes.find(function(n){return n.type==='SpecificationPoint'});
  var hp=p?hierarchyPath(p).map(function(x){return x.id}):[];
  var dup=(new Set(hp)).size!==hp.length;
  return JSON.stringify({aria:aria,ts:tsTxt,t:t,hud:hudTxt,ph:ph,subj:subj,dup:dup,pts:hp.length});
 }catch(e){return JSON.stringify({evalerr:String(e&&e.message||e)})}
})()"""


def ab(*args: str, timeout: int = 30) -> str:
    r = subprocess.run(["agent-browser", *args], capture_output=True,
                       text=True, timeout=timeout)
    out = (r.stdout or "").strip()
    return out if out else (r.stderr or "").strip()


def expected_for(slug: str, d: dict) -> dict:
    m = d.get("meta") or {}
    sl = str(d.get("subjectLabel") or "")
    qual = " ".join(x for x in [m.get("board"), m.get("level"), m.get("subject")] if x) or sl
    npts = len(d.get("points") or [])
    return {"slug": slug, "qual": qual, "sl": sl, "npts": npts,
            "is_chem": "chem" in slug or "chem" in (m.get("subject") or "").lower()}


def check(exp: dict, got: dict) -> list:
    issues = []
    if "evalerr" in got:
        return [f"eval error: {got['evalerr']}"]
    want_aria = f"SyllabAI knowledge graph for {exp['qual']}. {BOILER}"
    if got["aria"] != want_aria:
        issues.append(f"aria {got['aria'][:70]!r} != {want_aria[:70]!r}")
    if got["ts"] != f"{exp['qual']}{exp['npts']} SpecificationPoints":
        issues.append(f"treeScope {got['ts'][:70]!r}")
    if got["t"] != f"{exp['sl']} \u2014 Knowledge Graph":
        issues.append(f"title {got['t']!r}")
    if got["hud"] != exp["sl"]:
        issues.append(f"hud {got['hud']!r}")
    if exp["sl"].lower() not in got["ph"].lower():
        issues.append(f"placeholder {got['ph']!r}")
    if got["subj"] != exp["sl"]:
        issues.append(f"subject node {got['subj']!r}")
    if got["dup"]:
        issues.append(f"hierarchyPath dup ({got['pts']} hops)")
    if not exp["is_chem"] and "chemistry" in " ".join(
            [got["aria"], got["ts"], got["t"], got["hud"], got["ph"], got["subj"]]).lower():
        issues.append("stale 'Chemistry' token in a surface")
    return issues


def main() -> int:
    files = [f for f in sorted(DATA.glob("*.json"))
             if f.name != "index.json" and "canonicalKG" not in f.name]
    print(f"sweeping {len(files)} courses at {BASE}", flush=True)
    rows, failures = [], 0
    for f in files:
        slug = f.stem
        exp = expected_for(slug, json.loads(f.read_text(encoding="utf-8")))
        url = f"{BASE}/openhuman-course-explorer.html?course={urllib.parse.quote(slug)}"
        try:
            ab("open", url, timeout=45)
            ab("wait", "--fn", "window.__KG_STATUS==='ready'", "--timeout", "8000",
               timeout=20)
            raw = ab("eval", EVAL, timeout=20)
        except subprocess.TimeoutExpired:
            raw = '{"evalerr":"agent-browser timeout"}'
        try:
            got = None
            payload = raw.strip()
            # agent-browser eval prints the result JSON-encoded, often twice
            for _ in range(2):
                if payload.startswith('"'):
                    payload = json.loads(payload)
            if isinstance(payload, str) and payload.startswith('NOTREADY:'):
                got = {"evalerr": payload[:100]}
            elif isinstance(payload, str):
                got = json.loads(payload[payload.index("{"):payload.rindex("}") + 1])
            elif isinstance(payload, dict):
                got = payload
        except Exception:
            got = {"evalerr": f"unparseable: {raw[:120]}"}
        issues = check(exp, got)
        if issues:
            failures += 1
            status = "FAIL"
        else:
            status = "PASS"
        rows.append((status, slug, exp["qual"], str(exp["npts"]), "; ".join(issues)))
        print(f"{status}  {slug:52s} {exp['qual'][:44]:46s} "
              f"{('OK' if not issues else issues[0][:80])}", flush=True)
    print(f"\n{len(files) - failures}/{len(files)} PASS, {failures} FAIL")
    out = REPO / "download" / "kg-fork-archive" / f"course-sweep-{len(files)}-2026-09-26.txt"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join("\t".join(r) for r in rows) +
                   f"\n\n{len(files) - failures}/{len(files)} PASS, {failures} FAIL\n",
                   encoding="utf-8")
    print(f"report: {out}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
