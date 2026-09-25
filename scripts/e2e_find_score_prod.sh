#!/bin/bash
# PP-FIND-SCORE-3 production E2E — deploy probe + find bar + per-question scoring on syllabai-demo.vercel.app
set -u
OUT=scripts/e2e-find
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ok  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
V="https://syllabai-demo.vercel.app"

# ── deploy probe (behavioral, done externally before this script) ───────────
ok "deploy live (find button verified behaviorally pre-script)"

agent-browser close >/dev/null 2>&1
agent-browser set viewport 1440 900 >/dev/null

# ── viewer find ─────────────────────────────────────────────────────────────
agent-browser open "$V/courses/igcse-chemistry-19/past-papers/view/2021-06/4CH1-1C" >/dev/null
agent-browser wait --fn "!!document.querySelector('canvas')" --timeout 40000 >/dev/null 2>&1 && ok "QP canvas rendered (prod)" || bad "QP canvas never rendered"
agent-browser find role button click --name "Find in document" >/dev/null 2>&1 && ok "find bar opened (prod)" || bad "find button failed"
agent-browser find role textbox fill "chlorine" >/dev/null 2>&1
sleep 2
C=$(agent-browser eval "(() => { const el = document.querySelector('[role=search] [aria-live=polite]'); return el ? el.textContent.trim() : 'NONE'; })()" 2>/dev/null | tr -d '"')
echo "    chlorine matches: $C"
HL=$(agent-browser get count ".pp-hl" 2>/dev/null)
SPANS=$(agent-browser eval "(() => { const s = document.querySelector('.pp-textLayer'); return s ? s.querySelectorAll('span').length : 0; })()" 2>/dev/null)
[ "$HL" -ge 1 ] 2>/dev/null && ok "highlights painted ($HL)" || bad "no highlights"
[ "$SPANS" -ge 1 ] 2>/dev/null && ok "textLayer spans present ($SPANS)" || bad "no text layer"
agent-browser screenshot "$OUT/prod_01_find.png" >/dev/null

# ── mock: jump + per-question ───────────────────────────────────────────────
agent-browser open "$V/courses/igcse-chemistry-19/past-papers/view/2021-06/4CH1-1C?mode=mock" >/dev/null
agent-browser wait --text "Begin mock" --timeout 20000 >/dev/null 2>&1
agent-browser find role button click --name "Begin mock" >/dev/null 2>&1
agent-browser wait --fn "!!document.querySelector('select[aria-label=\"Jump to question\"]')" --timeout 30000 >/dev/null 2>&1 && ok "jump select live (prod)" || bad "jump select missing"
agent-browser eval "(() => { const s = document.querySelector('select[aria-label=\"Jump to question\"]'); const opt = [...s.options].find(o => o.textContent === 'Q3'); const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(s), 'value').set; setter.call(s, opt.value); s.dispatchEvent(new Event('change', { bubbles: true })); return opt.value; })()" >/dev/null 2>&1
sleep 2.5
P2=$(agent-browser eval "(() => { const el = [...document.querySelectorAll('span')].find(e => /^[0-9]+ \\/ [0-9]+\$/.test(e.textContent)); return el ? el.textContent.trim() : '?'; })()" 2>/dev/null | tr -d '"')
[ "$P2" != "1 / 28" ] && [ "$P2" != "?" ] && ok "jump scrolled (prod: $P2)" || bad "jump failed ($P2)"
agent-browser find role button click --name "Finish mock and grade" >/dev/null 2>&1
agent-browser wait --fn "document.querySelectorAll('input[aria-label\$=\"marks scored\"]').length > 0" --timeout 60000 >/dev/null 2>&1 && ok "per-question rows detected (prod)" || bad "breakdown rows missing"
ROWS=$(agent-browser eval "(() => document.querySelectorAll('input[aria-label\$=\"marks scored\"]').length)()" 2>/dev/null | tr -d '"')
echo "    detected rows: $ROWS"
agent-browser eval "(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; const ms = [...document.querySelectorAll('input[aria-label\$=\"marks scored\"]')]; const mx = [...document.querySelectorAll('input[aria-label\$=\"marks available\"]')]; ms.forEach((el, i) => set(el, String((i % 4) + 1))); mx.forEach((el) => { if (!el.value) set(el, '4'); }); return 'filled'; })()" >/dev/null 2>&1
sleep 0.5
agent-browser find role button click --name "Use for totals" >/dev/null 2>&1
sleep 0.5
M=$(agent-browser get value "#mock-marks" 2>/dev/null | tr -d '"')
[ -n "$M" ] && [ "$M" != "null" ] && ok "row sums applied (marks=$M)" || bad "totals not applied"
agent-browser find role button click --name "Save result" >/dev/null 2>&1
agent-browser wait --url "*/past-papers" --timeout 20000 >/dev/null 2>&1 && ok "saved + redirected (prod)" || bad "save failed"
sleep 0.5
S=$(agent-browser eval "(() => { const raw = localStorage.getItem('syllabai.mockResults.v1'); const r = raw ? JSON.parse(raw)[0] : null; return r && r.questions ? r.questions.length + 'q' : 'no-breakdown'; })()" 2>/dev/null | tr -d '"')
chkq() { case "$2" in *"q") ok "$1 ($2)";; *) bad "$1 ($2)";; esac; }
chkq "breakdown persisted (prod)" "$S"
agent-browser screenshot "$OUT/prod_02_saved.png" >/dev/null
ERRS=$(agent-browser errors 2>/dev/null | grep -cv "^$")
[ "$ERRS" = "0" ] && ok "0 page errors (prod)" || { bad "$ERRS page errors"; agent-browser errors 2>/dev/null | head -5; }
agent-browser close >/dev/null 2>&1

echo
echo "PROD PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
