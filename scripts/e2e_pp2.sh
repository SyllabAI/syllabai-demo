#!/usr/bin/env bash
# E2E for PP-VIEWER-2 (sidebar-tree removal + pdf-pane perf rewrite).
# Same atomic pattern as e2e_pp_phase.sh: server lives inside this one call.
set -u
PORT=3100
BASE="http://127.0.0.1:$PORT"
COURSE="igcse-chemistry-19"
PAPER="view/2021-06/4CH1-1C"
SHOTDIR="/home/z/my-project/scripts/e2e-pp"
mkdir -p "$SHOTDIR"
cd /home/z/my-project

start_server() {
  local pids
  pids=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)
  for p in $pids; do kill -9 "$p" 2>/dev/null; done
  pkill -9 -f "standalone/server" 2>/dev/null
  sleep 0.5
  PORT=$PORT setsid nohup node .next/standalone/server.js > /tmp/pp2-standalone.log 2>&1 < /dev/null &
  for i in $(seq 1 15); do
    sleep 1
    curl -s -o /dev/null --max-time 2 "$BASE/login" && return 0
  done
  echo "SERVER_FAILED"; exit 1
}

PHASE="${1:-all}"
start_server

case "$PHASE" in
  panel|all)
    echo "════ PANEL: desktop viewer must have ONE aside (course sidebar) ════"
    agent-browser set viewport 1440 900 >/dev/null 2>&1
    agent-browser open "$BASE/courses/$COURSE/past-papers/$PAPER?doc=qp" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 2500 >/dev/null 2>&1
    agent-browser eval "(() => ({ asides: document.querySelectorAll('aside').length, examQuestionsPanel: [...document.querySelectorAll('aside span')].some(s => s.textContent.trim() === 'Exam Questions'), crumb: document.querySelector('nav[aria-label=Breadcrumbs], nav') ? true : false, h1: document.querySelector('h1')?.textContent?.slice(0, 50) }))()"
    agent-browser screenshot "$SHOTDIR/pp2_01_viewer_no_panel.png" >/dev/null 2>&1

    echo "════ PANEL: interactive player page also panel-free ════"
    agent-browser open "$BASE/courses/$COURSE/past-papers" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 900 >/dev/null 2>&1
    HREF=$(agent-browser eval "(() => { const a = [...document.querySelectorAll('a')].find(l => l.textContent.trim() === 'Interactive'); return a ? a.getAttribute('href') : 'null'; })()" 2>/dev/null | tr -d '"')
    if [ "$HREF" != "null" ] && [ -n "$HREF" ]; then
      agent-browser open "$BASE$HREF" >/dev/null 2>&1
      agent-browser wait --load networkidle >/dev/null 2>&1
      agent-browser wait 900 >/dev/null 2>&1
      agent-browser eval "(() => ({ asides: document.querySelectorAll('aside').length, examQuestionsPanel: [...document.querySelectorAll('aside span')].some(s => s.textContent.trim() === 'Exam Questions'), h1: document.querySelector('h1')?.textContent?.slice(0, 50) }))()"
    else
      echo "no matched interactive link on this course — skip"
    fi

    echo "════ PANEL: mobile drawer on past-papers has NO topic tree ════"
    agent-browser set viewport 390 844 >/dev/null 2>&1
    agent-browser open "$BASE/courses/$COURSE/past-papers" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 800 >/dev/null 2>&1
    agent-browser eval "(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Menu'); if (b) b.click(); return b ? 'clicked' : 'none'; })()" >/dev/null 2>&1
    agent-browser wait 700 >/dev/null 2>&1
    agent-browser eval "(() => { const dlg = document.querySelector('[role=dialog]'); if (!dlg) return { dialog: false }; const topicLinks = [...dlg.querySelectorAll('a')].filter(a => /\\/exam-questions\\//.test(a.getAttribute('href') || '') && !a.getAttribute('href').endsWith('/exam-questions') && !/\\/exam-questions\\/saved$/.test(a.getAttribute('href') || '')); return { dialog: true, drawerTopicLinks: topicLinks.length, navItems: [...dlg.querySelectorAll('a')].length }; })()"
    echo "── contrast: exam-questions drawer SHOULD have the tree ──"
    agent-browser open "$BASE/courses/$COURSE/exam-questions" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 800 >/dev/null 2>&1
    agent-browser eval "(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Menu'); if (b) b.click(); return b ? 'clicked' : 'none'; })()" >/dev/null 2>&1
    agent-browser wait 700 >/dev/null 2>&1
    agent-browser eval "(() => { const dlg = document.querySelector('[role=dialog]'); if (!dlg) return { dialog: false }; const topicLinks = [...dlg.querySelectorAll('a')].filter(a => /\\/exam-questions\\//.test(a.getAttribute('href') || '') && !a.getAttribute('href').endsWith('/exam-questions') && !/\\/exam-questions\\/saved$/.test(a.getAttribute('href') || '')); return { dialog: true, drawerTopicLinks: topicLinks.length }; })()"
    agent-browser set viewport 1440 900 >/dev/null 2>&1
    echo "PHASE_PANEL_DONE"
    ;;
esac

case "$PHASE" in
  perf|all)
    echo "════ PERF: virtualised window + hysteresis ════"
    agent-browser set viewport 1440 900 >/dev/null 2>&1
    agent-browser open "$BASE/courses/$COURSE/past-papers/$PAPER?doc=qp" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 5000 >/dev/null 2>&1
    agent-browser eval "(() => { const cs = [...document.querySelectorAll('canvas')].filter(c => c.width > 100); const ph = [...document.querySelectorAll('[data-page]')]; const sc = ph[0]?.closest('.overflow-y-auto'); return { canvases: cs.length, placeholders: ph.length, styledPlaceholders: ph.filter(p => p.style.height && parseInt(p.style.height) > 100).length, firstCanvas: cs[0]?.style.width, paneBounded: sc ? sc.scrollHeight > sc.clientHeight : null, clientH: sc?.clientHeight }; })()"
    echo "── scroll deep to page 9 (rect-based), canvases must stay capped + indicator moves ──"
    agent-browser eval "(() => { const ph = [...document.querySelectorAll('[data-page]')]; const sc = ph[0]?.closest('.overflow-y-auto'); const r = ph[8].getBoundingClientRect(), sr = sc.getBoundingClientRect(); sc.scrollTop += r.top - sr.top - 40; return { scrolledTo: sc.scrollTop, scrollable: sc.scrollHeight > sc.clientHeight }; })()"
    agent-browser wait 1200 >/dev/null 2>&1
    agent-browser eval "(() => { const holders = [...document.querySelectorAll('[data-page]')]; const withCanvas = holders.filter(h => h.querySelector('canvas')).map(h => Number(h.dataset.page)); const ind = document.querySelector('.font-mono.tabular-nums')?.textContent; return { withCanvas, count: withCanvas.length, indicator: ind }; })()"
    echo "── sweep: after idle, canvases outside ±6 of indicator are freed ──"
    agent-browser wait 700 >/dev/null 2>&1
    agent-browser eval "(() => { const holders = [...document.querySelectorAll('[data-page]')]; const withCanvas = holders.filter(h => h.querySelector('canvas')).map(h => Number(h.dataset.page)); const ind = parseInt(document.querySelector('.font-mono.tabular-nums')?.textContent || '0'); const maxDist = Math.max(...withCanvas.map(n => Math.abs(n - ind))); return { withCanvas, indicator: ind, maxDistFromCenter: maxDist, hysteresisOK: maxDist <= 6 }; })()"
    agent-browser screenshot "$SHOTDIR/pp2_02_deep_scroll.png" >/dev/null 2>&1
    echo "── scroll back to page 2 — indicator must follow, window re-renders ──"
    agent-browser eval "(() => { const ph = [...document.querySelectorAll('[data-page]')]; const sc = ph[0]?.closest('.overflow-y-auto'); const r = ph[1].getBoundingClientRect(), sr = sc.getBoundingClientRect(); sc.scrollTop += r.top - sr.top - 20; return 'at-page-2'; })()"
    agent-browser wait 1400 >/dev/null 2>&1
    agent-browser eval "(() => { const holders = [...document.querySelectorAll('[data-page]')]; const withCanvas = holders.filter(h => h.querySelector('canvas')).map(h => Number(h.dataset.page)); return { withCanvas, indicator: document.querySelector('.font-mono.tabular-nums')?.textContent }; })()"

    echo "════ PERF: zoom — no blank flash, size grows, scroll preserved ════"
    SCROLL_BEFORE=$(agent-browser eval "(() => document.querySelector('[data-page]')?.closest('.overflow-y-auto')?.scrollTop)" 2>/dev/null | tr -d '"')
    agent-browser eval "(() => { const b = document.querySelector('button[aria-label=\"Zoom in\"]'); b.click(); return 'zoomed'; })()" >/dev/null 2>&1
    agent-browser wait 250 >/dev/null 2>&1
    agent-browser eval "(() => { const cs = [...document.querySelectorAll('canvas')].filter(c => c.width > 100); return { canvasesDuringZoom: cs.length, note: 'old canvases must remain visible mid-refit' }; })()"
    agent-browser wait 1800 >/dev/null 2>&1
    agent-browser eval "(() => { const cs = [...document.querySelectorAll('canvas')].filter(c => c.width > 100); const sc = document.querySelector('[data-page]')?.closest('.overflow-y-auto'); const ind = document.querySelector('.font-mono.tabular-nums')?.textContent; return { canvasCssWidth: cs[0]?.style.width, canvases: cs.length, scrollTopNow: sc?.scrollTop, indicator: ind }; })()"
    echo "(scrollBefore=$SCROLL_BEFORE — should be comparable after refit)"
    agent-browser eval "(() => { const b = document.querySelector('button[aria-label="Reset to fit width"]'); if (b) b.click(); return b ? 'reset' : 'none'; })()" >/dev/null 2>&1
    agent-browser wait 1200 >/dev/null 2>&1
    agent-browser eval "(() => ({ backToFit: [...document.querySelectorAll('canvas')].filter(c => c.width > 100)[0]?.style.width }))()"
    agent-browser screenshot "$SHOTDIR/pp2_03_after_zoom.png" >/dev/null 2>&1

    echo "════ PERF: doc persistence across QP⇄MS toggles (no re-fetch) ════"
    agent-browser open "$BASE/courses/$COURSE/past-papers/$PAPER?doc=qp" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 4500 >/dev/null 2>&1
    agent-browser eval "(() => { const holders = [...document.querySelectorAll('[data-page]')]; const withCanvas = holders.filter(h => h.querySelector('canvas')).length; const pane = holders[0]?.closest('div[class*=rounded-lg]'); const sc = holders[0]?.closest('.overflow-y-auto'); sc.scrollTop = 300; return { qpCanvases: withCanvas, scrolledTo: sc.scrollTop }; })()"
    agent-browser find text "Mark scheme" click >/dev/null 2>&1
    agent-browser wait 4500 >/dev/null 2>&1
    agent-browser eval "(() => { const spans = [...document.querySelectorAll('span')]; const msPane = spans.find(s => s.textContent.startsWith('Mark scheme —'))?.closest('div[class*=rounded-lg]'); const msCanvases = msPane ? msPane.querySelectorAll('canvas').length : -1; return { msCanvasesAfterSwitch: msCanvases }; })()"
    agent-browser find text "Question paper" click >/dev/null 2>&1
    agent-browser wait 600 >/dev/null 2>&1
    agent-browser eval "(() => { const spans = [...document.querySelectorAll('span')]; const qpPane = spans.find(s => s.textContent.startsWith('Question paper —'))?.closest('div[class*=rounded-lg]'); const holders = qpPane ? [...qpPane.querySelectorAll('[data-page]')] : []; const withCanvas = holders.filter(h => h.querySelector('canvas')).length; const sc = qpPane?.querySelector('.overflow-y-auto'); return { qpCanvasesInstantlyBack: withCanvas, scrollKept: sc?.scrollTop, loadingSpinner: qpPane?.textContent.includes('Loading') }; })()"
    agent-browser screenshot "$SHOTDIR/pp2_04_toggle_kept.png" >/dev/null 2>&1
    echo "── console errors? ──"
    agent-browser console 2>/dev/null | tail -5
    echo "PHASE_PERF_DONE"
    ;;
esac
