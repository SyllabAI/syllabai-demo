#!/usr/bin/env bash
# Atomic E2E phase runner: standalone server + agent-browser steps in ONE call
# (the sandbox reaps background processes between tool calls, so the server
# must live only inside each call; agent-browser's own daemon persists).
set -u
PORT=3100
BASE="http://127.0.0.1:$PORT"
cd /home/z/my-project

start_server() {
  # kill by port (process renames itself "next-server", pkill -f misses it)
  local pids
  pids=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)
  for p in $pids; do kill -9 "$p" 2>/dev/null; done
  pkill -9 -f "standalone/server" 2>/dev/null
  sleep 0.5
  PORT=$PORT setsid nohup node .next/standalone/server.js > /tmp/pp-standalone.log 2>&1 < /dev/null &
  for i in $(seq 1 15); do
    sleep 1
    curl -s -o /dev/null --max-time 2 "$BASE/login" && return 0
  done
  echo "SERVER_FAILED"; exit 1
}

PHASE="$1"
SHOTDIR="/home/z/my-project/scripts/e2e-pp"
mkdir -p "$SHOTDIR"

start_server

case "$PHASE" in
  landing)
    agent-browser open "$BASE/courses/igcse-chemistry-19/past-papers" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 1200 >/dev/null 2>&1
    echo "── nav item ──"
    agent-browser snapshot -i 2>/dev/null | grep -E 'link "Past Papers"'
    echo "── sessions ──"
    agent-browser eval "(() => { const hs = [...document.querySelectorAll('section[aria-label] h2')]; return hs.map(h => h.textContent.trim()).slice(0, 20); })()"
    echo "── row buttons (first session) ──"
    agent-browser eval "(() => { const ul = document.querySelector('section[aria-label] ul'); const btns = [...ul.querySelectorAll('a, button')].map(b => b.textContent.trim()).filter(Boolean); return btns.slice(0, 14); })()"
    echo "── counts ──"
    agent-browser eval "(() => { const rows = document.querySelectorAll('section[aria-label] ul li').length; const badge = document.querySelector('header')?.textContent?.match(/\\d+ papers · \\d+ sessions[^)]*/)?.[0]; return { rows, badge }; })()"
    agent-browser screenshot "$SHOTDIR/local_01_landing.png" >/dev/null 2>&1
    echo "PHASE_LANDING_DONE"
    ;;
  viewer)
    # QP viewer: pdf.js must render canvases
    agent-browser open "$BASE/courses/igcse-chemistry-19/past-papers/view/2021-06/4CH1-1C?doc=qp" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 4500 >/dev/null 2>&1
    echo "── header ──"
    agent-browser eval "(() => document.querySelector('h1')?.textContent)" 
    echo "── pdf canvases + toolbar ──"
    agent-browser eval "(() => { const canvases = [...document.querySelectorAll('canvas')].filter(c => c.width > 100 && c.height > 100); const toolbar = document.querySelector('[class*=toolbar], .border-b')?.textContent?.slice(0, 80); const pages = document.querySelectorAll('[data-page]').length; return { canvases: canvases.length, firstSize: canvases[0] ? canvases[0].width + 'x' + canvases[0].height : null, toolbarLabel: toolbar, pagePlaceholders: pages }; })()"
    echo "── pane label ──"
    agent-browser eval "(() => [...document.querySelectorAll('span')].find(s => s.textContent.startsWith('Question paper —'))?.textContent)"
    agent-browser screenshot "$SHOTDIR/local_02_viewer_qp.png" >/dev/null 2>&1
    echo "PHASE_VIEWER_DONE"
    ;;
  split)
    agent-browser open "$BASE/courses/igcse-chemistry-19/past-papers/view/2021-06/4CH1-1C?doc=split" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 5000 >/dev/null 2>&1
    echo "── split panes ──"
    agent-browser eval "(() => { const labels = [...document.querySelectorAll('span')].filter(s => /^(Question paper|Mark scheme) —/.test(s.textContent)).map(s => s.textContent.slice(0, 40)); const visibleCanvases = [...document.querySelectorAll('canvas')].filter(c => { const r = c.getBoundingClientRect(); return r.width > 100 && c.offsetParent !== null; }); const grids = [...document.querySelectorAll('div')].filter(d => d.className.includes('lg:grid-cols-2')).length; return { labels, visibleCanvases: visibleCanvases.length, splitGrids: grids }; })()"
    agent-browser screenshot "$SHOTDIR/local_03_split.png" >/dev/null 2>&1
    echo "PHASE_SPLIT_DONE"
    ;;
  mock)
    agent-browser open "$BASE/courses/igcse-chemistry-19/past-papers/view/2021-06/4CH1-1C?mode=mock" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 800 >/dev/null 2>&1
    echo "── intro: official duration ──"
    agent-browser eval "(() => { const t = document.body.textContent; return { official: t.includes('Official duration'), twoHours: /2h/.test(t), timerInput: !!document.getElementById('mock-duration'), beginBtn: !![...document.querySelectorAll('button')].find(b => b.textContent.includes('Begin mock')) }; })()"
    agent-browser screenshot "$SHOTDIR/local_04_mock_intro.png" >/dev/null 2>&1
    # begin
    agent-browser find text "Begin mock" click >/dev/null 2>&1
    agent-browser wait 2500 >/dev/null 2>&1
    echo "── running: overlay + timer ──"
    agent-browser eval "(() => { const badge = [...document.querySelectorAll('span, *')].map(e => e.textContent).find(t => /^1(19|18):/.test(t)) || [...document.querySelectorAll('[class*=tabular]')].map(e => e.textContent)[0]; const qpVisible = [...document.querySelectorAll('canvas')].some(c => c.getBoundingClientRect().width > 200); const finishBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Finish & grade')); return { timerShown: !!badge, timerText: badge || null, qpCanvasVisible: qpVisible, finishBtn: !!finishBtn, fullscreenFixed: !!document.querySelector('.fixed.inset-0') }; })()"
    agent-browser screenshot "$SHOTDIR/local_05_mock_running.png" >/dev/null 2>&1
    # finish -> grading
    agent-browser find text "Finish & grade" click >/dev/null 2>&1
    agent-browser wait 4000 >/dev/null 2>&1
    echo "── grading: ms pane + tally ──"
    agent-browser eval "(() => { const marksInput = !!document.getElementById('mock-marks'); const totalInput = !!document.getElementById('mock-total'); const msLabel = [...document.querySelectorAll('span')].some(s => s.textContent.startsWith('Mark scheme —')); const savedBtn = [...document.querySelectorAll('button')].some(b => b.textContent.includes('Save result')); return { marksInput, totalInput, msLabel, savedBtn }; })()"
    agent-browser screenshot "$SHOTDIR/local_06_mock_grading.png" >/dev/null 2>&1
    # fill tally + save
    agent-browser eval "(() => { const set = (id, v) => { const el = document.getElementById(id); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; set('mock-marks', '54'); set('mock-total', '80'); return 'filled'; })()"
    agent-browser wait 400 >/dev/null 2>&1
    agent-browser find text "Save result" click >/dev/null 2>&1
    agent-browser wait 1800 >/dev/null 2>&1
    echo "── saved: localStorage + redirect ──"
    agent-browser eval "(() => ({ url: location.pathname, stored: localStorage.getItem('syllabai.mockResults.v1')?.slice(0, 160) || null }))"
    echo "── landing strip shows result ──"
    agent-browser open "$BASE/courses/igcse-chemistry-19/past-papers" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 900 >/dev/null 2>&1
    agent-browser eval "(() => { const sec = document.querySelector('section[aria-label=\"Your recent mocks\"]'); return sec ? sec.textContent.slice(0, 120) : 'NO STRIP'; })()"
    agent-browser screenshot "$SHOTDIR/local_07_mock_saved.png" >/dev/null 2>&1
    echo "PHASE_MOCK_DONE"
    ;;
  interactive)
    agent-browser open "$BASE/courses/igcse-chemistry-19/past-papers" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 900 >/dev/null 2>&1
    echo "── playable badge count + interactive chips ──"
    agent-browser eval "(() => { const playable = [...document.querySelectorAll('li')].filter(li => li.textContent.includes('playable')).length; const chips = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Interactive').length; return { playableRows: playable, interactiveChips: chips }; })()"
    echo "── matched chip navigates to player ──"
    agent-browser eval "(() => { const a = [...document.querySelectorAll('a')].find(l => l.textContent.trim() === 'Interactive'); return a ? a.getAttribute('href') : null; })()"
    echo "── unmatched chip opens roadmap popover ──"
    agent-browser eval "(() => { const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Interactive' && b.className.includes('text-muted-foreground')); if (!btns.length) return 'no-unmatched-chip'; btns[0].click(); return 'clicked'; })()"
    agent-browser wait 700 >/dev/null 2>&1
    agent-browser eval "(() => { const p = [...document.querySelectorAll('[data-radix-popper-content-wrapper] *')].map(e => e.textContent).find(t => t.includes('isn')) ; return p ? p.slice(0, 140) : document.body.textContent.includes('isn’t interactive yet') ? 'popover-text-found' : 'NO POPOVER'; })()"
    agent-browser screenshot "$SHOTDIR/local_08_interactive.png" >/dev/null 2>&1
    echo "── player page loads (matched reconstruction) ──"
    agent-browser eval "(() => { const a = [...document.querySelectorAll('a')].find(l => l.textContent.trim() === 'Interactive'); return a ? a.getAttribute('href') : null; })()"
    HREF=$(agent-browser eval "(() => { const a = [...document.querySelectorAll('a')].find(l => l.textContent.trim() === 'Interactive'); return a ? a.getAttribute('href') : 'null'; })()" 2>/dev/null | tr -d '"')
    if [ "$HREF" != "null" ] && [ -n "$HREF" ]; then
      agent-browser open "$BASE$HREF" >/dev/null 2>&1
      agent-browser wait --load networkidle >/dev/null 2>&1
      agent-browser wait 800 >/dev/null 2>&1
      agent-browser eval "(() => ({ h1: document.querySelector('h1')?.textContent?.slice(0, 60), reconstructed: document.body.textContent.includes('Reconstructed') }))"
    fi
    echo "PHASE_INTERACTIVE_DONE"
    ;;
  mobile)
    agent-browser set viewport 390 844 >/dev/null 2>&1
    agent-browser open "$BASE/courses/igcse-chemistry-19/past-papers" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 800 >/dev/null 2>&1
    agent-browser screenshot "$SHOTDIR/local_09_mobile_landing.png" >/dev/null 2>&1
    agent-browser open "$BASE/courses/igcse-chemistry-19/past-papers/view/2021-06/4CH1-1C?doc=split" >/dev/null 2>&1
    agent-browser wait --load networkidle >/dev/null 2>&1
    agent-browser wait 5000 >/dev/null 2>&1
    echo "── mobile: A/B toggle pill + single pane ──"
    agent-browser eval "(() => { const pill = [...document.querySelectorAll('[role=tablist]')].find(t => t.className.includes('sm:hidden')); const msPaneHidden = [...document.querySelectorAll('span')].find(s => s.textContent.startsWith('Mark scheme —'))?.closest('[class*=rounded-lg]')?.className.includes('hidden'); const qpVisible = [...document.querySelectorAll('canvas')].some(c => c.getBoundingClientRect().width > 150); return { togglePill: !!pill, pillButtons: pill ? [...pill.querySelectorAll('button')].map(b => b.textContent.trim()) : [], msPaneHiddenOnMobile: msPaneHidden !== undefined ? msPaneHidden : 'n/a', qpCanvasVisible: qpVisible }; })()"
    agent-browser screenshot "$SHOTDIR/local_10_mobile_viewer.png" >/dev/null 2>&1
    agent-browser set viewport 1440 900 >/dev/null 2>&1
    echo "PHASE_MOBILE_DONE"
    ;;
esac
