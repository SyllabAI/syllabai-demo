#!/bin/bash
# Poll production until the a87c612 deploy (UX hardening + T-KG-10/11 merge) is live.
# Marker: "Target marks" (segmented control copy) present in SSR HTML of /teacher/test-builder.
URL="https://syllabai-demo.vercel.app/teacher/test-builder"
MARKER="Target marks"
for i in $(seq 1 40); do
  HTML=$(curl -sL --max-time 25 "$URL" 2>/dev/null)
  if echo "$HTML" | rg -q "$MARKER"; then
    echo "LIVE after attempt $i ($(date -u +%H:%M:%SZ)) — marker found"
    exit 0
  fi
  echo "attempt $i: not live yet ($(date -u +%H:%M:%SZ))"
  sleep 20
done
echo "TIMEOUT: marker not found after 40 attempts"
exit 1
