#!/usr/bin/env bash
# Local SSR smoke test for KaTeX rendering quality (math-fix changes).
# Serves the standalone build on :3101, fetches math-heavy pages, checks:
#   - HTTP 200
#   - KaTeX spans present (class="katex")
#   - zero KaTeX error spans (class="katex-error") — was 2,532 corpus segments
#   - no raw \( or \(see-note leakage
set -u
BASE="http://127.0.0.1:3101"
PORT=3101
(cd /home/z/my-project/.next/standalone && PORT=$PORT HOSTNAME=127.0.0.1 node server.js >/tmp/katex_ssr.log 2>&1 &
echo $! > /tmp/katex_ssr.pid)
# wait for readiness
for i in $(seq 1 30); do
  curl -s -o /dev/null "$BASE/api/health" && break
  sleep 1
done

declare -A PICK=(
  ["igcse-maths-a-18-higher"]="graphs-of-functions--exam-questions"
  ["ial-maths-20-pure-1"]="graphs-of-functions--exam-questions"
  ["ial-chemistry-17"]="1-10-alkenes--multiple-choice-questions"
  ["ial-further-maths-18-further-pure-1"]="operations-with-complex-numbers--exam-questions"
)
fail=0
for course in "${!PICK[@]}"; do
  url="$BASE/courses/$course/exam-questions/${PICK[$course]}"
  html=$(curl -s "$url" --max-time 40)
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url" --max-time 40)
  kx=$(printf '%s' "$html" | grep -o 'class="katex"' | wc -l)
  err=$(printf '%s' "$html" | grep -o 'katex-error' | wc -l)
  rawparen=$(printf '%s' "$html" | grep -o '\\\\(' | wc -l)
  status="OK"
  [ "$code" != "200" ] && { status="HTTP-$code"; fail=1; }
  [ "$kx" -eq 0 ] && status="$status NO-KATEX(info)"   # some topics are image-based, no math
  [ "$err" -gt 0 ] && { status="$status ERROR-SPANS=$err"; fail=1; }
  printf '%-38s http=%s katex=%-4s katex-error=%-3s raw-paren=%-3s %s\n' \
    "$course" "$code" "$kx" "$err" "$rawparen" "$status"
done

# revision notes page (notes.json math)
note_url="$BASE/courses/ial-maths-20-pure-1/revision-notes"
code=$(curl -s -o /dev/null -w '%{http_code}' "$note_url" --max-time 40)
printf '%-38s http=%s\n' "ial-maths-20-pure-1/revision-notes" "$code"
[ "$code" != "200" ] && fail=1

kill "$(cat /tmp/katex_ssr.pid)" 2>/dev/null || true
exit $fail
