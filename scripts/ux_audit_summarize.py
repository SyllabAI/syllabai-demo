#!/usr/bin/env python3
"""Summarize UX audit JSONs (contrast/UX + semantics) across all walked pages."""
import json, glob, os, sys

out_dir = sys.argv[1] if len(sys.argv) > 1 else "work/ux_audit"
files = sorted(glob.glob(os.path.join(out_dir, "*.audit.json")))
for f in files:
    name = os.path.basename(f).replace(".audit.json", "")
    raw = open(f).read().strip()
    try:
        d = json.loads(json.loads(raw)) if raw.startswith('"') else json.loads(raw)
    except Exception as e:
        print(f"{name}: PARSE FAIL {e} raw[:120]={raw[:120]!r}")
        continue
    probs = d.get("problems", [])
    contrast = [p for p in probs if p.get("kind") == "contrast"]
    tiny = [p for p in probs if p.get("kind") == "tiny-font"]
    small = d.get("smallTouchTargets", [])
    ovf = d.get("overflowXPx", 0)
    print(f"\n### {name}: contrast={len(contrast)} tiny={len(tiny)} smallTargets={len(small)} overflowX={ovf}px")
    for p in contrast[:14]:
        print(f"  C {p['ratio']}:1 (need {p['need']}) fs={p['fs']} {p['color']} on {p['bg']} | {p['text'][:48]!r} | {p['path'][:80]}")
    for p in tiny[:6]:
        print(f"  T fs={p['fs']}px | {p['text'][:50]!r}")
    for p in small[:6]:
        print(f"  S {p['w']}x{p['h']} <{p['tag']}> {p['text'][:40]!r}")

    sf = f.replace(".audit.json", ".sem.json")
    if os.path.exists(sf):
        raw = open(sf).read().strip()
        try:
            s = json.loads(json.loads(raw)) if raw.startswith('"') else json.loads(raw)
        except Exception:
            s = {}
        if s.get("h1") is not None:
            n1 = len(s.get("h1", []))
            order = s.get("headingOrder", "")
            skips = []
            prev = 0
            for tok in order.split():
                lvl = int(tok[1]); 
                if prev and lvl - prev > 1: skips.append(f"h{prev}->h{lvl}")
                prev = lvl
            print(f"  SEM h1={n1} {s['h1'][:1] if s.get('h1') else ''} | h-skips={skips[:4]} | genericLinks={len(s.get('genericLinks',[]))} unnamed={len(s.get('unnamedControls',[]))} imgNoAlt={len(s.get('imgsNoAlt',[]))}")
            for g in s.get("genericLinks", [])[:4]: print(f"    GL {g}")
            for u in s.get("unnamedControls", [])[:4]: print(f"    UN {u['html'][:70]}")
            for i in s.get("imgsNoAlt", [])[:4]: print(f"    IA {i}")
