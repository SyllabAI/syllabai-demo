#!/usr/bin/env bash
# Poll Vercel until the bd8ea91 bold-marker repair deploy is live.
# Markers (chemistry qstn_CY3YfbxVNSZMb839):
#   FIXED:  <strong class="font-semibold">W</strong> and <strong class="font-semibold">Y</strong>
#   BROKEN: literal "**W **" in rendered markup (RSC payload excepted)
URL="https://syllabai-demo.vercel.app/courses/ial-chemistry-17/exam-questions/1-3-atomic-structure--multiple-choice-questions"
for i in $(seq 1 20); do
  html=$(curl -s "$URL" --max-time 30)
  fixed=$(printf '%s' "$html" | grep -c 'W</strong> and <strong class="font-semibold">Y' || true)
  broken=$(printf '%s' "$html" | grep -c '\*\*W \*\*and' || true)
  digest=$(printf '%s' "$html" | grep -c '"digest"' || true)
  echo "attempt $i: fixed_choice=$fixed broken_markup=$broken digest=$digest"
  if [ "$fixed" -ge 1 ] && [ "$broken" -eq 0 ] && [ "$digest" -eq 0 ]; then
    echo "DEPLOY_LIVE: bold-marker repair is rendering on production"
    exit 0
  fi
  sleep 30
done
echo "TIMEOUT: bd8ea91 deploy not detected within polling window"
exit 1
