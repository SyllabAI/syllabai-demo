#!/bin/bash
# TEACHER-1 deploy poll — markers on production https://syllabai-demo.vercel.app
# /login is statically prerendered: demo-account CTA + role toggle in SSR HTML.
# /teacher is statically prerendered: "Teacher workspace" + SAMPLE + phase cards.
BASE="https://syllabai-demo.vercel.app"
for i in $(seq 1 12); do
  LOGIN=$(curl -s --max-time 20 "$BASE/login")
  TEACHER=$(curl -s --max-time 20 "$BASE/teacher")
  L1=$(echo "$LOGIN" | grep -c "Continue with a demo")
  L2=$(echo "$LOGIN" | grep -c 'aria-pressed')
  T1=$(echo "$TEACHER" | grep -c "Teacher workspace")
  T2=$(echo "$TEACHER" | grep -c "SAMPLE")
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/login")
  echo "attempt $i: login=$CODE demo-cta=$L1 pressed=$L2 | teacher-h1=$T1 sample=$T2"
  if [ "$L1" -ge 1 ] && [ "$L2" -ge 2 ] && [ "$T1" -ge 1 ] && [ "$T2" -ge 1 ]; then
    echo "DEPLOY_VERIFIED"
    exit 0
  fi
  sleep 20
done
echo "NOT_LIVE_YET"
exit 1
