#!/usr/bin/env bash
# Poll Vercel until the PR-edge retarget deploy (fd05d75) is live.
# Marker of the NEW deploy: /knowledge-graph SSR payload no longer contains
# any 4CH1-PR-xx edge codes (old deploy: 2x 4CH1-PR-01, 2x 4CH1-PR-11).
# ALSO re-verifies Task 20 sanitizer live on a note page (no raw spcpt_ ids).
URL="https://syllabai-demo.vercel.app/knowledge-graph"
NOTE_URL="https://syllabai-demo.vercel.app/courses/igcse-english-literature-16/revision-notes/rn_3fTJyBHFHzyRwjnv"
for i in $(seq 1 24); do
  html=$(curl -s "$URL" --max-time 30)
  pr=$(printf '%s' "$html" | grep -c '4CH1-PR-0' || true)
  page=$(printf '%s' "$html" | grep -c 'Knowledge Graph' || true)
  digest=$(printf '%s' "$html" | grep -c '"digest"' || true)
  echo "attempt $i: page=$page pr_leftover=$pr digest=$digest"
  if [ "$page" -ge 1 ] && [ "$pr" -eq 0 ] && [ "$digest" -eq 0 ]; then
    echo "DEPLOY_LIVE: knowledge graph serves retargeted edges"
    # Task 20 sanitizer production re-check on a worst-offender note
    note=$(curl -s "$NOTE_URL" --max-time 30)
    leak=$(printf '%s' "$note" | grep -c 'spcpt_[A-Za-z0-9]' || true)
    echo "note page spcpt_ occurrences (expect 0): $leak"
    [ "$leak" -eq 0 ] && echo "TASK20_SANITIZER_VERIFIED" || echo "TASK20_SANITIZER_STILL_LEAKING"
    exit 0
  fi
  sleep 25
done
echo "TIMEOUT: retarget deploy not detected within polling window"
exit 1
