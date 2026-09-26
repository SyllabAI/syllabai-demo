#!/usr/bin/env python3
"""build_kg_loader_fork.py — produce public/kg/openhuman-course-explorer.html.

The fork is a copy of the byte-faithful v77 build with:
  1. eight `const` -> `var` patches on the module data tables (so the loader
     can swap them at runtime),
  2. one hook line in makeBase()'s tail + one appended loader block that
     reads ?course=<slug>, fetches /kg/data/<slug>.json, validates it against
     GRAPH_CONTRACT v1.0, swaps the tables and rebuilds through the
     renderer's own makeBase() -> fitInitial() -> bootSimulation() pipeline,
     and
  3. per-subject node icon packs (T-KG-3): KG_ICON_EXTRA paths + packs + a
     topicIconKey dispatcher. With no pack active the original chemistry
     table runs unchanged; the loader activates the course's pack before the
     first draw. Chemistry pack == original table (golden-gated).
  4. P14 passthrough subtopic collapse: course data whose spec has no
     subtopic layer (e.g. IGCSE Maths B) is exported with one synthetic
     subtopic per section duplicating the section label; the loader collapses
     those and attaches the points directly to the Section node (graph,
     tree, drawer, search, keyboard all support section-attached points).

Gates: node --check (syntax) + kg_icon_gate.js (typo guard, chemistry
snapshot, subject->family coverage).

Without ?course= the build behaves exactly like v77 (inline 4CH1 dataset).

Run from the repo root:  python3 scripts/build_kg_loader_fork.py
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kg_icon_packs import BEGIN, END, FAMILY_MAP, PACKS, emit_js  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "public" / "kg" / "v77-regression-fixes.html"
DST = REPO / "public" / "kg" / "openhuman-course-explorer.html"
GATE = REPO / "scripts" / "kg_icon_gate.js"
DATA = REPO / "public" / "kg" / "data"
CANONICAL = DATA / "canonicalKG.edexcel-chemistry-4ch1.json"

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
    # --- per-subject icon packs (T-KG-3) -------------------------------------
    # P1: rename the original resolver + inject packs/resolver before it
    ("function topicIconKey(n){",
     emit_js() + "\nfunction chemIconKey(n){", 1),
    # P2: dispatcher — original body stays as chemIconKey, public name routes
    (" return n.type==='SubTopic'?'topic':'atom';\n}",
     " return n.type==='SubTopic'?'topic':'atom';\n}"
     "\nfunction topicIconKey(n){return (__kgPackState&&__kgPackState.pack)?kgPackIconKey(n):chemIconKey(n);}", 1),
    # P3: icon() falls back to the extra per-subject path library
    (" g.innerHTML=paths[kind]||paths.topic;return g;",
     " g.innerHTML=paths[kind]||KG_ICON_EXTRA[kind]||paths.topic;return g;", 1),
    # --- applicability chips (T-KG-17c) ---------------------------------------
    # P4: panel DOM gains a chips container under the statement
    ("<div class=\"section\">Specification statement</div><div id=\"statement\" class=\"quote meta\"></div><div class=\"section\">Connections</div>",
     "<div class=\"section\">Specification statement</div><div id=\"statement\" class=\"quote meta\"></div><div id=\"apChips\" style=\"margin-top:7px\"></div><div class=\"section\">Connections</div>", 1),
    # P5: renderer contract boundary carries applicability
    ("pointId:base.pointId||null,statement:base.statement||null,section:base.section||null",
     "pointId:base.pointId||null,statement:base.statement||null,applicability:base.applicability||null,section:base.section||null", 1),
    # P6/P7: both SpecificationPoint node-creation sites pass the field through
    ("add({id:'p:'+pt.id,pointId:pt.id,type:'SpecificationPoint',label:pt.id,statement:pt.text,section:sec,subtopic:st[1],x:px,y:py,localX:ox,localY:oy,rx:8});",
     "add({id:'p:'+pt.id,pointId:pt.id,type:'SpecificationPoint',label:pt.id,statement:pt.text,applicability:pt.applicability||null,section:sec,subtopic:st[1],x:px,y:py,localX:ox,localY:oy,rx:8});", 1),
    ("state.nodes.push({id:'p:'+p.id,pointId:p.id,type:'SpecificationPoint',label:p.id,statement:p.text,section:def[0][0],subtopic:def[1],x,y,homeX:x,homeY:y,localX:ox,localY:oy,vx:0,vy:0})})}",
     "state.nodes.push({id:'p:'+p.id,pointId:p.id,type:'SpecificationPoint',label:p.id,statement:p.text,applicability:p.applicability||null,section:def[0][0],subtopic:def[1],x,y,homeX:x,homeY:y,localX:ox,localY:oy,vx:0,vy:0})})}", 1),
    # P8: panel paints the chips whenever a spec point carries applicability
    (" document.getElementById('statement').textContent=n.statement||n.meta||'Curriculum structure node.';",
     " document.getElementById('statement').textContent=n.statement||n.meta||'Curriculum structure node.';\n const apEl=document.getElementById('apChips');if(apEl)apEl.innerHTML=(n.type==='SpecificationPoint'&&n.applicability)?kgApplicabilityChips(n.applicability):'';", 1),
    # P9/P10: subject-agnostic panel text — v77 hardcoded 'Chemistry' in the
    # crumb and the why-evidence line; the loader publishes the real subject
    # label and these fall back to the v77 wording only without ?course=
    ("const ctx=n.pointId?`Chemistry · Section ${n.section} · ${n.subtopic}`:(n.type==='Subject'?'International GCSE Chemistry':`Section ${n.section||''}`);",
     "const ctx=n.pointId?`${window.__KG_SUBJECT_LABEL||'Chemistry'} · Section ${n.section} · ${n.subtopic}`:(n.type==='Subject'?(window.__KG_SUBJECT_LABEL||'International GCSE Chemistry'):`Section ${n.section||''}`);", 1),
    ("<div>• This node is part of the official Chemistry specification.</div>",
     "<div>• This node is part of the official '+(window.__KG_SUBJECT_LABEL||'Chemistry')+' specification.</div>", 1),
    # P11-P13: subject-agnostic crumbs — the search-result rows, the tutor
    # action card and the learning-surface "Current curriculum" line still
    # hardcoded 'Chemistry' after P9/P10 (surfaced as "Maths B shows Chemistry
    # breadcrumbs"); same guard pattern, v77 wording without ?course=
    ("const l=learner(target||n),crumb=(target?.pointId?`Chemistry · Section ${target.section} · ${target.subtopic}`:`Chemistry · ${n.label}`);",
     "const l=learner(target||n),crumb=(target?.pointId?`${window.__KG_SUBJECT_LABEL||'Chemistry'} · Section ${target.section} · ${target.subtopic}`:`${window.__KG_SUBJECT_LABEL||'Chemistry'} · ${n.label}`);", 1),
    ("<b>Current curriculum</b><br>${n.pointId?`Chemistry · Section ${n.section} · ${n.subtopic}`:n.label}</div>",
     "<b>Current curriculum</b><br>${n.pointId?`${window.__KG_SUBJECT_LABEL||'Chemistry'} · Section ${n.section} · ${n.subtopic}`:n.label}</div>", 1),
    ("const crumb=n.pointId?`Chemistry · Section ${n.section} · ${n.subtopic}`:(n.type==='SubTopic'?`Chemistry · Section ${n.section}`:'Chemistry');",
     "const crumb=n.pointId?`${window.__KG_SUBJECT_LABEL||'Chemistry'} · Section ${n.section} · ${n.subtopic}`:(n.type==='SubTopic'?`${window.__KG_SUBJECT_LABEL||'Chemistry'} · Section ${n.section}`:(window.__KG_SUBJECT_LABEL||'Chemistry'));", 1),
    # --- P14: passthrough subtopic collapse (Maths B flat-spec fix) ----------
    # Specs with no subtopic layer (IGCSE Maths B: 10 topics, IAL Physics, all
    # IAL Maths modules, ICT, Business, Further Maths, ...) were exported with
    # exactly one synthetic subtopic per section whose label repeats the
    # section label — a meaningless middle hop in the graph. The loader now
    # collapses those and attaches their points directly to the Section node.
    # Rule precision (verified against all 49 exported courses): collapse iff
    # a section has exactly one subtopic AND the subtopic label equals the
    # section label (case/space-insensitive). Single-sub sections whose name
    # differs (modular science part-buckets "Physical chemistry: Part" ->
    # "Energetics") carry real information and are kept (5 across the corpus).
    # Inline chemistry (no ?course=) has sectionPoints=={} -> zero effect.
    # P14a: module table for section-attached points
    ("var pointsBySubtopic=new Map();",
     "var pointsBySubtopic=new Map();var sectionPoints={};", 1),
    # P14b: makeBase creates points around the section anchor for collapsed
    # sections (subtopic field carries the section label so every crumb
    # template renders "Subject · Section N · Label" unchanged)
    ("   });\n });\n state.edges.push(['subject','sec1','hier']",
     "   });\n });\n Object.keys(sectionPoints).forEach(sec=>{\n   const pts=sectionPoints[sec]||[];\n   pts.forEach((pt,j)=>{\n     const [cx,cy]=sectionAnchors[sec]||[750,420];\n     const [ox,oy]=makePointOffset(j,pts.length);\n     add({id:'p:'+pt.id,pointId:pt.id,type:'SpecificationPoint',label:pt.id,statement:pt.text,applicability:pt.applicability||null,section:sec,subtopic:sections[sec]?sections[sec].label:pt.id,x:cx+ox,y:cy+oy,localX:ox,localY:oy,rx:8});\n   });\n });\n state.edges.push(['subject','sec1','hier']", 1),
    # P14c: makeBase edges — section -> point hier edges for attached points
    (" }));\n for(const sec of ['1','2','3','4']){",
     " }));\n Object.keys(sectionPoints).forEach(sec=>(sectionPoints[sec]||[]).forEach(pt=>state.edges.push(['sec'+sec,'p:'+pt.id,'hier'])));\n for(const sec of ['1','2','3','4']){", 1),
    # P14d: parentSubtopicId — collapsed points resolve to their Section id
    # (state.expanded on the Section then gates reveal uniformly)
    ("function parentSubtopicId(n){return n.type==='SpecificationPoint'?subtopics[n.section]?.find(st=>st[1]===n.subtopic)?.[0]:null}",
     "function parentSubtopicId(n){if(n.type!=='SpecificationPoint')return null;const sid=subtopics[n.section]?.find(st=>st[1]===n.subtopic)?.[0];return sid||('sec'+n.section)}", 1),
    # P14e1: expandScopeNode — Section/Subject scope gains attached points
    ("function expandScopeNode(n){\n const defs=scopeSubtopics(n);if(!defs.length)return;",
     "function expandScopeNode(n){\n const defs=scopeSubtopics(n);\n const isSec=n.type==='Section',isSubj=n.type==='Subject';\n const attIds=isSec?(sectionPoints[n.section]||[]).map(pt=>'p:'+pt.id):(isSubj?Object.keys(sectionPoints).flatMap(sec=>(sectionPoints[sec]||[]).map(pt=>'p:'+pt.id)):[]);\n if(!defs.length&&!attIds.length)return;", 1),
    # P14e2: toggle semantics — a section counts as expanded when its own id
    # is in state.expanded; attached points reveal/collapse with the scope
    (" const subIds=defs.map(def=>def[0]);\n const allExpanded=subIds.every(id=>state.expanded.has(id));\n const pointIds=defs.flatMap(def=>pointsForSub(def).map(pt=>'p:'+pt.id)).filter(pid=>nodeBy().has(pid));",
     " const subIds=defs.map(def=>def[0]);\n const pointIds=defs.flatMap(def=>pointsForSub(def).map(pt=>'p:'+pt.id)).concat(attIds).filter(pid=>nodeBy().has(pid));\n const scopeKeys=isSec?[n.id]:(isSubj?Object.keys(sections).map(sec=>'sec'+sec):[]);\n const allExpanded=subIds.every(id=>state.expanded.has(id))&&(!attIds.length||scopeKeys.every(k=>state.expanded.has(k)));\n const secOfPid={};Object.keys(sectionPoints).forEach(sec=>(sectionPoints[sec]||[]).forEach(pt=>{secOfPid['p:'+pt.id]=sec}));\n const attReveal=attIds.filter(pid=>{const sk='sec'+secOfPid[pid];return sk&&!state.expanded.has(sk)});", 1),
    # P14e3: reveal pass includes newly-scoped attached points
    ("   });\n   if(revealIds.length)revealNodesAnimated(revealIds);else refresh();\n }\n}\nfunction expandNode(id){",
     "   });\n   attReveal.forEach(pid=>{if(!revealIds.includes(pid))revealIds.push(pid)});\n   if(revealIds.length)revealNodesAnimated(revealIds);else refresh();\n }\n}\nfunction expandNode(id){", 1),
    # P14f: ensurePoints — (a) lazy re-create of section-attached points after
    # an animated collapse; (b) latent fix: the subtopic path derived the
    # node's section from def[0][0] (first CHAR of the sub id), wrong for
    # two-digit sections (10a -> '1'); it now resolves the owning section key
    ("function ensurePoints(subId){const n=nodeBy().get(subId);if(!n)return;const def=Object.values(subtopics).flat().find(x=>x[0]===subId);if(!def)return;const pts=pointsForSub(def);const map=nodeBy();pts.forEach((p,i)=>{if(map.has('p:'+p.id))return;const [x,y]=makePointPlacement(def[0][0],subId,i,pts.length);const [ox,oy]=makePointOffset(i,pts.length);state.nodes.push({id:'p:'+p.id,pointId:p.id,type:'SpecificationPoint',label:p.id,statement:p.text,applicability:p.applicability||null,section:def[0][0],subtopic:def[1],x,y,homeX:x,homeY:y,localX:ox,localY:oy,vx:0,vy:0})})}",
     "function ensurePoints(subId){const n=nodeBy().get(subId);if(!n)return;const def=Object.values(subtopics).flat().find(x=>x[0]===subId);const map=nodeBy();if(def){const sec=Object.keys(subtopics).find(k=>subtopics[k].some(x=>x[0]===subId))||n.section;const pts=pointsForSub(def);pts.forEach((p,i)=>{if(map.has('p:'+p.id))return;const [x,y]=makePointPlacement(def[0][0],subId,i,pts.length);const [ox,oy]=makePointOffset(i,pts.length);state.nodes.push({id:'p:'+p.id,pointId:p.id,type:'SpecificationPoint',label:p.id,statement:p.text,applicability:p.applicability||null,section:sec,subtopic:def[1],x,y,homeX:x,homeY:y,localX:ox,localY:oy,vx:0,vy:0})});return}if(n.type!=='Section')return;const sec=n.section;const pts=sectionPoints[sec]||[];pts.forEach((p,i)=>{if(map.has('p:'+p.id))return;const [cx,cy]=sectionAnchors[sec]||[n.x,n.y];const [ox,oy]=makePointOffset(i,pts.length);state.nodes.push({id:'p:'+p.id,pointId:p.id,type:'SpecificationPoint',label:p.id,statement:p.text,applicability:p.applicability||null,section:sec,subtopic:sections[sec]?sections[sec].label:p.id,x:cx+ox,y:cy+oy,homeX:cx+ox,homeY:cy+oy,localX:ox,localY:oy,vx:0,vy:0})})}", 1),
    # P14g: curriculum tree — collapsed sections list their points flat under
    # the section card; the head toggles graph-side reveal too
    ("   head.onclick=()=>{const ids=subsIds(sec); const all=ids.every(id=>state.expanded.has(id)); if(all){ids.forEach(id=>state.expanded.delete(id))}else{ids.forEach(id=>state.expanded.add(id));ids.forEach(id=>ensurePoints(id))}; renderTree(); refresh()};\n   card.append(head,children);wrap.appendChild(card);",
     "   const att=sectionPoints[sec.section]||[];\n   const attIds=att.map(pt=>'p:'+pt.id);\n   if(att.length){\n     const pts=document.createElement('div');pts.className='treePoints';pts.style.display='block';\n     att.map(pt=>map.get('p:'+pt.id)).filter(Boolean).sort((a,b)=>String(a.pointId).localeCompare(String(b.pointId),undefined,{numeric:true})).forEach(ptn=>{\n       const pr=document.createElement('div');pr.className='treePoint';\n       const l=learner(ptn);if(l)pr.classList.add('measured');\n       const badge=document.createElement('span');badge.className='treeBadge';badge.textContent=l?(l.reviewDue?'REVIEW':l.misconception?'SIGNAL':l.mastery!=null?`${l.mastery}%`:'MEASURED'):'NOT MEASURED';\n       const pb=document.createElement('button');pb.type='button';pb.id=`tree-node-${ptn.id}`;pb.setAttribute('role','treeitem');pb.setAttribute('aria-label',`${ptn.pointId||''} · ${ptn.label}`);pb.textContent=`${ptn.pointId} · ${ptn.label}`;pb.onclick=()=>{state.keyboardNodeId=ptn.id;setView('graph');selectNode(ptn.id,{open:true,center:false})};\n       pr.append(badge,pb);pts.appendChild(pr);\n     });\n     children.appendChild(pts);\n   }\n   head.onclick=()=>{const ids=subsIds(sec); const all=ids.every(id=>state.expanded.has(id))&&(!attIds.length||state.expanded.has(sec.id)); if(all){ids.forEach(id=>state.expanded.delete(id));if(attIds.length)state.expanded.delete(sec.id)}else{ids.forEach(id=>state.expanded.add(id));ids.forEach(id=>ensurePoints(id));if(attIds.length){state.expanded.add(sec.id);ensurePoints(sec.id)}}; renderTree(); refresh()};\n   card.append(head,children);wrap.appendChild(card);", 1),
    # P14h: keyboard descent — a sub-less Section yields its attached points
    ("if(n.type==='Section')return state.nodes.filter(x=>x.type==='SubTopic'&&x.section===n.section&&visibleForMode(x));",
     "if(n.type==='Section'){const subs=state.nodes.filter(x=>x.type==='SubTopic'&&x.section===n.section&&visibleForMode(x));if(subs.length)return subs;return state.nodes.filter(x=>x.type==='SpecificationPoint'&&parentSubtopicId(x)===n.id&&visibleForMode(x))}", 1),
    # P14i: breadcrumbs — hierarchyPath pushes parentSubtopicId(n) as the
    # "sub" hop, but for section-attached points (P14d fallback) that id IS
    # the section, so the section label rendered twice
    # ("Physics/Mechanics/Mechanics/7"). Skip the hop when it resolves to a
    # Section node; real SubTopic hops in kept/multi-sub courses are untouched.
    ("   const sub=map.get(parentSubtopicId(n)); if(sub)out.push(sub);",
     "   const sub=map.get(parentSubtopicId(n)); if(sub&&sub.type!=='Section')out.push(sub);", 1),
]

HELPERS = """
// ============================================================================
// applicability chips (T-KG-17c) — the canonical papers/unit/tier/coursework
// homes rendered in the node detail panel. Values are the kg_export.py
// verbatim passthrough of the T-KG-16 canonical applicability object; the
// only presentation rules are cosmetic and mirror the Next.js spec explorer
// ("1C" -> "Paper 1C", "U1" -> "Unit 1", "U1F" -> "Unit 1 (Foundation)").
// Absent applicability -> no chips (58 SX-front-matter-style rows stay null
// by design). Zero invention: nothing here derives or mutates data.
// ============================================================================
function kgPaperLabel(p){return p.length<=4?('Paper '+p):p;}
function kgUnitLabel(u){const m=/^U(\\d+)([FH])?$/.exec(u);if(!m)return u;const t=m[2]==='F'?' (Foundation)':m[2]==='H'?' (Higher)':'';return 'Unit '+m[1]+t;}
function kgApplicabilityChips(a){
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const chip=t=>'<span class="chip">'+t+'</span>';
  const out=[];
  for(const p of (a.papers||[]))out.push(chip(esc(kgPaperLabel(p))));
  if(a.unit_scope)out.push(chip(esc(kgUnitLabel(a.unit_scope))));
  if(a.tier)out.push(chip(esc(a.tier)));
  if(a.coursework)out.push(chip('Coursework (internally assessed)'));
  if(a.double_award_shared)out.push(chip('Also in Double Award'));
  if(!out.length)return '';
  const tip=a.rule?esc(a.rule):'Printed assessment home from the Pearson specification (content summaries and assessment overviews).';
  return '<div style="font-size:8px;text-transform:uppercase;letter-spacing:.3px;color:#7b8386;margin-bottom:1px">Assessed in</div>'+out.join('')+'<div style="margin-top:4px;font-size:8px;line-height:1.5;color:#7b8386">'+tip+'</div>';
}
"""

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
    // P14: collapse synthesized passthrough subtopics — some exported specs
    // have no subtopic layer (e.g. IGCSE Maths B: 10 topics, spec points
    // hanging straight off each topic), and kg_export.py then emits exactly
    // one subtopic per section whose label repeats the section label. That is
    // a meaningless middle hop — collapse it and attach the points directly
    // to the Section node (makeBase renders them around the section anchor;
    // parentSubtopicId/expandScopeNode/ensurePoints/childrenOf all understand
    // section-attached points). Single-sub sections whose name DIFFERS from
    // the section label (modular science part-buckets like "Physical
    // chemistry: Part" -> "Energetics") carry real information and are kept.
    sectionPoints={};
    Object.keys(subtopics).forEach(sec=>{
      const arr=subtopics[sec];
      if(arr.length!==1)return;
      const secLabel=sections[sec]&&sections[sec].label!=null?String(sections[sec].label):'';
      if(!secLabel||String(arr[0][1]).trim().toLowerCase()!==secLabel.trim().toLowerCase())return;
      sectionPoints[sec]=(pointsBySubtopic.get(arr[0][0])||[]).slice();
      pointsBySubtopic.delete(arr[0][0]);
      delete subPointCounts[arr[0][0]];
      subtopics[sec]=[];
    });
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
    // 2.5 subject icon pack: resolve the family (strand-aware for Science)
    //     and activate BEFORE the first draw so node icons render per subject
    if(window.kgSetIconPack)kgSetIconPack(kgIconFamily((kg.meta||{}).subject,slug));
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
    // the static placeholder is a v77 chemistry-ism — rebrand per course
    const se=document.getElementById('search');if(se)se.placeholder='Search '+(kg.subjectLabel||'').toLowerCase()+', topics, specification points...';
    window.__KG_SUBJECT_LABEL=kg.subjectLabel;
    const ts=document.querySelector('.treeScope');
    if(ts)ts.textContent='';
    if(ts){const b1=document.createElement('div');b1.textContent=[meta.board,meta.level,meta.subject].filter(Boolean).join(' ');const b2=document.createElement('div');b2.textContent=kg.points.length+' SpecificationPoints';ts.appendChild(b1);ts.appendChild(b2);}
    window.__KG_STATUS='ready';
    // counts reflect the RENDERED graph (passthrough subtopics collapsed):
    // nodes = subject + sections + remaining subs + every spec point;
    // edges = subject->sec + sec->sub + node->point (hier only, no assess)
    const nSubs=Object.values(subtopics).reduce((a,b)=>a+b.length,0);
    done={type:'syllabai-kg:ready',payload:{course:slug,counts:{nodes:1+Object.keys(sections).length+nSubs+kg.points.length,
      edges:Object.keys(sections).length+nSubs+kg.points.length,specPoints:kg.points.length}}};
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
    # insert the chips helpers + loader just before the closing </script>
    close = html.rfind("</script>")
    if close == -1:
        print("no </script> found", file=sys.stderr)
        return 1
    html = html[:close] + HELPERS + LOADER + "\n" + html[close:]
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
    # gate 2: semantic icon gate (typo guard, chemistry golden snapshot,
    # subject->family coverage) — the fork must not change icon behaviour for
    # chemistry and must resolve every exported subject to a pack
    subjects = build_subject_cases()
    DST.write_text(html, encoding="utf-8")
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                     encoding="utf-8") as tf:
        json.dump(subjects, tf)
        subj_tmp = tf.name
    gate = subprocess.run(["node", str(GATE), str(DST), str(CANONICAL),
                           subj_tmp], capture_output=True, text=True)
    pathlib.Path(subj_tmp).unlink(missing_ok=True)
    sys.stdout.write(gate.stdout)
    if gate.returncode != 0:
        sys.stdout.flush()
        print(f"ICON GATE FAILED:\n{gate.stderr[:1200]}", file=sys.stderr)
        return 1
    print(f"source v77 sha256[:8]={src_sha}  ->  {DST.name} "
          f"({len(html)} bytes, sha256[:8]={hashlib.sha256(html.encode()).hexdigest()[:8]}) "
          f"[syntax + icon gates ok]")
    return 0


def build_subject_cases() -> list:
    """[subject, slug, expected_family] for every exported course + probes."""
    cases = []
    for f in sorted(DATA.glob("*.json")):
        if f.name == "index.json" or "canonicalKG" in f.name:
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        meta = d.get("meta", {})
        subj = str(meta.get("subject"))
        slug = str(meta.get("course") or f.stem)
        cases.append([subj, slug, expected_family(subj, slug)])
    # probes: science strand resolution + unknown-subject degradation
    cases += [
        ["Science", "igcse-science-double-award-17-biology", "biology"],
        ["Science", "igcse-science-double-award-17-chemistry", "chemistry"],
        ["Science", "igcse-science-double-award-17-physics", "physics"],
        ["Science", "igcse-science-double-award-17", "science"],
        ["Science", "igcse-science-double-award-modular-24-biology-unit-1", "biology"],
        ["Science", "igcse-science-double-award-modular-24-physics-unit-2", "physics"],
        ["History", "future-history-1", "neutral"],
        ["", "no-meta", "neutral"],
    ]
    return cases


def expected_family(subject: str, slug: str) -> str:
    s = (subject or "").strip().lower()
    if s == "science":
        m = re.search(r"(biology|chemistry|physics)", slug or "")
        return m.group(1) if m else "science"
    return FAMILY_MAP.get(s, "neutral")


if __name__ == "__main__":
    sys.exit(main())
