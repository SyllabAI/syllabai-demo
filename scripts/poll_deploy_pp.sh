#!/usr/bin/env bash
# Poll until the past-papers archive deploy is live.
# Marker: "Two ways to use a paper" — server-rendered banner unique to the
# new corpus-backed past papers landing.
URL="https://syllabai-demo.vercel.app/courses/igcse-chemistry-19/past-papers"
for i in $(seq 1 20); do
  html=$(curl -s "$URL" --max-time 30)
  marker=$(printf '%s' "$html" | grep -c 'Two ways to use a paper' || true)
  digest=$(printf '%s' "$html" | grep -c '"digest"' || true)
  echo "attempt $i: marker=$marker digest=$digest"
  if [ "$marker" -ge 1 ] && [ "$digest" -eq 0 ]; then
    echo "DEPLOY_LIVE: past papers archive is live"
    exit 0
  fi
  sleep 30
done
echo "TIMEOUT: new deploy not detected within polling window"
exit 1
