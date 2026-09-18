#!/usr/bin/env bash
# Poll Vercel until the e17e166 exam-questions deploy is live.
# Marker: the economics exam-questions topic page must SSR the answerable
# MCQ block ("Choose your answer" + radiogroup) — absent on the old deploy.
URL="https://syllabai-demo.vercel.app/courses/igcse-economics-17/exam-questions/business-costs-revenues-and-profit--exam-questions"
for i in $(seq 1 20); do
  html=$(curl -s "$URL" --max-time 30)
  mcq=$(printf '%s' "$html" | grep -c 'Choose your answer' || true)
  rg=$(printf '%s' "$html" | grep -c 'radiogroup' || true)
  digest=$(printf '%s' "$html" | grep -c '"digest"' || true)
  echo "attempt $i: mcq_markers=$mcq radiogroup=$rg digest=$digest"
  if [ "$mcq" -ge 1 ] && [ "$rg" -ge 1 ] && [ "$digest" -eq 0 ]; then
    echo "DEPLOY_LIVE: answerable MCQ player is rendering in SSR HTML"
    exit 0
  fi
  sleep 30
done
echo "TIMEOUT: e17e166 deploy not detected within polling window"
exit 1
