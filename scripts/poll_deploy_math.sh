#!/usr/bin/env bash
# Poll Vercel until the LaTeX/math-fix deploy is live.
# Marker: the igcse-maths-a-18-higher graphs-of-functions page used to SSR
# exactly 1 katex-error span (the `\mathrm{cos}$$(360…` glued `$$` segment);
# after the math-fix deploy it must be 0 while KaTeX spans remain (>=298).
URL="https://syllabai-demo.vercel.app/courses/igcse-maths-a-18-higher/exam-questions/graphs-of-functions--exam-questions"
for i in $(seq 1 20); do
  html=$(curl -s "$URL" --max-time 30)
  kx=$(printf '%s' "$html" | grep -o 'class="katex"' | wc -l)
  err=$(printf '%s' "$html" | grep -o 'katex-error' | wc -l)
  paren=$(printf '%s' "$html" | grep -c 'quad (360' || true)
  echo "attempt $i: katex=$kx katex-error=$err sanitized-cos=$paren"
  if [ "$err" -eq 0 ] && [ "$kx" -ge 298 ] && [ "$paren" -ge 1 ]; then
    echo "DEPLOY_LIVE: math-fix is rendering (cos formula sanitized, 0 error spans)"
    exit 0
  fi
  sleep 30
done
echo "TIMEOUT: math-fix deploy not detected within polling window"
exit 1
