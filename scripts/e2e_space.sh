#!/bin/bash
# PP-SPACE-4 local E2E — viewer viewport maximization
# Run: bash scripts/e2e_space.sh
cd /home/z/my-project
mkdir -p scripts/e2e-space

fuser -k -KILL 3000/tcp 2>/dev/null; ss -ltnp | grep -o "pid=[0-9]*" | cut -d= -f2 | xargs -r kill -9 2>/dev/null; true
sleep 1
nohup bun run start > /tmp/next-pp.log 2>&1 &
sleep 7
for i in $(seq 1 25); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login)
  [ "$code" = "200" ] && break
  sleep 2
done
echo "=== server up ==="

VIEWER="http://localhost:3000/courses/igcse-chemistry-19/past-papers/view/2021-06/4CH1-1C"
PASS=0; FAIL=0
check() { # check <name> <actual> <expected>
  if [ "$2" = "$3" ]; then echo "PASS: $1 ($2)"; PASS=$((PASS+1)); else echo "FAIL: $1 (got $2, want $3)"; FAIL=$((FAIL+1)); fi
}

# ---------- Phase 1: desktop geometry + chrome collapse ----------
agent-browser set viewport 1440 900 > /dev/null
agent-browser open "$VIEWER" > /dev/null
agent-browser wait --load networkidle --timeout 30000 > /dev/null
agent-browser wait 6000 > /dev/null
D=$(agent-browser eval "(() => {
  const pane = document.querySelector('.pp-pane');
  const r = pane.getBoundingClientRect();
  const holder = document.querySelector('[data-page]');
  return JSON.stringify({
    top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width),
    gap: Math.round(innerHeight - r.bottom),
    pdfW: Math.round(holder.getBoundingClientRect().width),
    aside: Math.round((document.querySelector('aside.sticky.top-14')||{getBoundingClientRect:()=>({width:0})}).getBoundingClientRect().width),
    pageScroll: document.documentElement.scrollHeight - innerHeight,
    footer: !!document.querySelector('footer'),
    crumbs: !!document.querySelector('nav[aria-label=\"breadcrumb\"]'),
    h1: (document.querySelector('h1')||{}).textContent || ''
  });
})()" 2>/dev/null)
echo "DESKTOP: $D"
check "desktop: pane top ≤ 130" "$(echo $D | jq -r 'fromjson|.top <= 130')" "true"
check "desktop: pane height ≥ 770" "$(echo $D | jq -r 'fromjson|.h >= 770')" "true"
check "desktop: pane width ≥ 1340" "$(echo $D | jq -r 'fromjson|.w >= 1340')" "true"
check "desktop: pane bottom at fold (gap ≤ 6)" "$(echo $D | jq -r 'fromjson|.gap <= 6')" "true"
check "desktop: pdf holder width ≥ 1310" "$(echo $D | jq -r 'fromjson|.pdfW >= 1310')" "true"
check "desktop: sidebar auto-collapsed to rail (44px)" "$(echo $D | jq -r 'fromjson|.aside == 44')" "true"
check "desktop: page does not scroll" "$(echo $D | jq -r 'fromjson|.pageScroll == 0')" "true"
check "desktop: footer omitted on focus route" "$(echo $D | jq -r 'fromjson|.footer')" "false"
check "desktop: breadcrumbs omitted" "$(echo $D | jq -r 'fromjson|.crumbs')" "false"
check "desktop: h1 = paper ref" "$(echo $D | jq -r 'fromjson|.h1')" '4CH1/1C'

# ---------- Phase 2: Ctrl+F find still works ----------
agent-browser find role button click --name "Find in document" > /dev/null
agent-browser wait 1200 > /dev/null
agent-browser find role textbox fill "chlorine" > /dev/null 2>&1
agent-browser wait 2500 > /dev/null
F=$(agent-browser eval "(() => {
  const fb = document.querySelector('[role=search]');
  const input = fb?.querySelector('input');
  const ev = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  ev.call(input, 'chlorine');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()" > /dev/null)
agent-browser wait 3500 > /dev/null
F=$(agent-browser eval "(() => JSON.stringify({ hl: document.querySelectorAll('.pp-hl').length, bar: !!document.querySelector('[role=search]') }))()" 2>/dev/null)
echo "FIND: $F"
check "find: highlight rects painted" "$(echo $F | jq -r 'fromjson|.hl > 0')" "true"

# ---------- Phase 3: QP→MS instant toggle, scroll preserved ----------
T=$(agent-browser eval "(() => {
  const pane = document.querySelector('.pp-pane');
  const sc = pane.querySelector('.overflow-y-auto') || pane.scrollHeight > pane.clientHeight ? pane : pane.firstElementChild;
  window.__paneScroll = sc.scrollTop;
  return String(sc.scrollTop);
})()" > /dev/null)
agent-browser press Escape > /dev/null
agent-browser eval "(() => { [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Mark scheme' && b.getAttribute('aria-pressed') !== null && b.closest('[role=tablist]') && getComputedStyle(b.closest('[role=tablist]')).display !== 'none').click(); return 1; })()" > /dev/null
agent-browser wait 2500 > /dev/null
T=$(agent-browser eval "(() => {
  const panes = [...document.querySelectorAll('.pp-pane')];
  const vis = panes.find(p => p.getBoundingClientRect().width > 0);
  return JSON.stringify({ label: vis.querySelector('span').textContent.slice(0, 12), h: Math.round(vis.getBoundingClientRect().height) });
})()" 2>/dev/null)
echo "TOGGLE: $T"
check "toggle: MS pane visible + full height" "$(echo $T | jq -r 'fromjson|.h >= 770')" "true"

# ---------- Phase 4: sidebar restores on leaving focus route ----------
agent-browser eval "(() => { [...document.querySelectorAll('a')].find(a => a.getAttribute('href')?.endsWith('/past-papers') && a.textContent.includes('Past Papers')).click(); return 1; })()" > /dev/null
agent-browser wait 3000 > /dev/null
S=$(agent-browser eval "(() => JSON.stringify({ aside: Math.round(document.querySelector('aside.sticky.top-14').getBoundingClientRect().width), footer: !!document.querySelector('footer') }))()" 2>/dev/null)
echo "SIDEBAR RESTORE: $S"
check "index: sidebar expanded back to 256" "$(echo $S | jq -r 'fromjson|.aside == 256')" "true"
check "index: footer present again" "$(echo $S | jq -r 'fromjson|.footer')" "true"

# ---------- Phase 5: mobile ----------
agent-browser set viewport 390 844 > /dev/null
agent-browser open "$VIEWER" > /dev/null
agent-browser wait --load networkidle --timeout 30000 > /dev/null
agent-browser wait 6000 > /dev/null
M=$(agent-browser eval "(() => {
  const pane = document.querySelector('.pp-pane');
  const r = pane.getBoundingClientRect();
  const pill = document.querySelector('[role=tablist][aria-label=\"Switch document\"]');
  const pr = pill.getBoundingClientRect();
  return JSON.stringify({
    top: Math.round(r.top), h: Math.round(r.height), gap: Math.round(innerHeight - r.bottom),
    pageScroll: document.documentElement.scrollHeight - innerHeight,
    pillPos: getComputedStyle(pill).position, pillBottom: Math.round(innerHeight - pr.bottom)
  });
})()" 2>/dev/null)
echo "MOBILE: $M"
check "mobile: pane fills to fold (gap ≤ 6)" "$(echo $M | jq -r 'fromjson|.gap <= 6')" "true"
check "mobile: page does not scroll" "$(echo $M | jq -r 'fromjson|.pageScroll == 0')" "true"
check "mobile: pill floats over pane" "$(echo $M | jq -r 'fromjson|.pillPos')" 'absolute'
agent-browser screenshot scripts/e2e-space/04_mobile_final.png > /dev/null

# mobile A/B switch keeps working
agent-browser eval "(() => { [...document.querySelectorAll('[role=tab]')].find(b => b.textContent.trim() === 'Mark scheme').click(); return 1; })()" > /dev/null
agent-browser wait 3000 > /dev/null
AB=$(agent-browser eval "(() => {
  const panes = [...document.querySelectorAll('.pp-pane')];
  const vis = panes.find(p => p.getBoundingClientRect().width > 0);
  return JSON.stringify({ label: vis.querySelector('span').textContent.slice(0, 3) });
})()" 2>/dev/null)
check "mobile: A/B switch to MS works" "$(echo $AB | jq -r 'fromjson|.label')" 'Mar'

echo ""
echo "=== RESULT: $PASS passed, $FAIL failed ==="
exit $FAIL
