#!/usr/bin/env bash
# Poll Vercel until the Task 21-b SME fidelity deploy (0f2a74d) is live.
# Markers:
#   /courses/igcse-chemistry-19 SSR contains "Exam Practice" band (new hub anatomy, Task 21-b)
#   homepage CSS chunk(s) contain "Kodchasan" (new next/font display stack)
#   /dashboard still healthy ("My subjects") + /api/course-stats still answering
BASE="https://syllabai-demo.vercel.app"
PROBE="/home/z/my-project/work/hub_probe.html"
for i in $(seq 1 24); do
  code=$(curl -s -o "$PROBE" -w "%{http_code}" --max-time 30 "$BASE/courses/igcse-chemistry-19")
  band=$(grep -c "Exam Practice" "$PROBE" || true)
  meta=$(grep -c "4CH1" "$PROBE" || true)
  font=0
  css_urls=$(curl -s --max-time 30 "$BASE/" | grep -o '/_next/static/css/[^"]*\.css' | sort -u)
  for href in $css_urls; do
    hit=$(curl -s --max-time 30 "$BASE$href" | grep -c "Kodchasan" || true)
    font=$((font + hit))
  done
  dash=$(curl -s --max-time 30 "$BASE/dashboard" | grep -c "My subjects" || true)
  api=$(curl -s --max-time 30 "$BASE/api/course-stats?slugs=igcse-chemistry-19" | grep -c "questionSets" || true)
  echo "attempt $i: hub_code=$code band=$band meta=$meta font=$font dash=$dash api=$api"
  if [ "$code" = "200" ] && [ "$band" -ge 1 ] && [ "$meta" -ge 1 ] && [ "$font" -ge 1 ] && [ "$dash" -ge 1 ] && [ "$api" -ge 1 ]; then
    echo "DEPLOY_LIVE: Task 21-b hub anatomy + Kodchasan font stack live in production"
    exit 0
  fi
  sleep 25
done
echo "TIMEOUT: Task 21-b deploy not detected within polling window"
exit 1
