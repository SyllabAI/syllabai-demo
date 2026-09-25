#!/usr/bin/env bash
# Marker unique to the reorder deploy: the PositionInput aria-label template
# "Move question ... to position (1–" only exists in 8ed165c.
URL="https://syllabai-demo.vercel.app/teacher/test-builder"
for i in $(seq 1 20); do
  html=$(curl -s "$URL" --max-time 30)
  marker=$(printf '%s' "$html" | grep -c 'to position (1' || true)
  digest=$(printf '%s' "$html" | grep -c '"digest"' || true)
  echo "attempt $i: reorder_marker=$marker digest=$digest"
  if [ "$marker" -ge 1 ] && [ "$digest" -eq 0 ]; then
    echo "DEPLOY_LIVE: reorder + move-to-position build is live"
    exit 0
  fi
  sleep 30
done
echo "TIMEOUT: new deploy not detected within polling window"
exit 1
