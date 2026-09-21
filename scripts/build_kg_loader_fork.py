#!/usr/bin/env python3
"""build_kg_loader_fork.py — produce public/kg/openhuman-course-explorer.html.

The fork is a copy of the byte-faithful v77 build with:
  1. eight `const` -> `var` patches on the module data tables (so the loader
     can swap them at runtime), and
  2. one hook line in makeBase()'s tail + one appended loader block that
     reads ?course=<slug>, fetches /kg/data/<slug>.json, validates it against
     GRAPH_CONTRACT v1.0, swaps the tables and rebuilds through the
     renderer's own makeBase() -> fitInitial() -> bootSimulation() pipeline.

Without ?course= the build behaves exactly like v77 (inline 4CH1 dataset).

Run from the repo root:  python3 scripts/build_kg_loader_fork.py
"""

from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "public" / "kg" / "v77-regression-fixes.html"
DST = REPO / "public" / "kg" / "openhuman-course-explorer.html"

# (old, new, expected count) — every patch must hit exactly once
PATCHES = [
    ("const sections={1:{label:'Principles of chemistry'",
     "var sections={1:{label:'Principles of chemistry'", 1),
    ("const subtopics={", "var subtopics={", 1),
    ("const points=[{\"id\": \"1.1\"", "var points=[{\"id\": \"1.1\"", 1),
    ("const pointsBySubtopic=new Map();", "var pointsBySubtopic=new Map();", 1),
    ("const sectionAnchors={", "var sectionAnchors={", 1),
    ("const subAnchors={};", "var subAnchors={};", 1),
    ("const subPointCounts={", "var subPointCounts={", 1),
    ("const semanticEdges=[", "var semanticEdges=[", 1),
    ("document.querySelector('#hud .subtitle').textContent='Pearson Edexcel International GCSE'",
     "document.querySelector('#hud .subtitle').textContent=window.__KG_SUBTITLE||'Pearson Edexcel International GCSE'", 1),
    (" state.edges.push(...semanticEdges);\n syncCanonicalKG();\n}",
     " state.edges.push(...semanticEdges);\n if(window.__KG_APPLY)window.__KG_APPLY();\n syncCanonicalKG();\n}", 1),
]

LOADER = """
// ============================================================================
// course loader fork (syllabai-demo) — data-decoupled operation.
// ?course=<slug>  ->  fetch /kg/data/<slug>.json (scripts/kg_export.py output,
// generated from content/<slug>/curriculum.json), validate against
// GRAPH_CONTRACT v1.0, swap the module data tables and rebuild through the
// renderer's own makeBase() pipeline. No ?course= -> inline 4CH1 as-is.
// ============================================================================
(async function(){
  const slug=new URLSearchParams(location.search).get('course');
  if(!slug) return;
  const post=(t,p)=>{try{parent.postMessage(Object.assign({type:t},p||{}),'*')}catch(e){}};
  // status memory for the host handshake: if the loader finishes before the
  // host attaches its listener (warm cache), the host's host-ready ping makes
  // us re-post the final status
  let done=null;
  window.addEventListener('message',ev=>{
    if(ev&&ev.data&&ev.data.type==='syllabai-kg:host-ready'&&done) post(done.type,done.payload);
  });
  try{
    const res=await fetch('/kg/data/'+encodeURIComponent(slug)+'.json',{cache:'no-cache'});
    if(!res.ok) throw new Error('kg data HTTP '+res.status+' for '+slug);
    const kg=await res.json();
    const nodeTypes=new Set(['Subject','Section','SubTopic','SpecificationPoint','ExamPaper']);
    const edgeTypes=new Set(['hier','pre','rel','assess']);
    if(!kg||!Array.isArray(kg.nodes)||!Array.isArray(kg.edges)||!kg.sections||!kg.subtopics||!Array.isArray(kg.points)) throw new Error('bad payload shape');
    const seen=new Set();
    for(const n of kg.nodes){
      if(!nodeTypes.has(n.type)) throw new Error('non-contract node type '+n.type);
      if(seen.has(n.id)) throw new Error('duplicate node id '+n.id);
      seen.add(n.id);
    }
    for(const e of kg.edges){
      if(!edgeTypes.has(e[2])) throw new Error('non-contract edge type '+e[2]);
      if(!seen.has(e[0])||!seen.has(e[1])) throw new Error('dangling edge '+e[0]+' -> '+e[1]);
    }
    // 1. swap the module tables (payload shapes = the build's own literals)
    sections=kg.sections;
    subtopics=kg.subtopics;
    points=kg.points;
    subPointCounts=kg.subPointCounts||{};
    pointsBySubtopic=new Map();
    const byId=new Map(points.map(p=>[p.id,p]));
    for(const kv of Object.entries(kg.pointSubtopics||{})){
      const arr=kv[1].map(id=>byId.get(id)).filter(Boolean);
      pointsBySubtopic.set(kv[0],arr);
      subPointCounts[kv[0]]=arr.length;
    }
    sectionAnchors=kg.sectionAnchors;
    subAnchors={};
    Object.keys(subtopics).forEach(s=>{
      const arr=subtopics[s],[cx,cy]=sectionAnchors[s];
      const k=Math.max(1,Math.sqrt(arr.length/9));
      arr.forEach((st,i)=>{const a=(i/arr.length)*Math.PI*2-Math.PI/2;subAnchors[st[0]]=[cx+Math.cos(a)*175*k,cy+Math.sin(a)*118*k]});
    });
    semanticEdges=[];
    // 2. rebuild hook: strips the inline 4CH1 papers/assess edges, fixes the
    //    subject node and the hardcoded subject->sec1..4 hier edges
    window.__KG_APPLY=()=>{
      state.nodes=state.nodes.filter(n=>n.type!=='ExamPaper');
      const subj=state.nodes.find(n=>n.id==='subject');
      if(subj&&kg.subjectLabel){subj.label=kg.subjectLabel;
        if(kg.subjectAnchor){subj.x=kg.subjectAnchor[0];subj.y=kg.subjectAnchor[1];}
        state.homes.set('subject',[subj.x,subj.y]);}
      state.edges=state.edges.filter(e=>e[2]!=='assess');
      const live=new Set(state.nodes.map(n=>n.id));
      state.edges=state.edges.filter(e=>live.has(e[0])&&live.has(e[1]));
      const have=new Set(state.edges.map(e=>e.join('|')));
      Object.keys(sections).forEach(s=>{
        if(!have.has(['subject','sec'+s,'hier'].join('|')))state.edges.push(['subject','sec'+s,'hier']);
      });
    };
    // 3. rebuild through the renderer's own pipeline
    makeBase();
    // 4. reset view state makeBase does not clear (mirrors the reset button)
    state.relationFilters=new Set(['hier','assess']);
    document.querySelectorAll('#relationBar [data-rel]').forEach(x=>x.checked=(x.dataset.rel==='hier'||x.dataset.rel==='assess'));
    state.multiSelect.clear();state.pinned.clear();state.savedViews.length=0;
    state.connectedOnly=false;state.connectedSet=null;state.connectedRoot=null;
    state.trace={active:false,pending:false,from:null,to:null,nodes:[]};
    state.expandedSpecs.clear();state.specMorph.clear();state.revealedOverride.clear();
    state.explorationRevealed.clear();state.explorationHistory.length=0;state.explorationFuture.length=0;
    state.compare={open:false,a:null,b:null};state.selectedEdge=null;state.focused=null;
    state.focusMode=false;state.recommendation=null;state.pathMode=false;state.learningFocus=false;
    state.peekNodeId=null;state.explorationJumping=false;state.keyboardNodeId='subject';state.panelNodeId=null;
    state.view='graph';state.lens='student';state.mode='overview';
    state.typeVisibility=new Set(['Subject','Section','SubTopic','SpecificationPoint','ExamPaper']);
    const panelEl=document.getElementById('panel');if(panelEl)panelEl.classList.remove('show');
    const appEl=document.getElementById('app');if(appEl)appEl.classList.remove('provOpen');
    // 5. camera + render, exactly like the reset button tail
    setView('graph');fitInitial();bootSimulation();draw();
    // 6. course identity: HUD title/subtitle, tab title, curriculum-tree scope
    const meta=kg.meta||{};
    const subtitle=[meta.board,meta.level].filter(Boolean).join(' ')||kg.subjectLabel;
    window.__KG_SUBTITLE=subtitle;
    document.title=kg.subjectLabel+' — Knowledge Graph';
    const hudT=document.querySelector('#hud .title');if(hudT)hudT.textContent=kg.subjectLabel;
    const hudS=document.querySelector('#hud .subtitle');if(hudS)hudS.textContent=subtitle;
    const ts=document.querySelector('.treeScope');
    if(ts)ts.textContent='';
    if(ts){const b1=document.createElement('div');b1.textContent=[meta.board,meta.level,meta.subject].filter(Boolean).join(' ');const b2=document.createElement('div');b2.textContent=kg.points.length+' SpecificationPoints';ts.appendChild(b1);ts.appendChild(b2);}
    window.__KG_STATUS='ready';
    done={type:'syllabai-kg:ready',payload:{course:slug,counts:{nodes:kg.nodes.length,edges:kg.edges.length,
      specPoints:kg.points.length}}};
    post(done.type,done.payload);
  }catch(err){
    window.__KG_STATUS='error: '+String(err&&err.message||err);
    console.error('[kg-loader]',err);
    done={type:'syllabai-kg:error',payload:{course:slug,message:String(err&&err.message||err)}};
    post(done.type,done.payload);
  }
})();
"""


def main() -> int:
    html = SRC.read_text(encoding="utf-8")
    src_sha = hashlib.sha256(html.encode("utf-8")).hexdigest()[:8]
    for old, new, expected in PATCHES:
        n = html.count(old)
        if n != expected:
            print(f"PATCH FAIL ({n} hits, expected {expected}): {old[:60]!r}", file=sys.stderr)
            return 1
        html = html.replace(old, new)
    # insert the loader just before the closing </script> of the main block
    close = html.rfind("</script>")
    if close == -1:
        print("no </script> found", file=sys.stderr)
        return 1
    html = html[:close] + LOADER + "\n" + html[close:]
    # gate: the assembled script must parse (a syntax error would silently
    # kill the whole build — renderer AND loader)
    import pathlib
    import subprocess
    import tempfile
    m = html.rfind("<script>")
    js = html[m + 8:html.find("</script>", m)]
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                     encoding="utf-8") as tf:
        tf.write(js)
        tmp = tf.name
    probe = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    pathlib.Path(tmp).unlink(missing_ok=True)
    if probe.returncode != 0:
        print(f"SYNTAX GATE FAILED:\n{probe.stderr[:800]}", file=sys.stderr)
        return 1
    DST.write_text(html, encoding="utf-8")
    print(f"source v77 sha256[:8]={src_sha}  ->  {DST.name} "
          f"({len(html)} bytes, sha256[:8]={hashlib.sha256(html.encode()).hexdigest()[:8]}) "
          f"[syntax gate ok]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
