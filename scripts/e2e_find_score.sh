#!/bin/bash
# PP-FIND-SCORE-3 local E2E — text layer / Ctrl+F find + per-question mock scoring.
# Server and browser steps live in ONE call (sandbox reaps background servers).
set -u
cd /home/z/my-project
OUT=scripts/e2e-find
mkdir -p "$OUT"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ok  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got '$2' want '$3')"; fi; }
chkge(){ if [ "$2" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1 (got '$2' want >= $3)"; fi; }
V="http://localhost:3000"

# ── server ──────────────────────────────────────────────────────────────────
pkill -f "standalone/server.js" 2>/dev/null; sleep 0.5
NODE_ENV=production nohup bun .next/standalone/server.js > "$OUT/server.log" 2>&1 &
for i in $(seq 1 40); do curl -sf -o /dev/null "$V/" && break; sleep 0.5; done
curl -sf -o /dev/null "$V/" && ok "server up on :3000" || { bad "server never came up"; exit 1; }

agent-browser close >/dev/null 2>&1
agent-browser set viewport 1440 900 >/dev/null

# ── phase 1: viewer + find bar ──────────────────────────────────────────────
echo "— phase 1: find bar / highlights / text layer"
agent-browser open "$V/courses/igcse-chemistry-19/past-papers/view/2021-06/4CH1-1C" >/dev/null
agent-browser wait --fn "!!document.querySelector('canvas')" --timeout 30000 >/dev/null 2>&1 && ok "QP canvas rendered" || bad "QP canvas never rendered"
sleep 1.5

# open find via toolbar button
agent-browser find role button click --name "Find in document" >/dev/null 2>&1 && ok "find bar opened via toolbar button" || bad "find button click failed"
agent-browser wait --fn "!!document.querySelector('[role=search] input')" --timeout 5000 >/dev/null 2>&1 && ok "find input present" || bad "find input missing"

# type a query — "the" must hit a real Edexcel paper
agent-browser find role textbox fill "the" >/dev/null 2>&1
sleep 1
COUNT=$(agent-browser eval "(() => { const el = document.querySelector('[role=search] [aria-live=polite]'); return el ? el.textContent.trim() : 'NONE'; })()" 2>/dev/null | tr -d '"')
echo "    count label: $COUNT"
HL=$(agent-browser get count ".pp-hl" 2>/dev/null)
HLC=$(agent-browser get count ".pp-hl-current" 2>/dev/null)
SPANS=$(agent-browser eval "(() => { const s = document.querySelector('.pp-textLayer'); return s ? s.querySelectorAll('span').length : 0; })()" 2>/dev/null)
chkge "highlight rects painted" "$HL" 1
chkge "current-match highlight present" "$HLC" 1
chkge "textLayer spans (selection layer)" "$SPANS" 1
agent-browser screenshot "$OUT/01_find_bar.png" >/dev/null

# Enter → next match (index advances)
IDX1=$(agent-browser eval "(() => { const el = document.querySelector('[role=search] [aria-live=polite]'); return el ? el.textContent.trim() : ''; })()" 2>/dev/null | tr -d '"')
agent-browser find role textbox click >/dev/null 2>&1
agent-browser press Enter >/dev/null 2>&1
sleep 0.8
IDX2=$(agent-browser eval "(() => { const el = document.querySelector('[role=search] [aria-live=polite]'); return el ? el.textContent.trim() : ''; })()" 2>/dev/null | tr -d '"')
[ "$IDX1" != "$IDX2" ] && ok "Enter advances match ($IDX1 -> $IDX2)" || bad "Enter did not advance ($IDX1 -> $IDX2)"

# Ctrl+F re-open / focus path (module registry)
agent-browser press Escape >/dev/null 2>&1; sleep 0.3
OPEN_AFTER_ESC=$(agent-browser eval "(() => !!document.querySelector('[role=search]'))()" 2>/dev/null | tr -d '"')
chk "Esc closes find bar" "$OPEN_AFTER_ESC" "false"
agent-browser eval "(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true })); return 'dispatched'; })()" >/dev/null 2>&1
sleep 0.5
OPEN_AFTER_CTRL=$(agent-browser eval "(() => !!document.querySelector('[role=search]'))()" 2>/dev/null | tr -d '"')
chk "Ctrl+F reopens find bar (module registry)" "$OPEN_AFTER_CTRL" "true"
agent-browser screenshot "$OUT/02_find_ctrl.png" >/dev/null

# ── phase 2: mock flow + question jump + per-question scoring ────────────────
echo "— phase 2: mock question jump + per-question grading"
agent-browser open "$V/courses/igcse-chemistry-19/past-papers/view/2021-06/4CH1-1C?mode=mock" >/dev/null
agent-browser wait --text "Begin mock" --timeout 20000 >/dev/null 2>&1
agent-browser find role button click --name "Begin mock" >/dev/null 2>&1 && ok "mock started" || bad "Begin mock failed"
agent-browser wait --fn "!!document.querySelector('select[aria-label=\"Jump to question\"]')" --timeout 25000 >/dev/null 2>&1
sleep 0.5
JUMP=$(agent-browser get count "select[aria-label=\"Jump to question\"]" 2>/dev/null)
if [ "$JUMP" -ge 1 ] 2>/dev/null; then
  ok "question jump select detected from QP text"
  OPTS=$(agent-browser eval "(() => { const s = document.querySelector('select[aria-label=\"Jump to question\"]'); return s ? s.options.length : 0; })()" 2>/dev/null | tr -d '"')
  echo "    jump options: $OPTS"
  P1=$(agent-browser eval "(() => { const el = [...document.querySelectorAll('span')].find(e => /^[0-9]+ \\/ [0-9]+$/.test(e.textContent)); return el ? el.textContent.trim() : '?'; })()" 2>/dev/null | tr -d '"')
  # React-controlled select: native value setter + change event (worklog lesson)
  agent-browser eval "(() => { const s = document.querySelector('select[aria-label=\"Jump to question\"]'); const opt = [...s.options].find(o => o.textContent === 'Q5'); const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(s), 'value').set; setter.call(s, opt.value); s.dispatchEvent(new Event('change', { bubbles: true })); return opt.value; })()" >/dev/null 2>&1
  sleep 2.5
  P2=$(agent-browser eval "(() => { const el = [...document.querySelectorAll('span')].find(e => /^[0-9]+ \\/ [0-9]+$/.test(e.textContent)); return el ? el.textContent.trim() : '?'; })()" 2>/dev/null | tr -d '"')
  [ "$P1" != "$P2" ] && ok "jump select scrolled QP ($P1 -> $P2)" || bad "jump select did not scroll ($P1 -> $P2)"
  agent-browser screenshot "$OUT/03_mock_jump.png" >/dev/null
else
  bad "question jump select never appeared (QP structure not detected)"
fi

# finish → grading
agent-browser find role button click --name "Finish mock and grade" >/dev/null 2>&1
agent-browser wait --text "Question breakdown" --timeout 15000 >/dev/null 2>&1 && ok "grading screen with breakdown card" || bad "grading screen missing breakdown card"
# detection runs the FULL MS text extraction (23 pages) — wait for actual row inputs
agent-browser wait --fn "document.querySelectorAll('input[aria-label\$=\"marks scored\"]').length > 0" --timeout 45000 >/dev/null 2>&1 && ok "breakdown rows ready (detection finished)" || bad "breakdown never left loading state"
BADGE=$(agent-browser eval "(() => { const b = [...document.querySelectorAll('[data-slot=badge], .rounded-full')].map(e => e.textContent).find(t => t && t.includes('auto-detected')); return b ? b.trim() : 'none'; })()" 2>/dev/null | tr -d '"')
ROWS=$(agent-browser eval "(() => document.querySelectorAll('input[aria-label\$=\"marks scored\"]').length)()" 2>/dev/null | tr -d '"')
echo "    detection outcome: badge=$BADGE rows=$ROWS"

# fill rows programmatically (React native-setter pattern) then Use for totals
agent-browser eval "(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; const ms = [...document.querySelectorAll('input[aria-label\$=\"marks scored\"]')]; const mx = [...document.querySelectorAll('input[aria-label\$=\"marks available\"]')]; ms.forEach((el, i) => set(el, String((i % 5) + 1))); mx.forEach((el) => { if (!el.value) set(el, '4'); }); return ms.length + ':' + mx.length; })()" >/dev/null 2>&1
sleep 0.5
SUM=$(agent-browser eval "(() => { const t = [...document.querySelectorAll('span')].map(e => e.textContent).find(x => x && x.includes('Rows sum to')); return t ? t.trim() : 'none'; })()" 2>/dev/null | tr -d '"')
echo "    $SUM"
agent-browser find role button click --name "Use for totals" >/dev/null 2>&1
sleep 0.4
MARKS_VAL=$(agent-browser get value "#mock-marks" 2>/dev/null | tr -d '"')
TOTAL_VAL=$(agent-browser get value "#mock-total" 2>/dev/null | tr -d '"')
[ -n "$MARKS_VAL" ] && [ "$MARKS_VAL" != "null" ] && ok "Use for totals filled marks=$MARKS_VAL total=$TOTAL_VAL" || bad "Use for totals did not fill (marks='$MARKS_VAL' total='$TOTAL_VAL')"
agent-browser screenshot "$OUT/04_grading_rows.png" >/dev/null

# save → localStorage must carry the questions breakdown
agent-browser find role button click --name "Save result" >/dev/null 2>&1
agent-browser wait --url "*/past-papers" --timeout 15000 >/dev/null 2>&1 && ok "redirected to past-papers landing" || bad "no redirect after save"
sleep 0.5
STORED=$(agent-browser eval "(() => { const raw = localStorage.getItem('syllabai.mockResults.v1'); if (!raw) return 'EMPTY'; const all = JSON.parse(raw); const r = all[0]; return (r && r.questions) ? r.questions.length + 'q ' + r.marks + '/' + r.total : (r ? 'no-questions ' + r.marks + '/' + r.total : 'none'); })()" 2>/dev/null | tr -d '"')
echo "    saved result: $STORED"
case "$STORED" in *"no-questions"*|EMPTY|none) bad "saved mock result lacks questions breakdown ($STORED)";; *) ok "saved mock result carries per-question breakdown ($STORED)";; esac
agent-browser screenshot "$OUT/05_saved.png" >/dev/null

# ── console hygiene ─────────────────────────────────────────────────────────
ERRS=$(agent-browser errors 2>/dev/null | grep -v "^$" | wc -l)
chk "browser page errors" "$ERRS" "0"
agent-browser errors 2>/dev/null | head -5

agent-browser close >/dev/null 2>&1
# kill server by port (worklog lesson: pkill -f is dodged by renamed processes)
fuser -k 3000/tcp 2>/dev/null; sleep 0.5

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
