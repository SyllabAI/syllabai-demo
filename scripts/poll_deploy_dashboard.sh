#!/usr/bin/env bash
# Poll Vercel until the dashboard deploy (5fe0a2f) is live.
# Markers: /dashboard returns 200 + renders "Dashboard"; home shows the new
# SME hero ("Revise by subject"); /api/course-stats answers.
BASE="https://syllabai-demo.vercel.app"
for i in $(seq 1 24); do
  code=$(curl -s -o /tmp/dash_probe.html -w "%{http_code}" --max-time 30 "$BASE/dashboard")
  dash=$(grep -c "My subjects" /tmp/dash_probe.html || true)
  hero=$(curl -s --max-time 30 "$BASE/" | grep -c "Revise by subject" || true)
  api=$(curl -s --max-time 30 "$BASE/api/course-stats?slugs=igcse-chemistry-19" | grep -c "questionSets" || true)
  echo "attempt $i: dash_code=$code dash_marker=$dash hero_marker=$hero api_marker=$api"
  if [ "$code" = "200" ] && [ "$dash" -ge 1 ] && [ "$hero" -ge 1 ] && [ "$api" -ge 1 ]; then
    echo "DEPLOY_LIVE: dashboard + SME home + course-stats API all serving"
    exit 0
  fi
  sleep 25
done
echo "TIMEOUT: dashboard deploy not detected within polling window"
exit 1
