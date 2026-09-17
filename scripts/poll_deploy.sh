#!/usr/bin/env bash
# Poll the Vercel deployment until the hub fix is live.
# Marker of the NEW deploy: hub page HTML contains server-rendered hub content
# ("spec points") AND no streamed error digest. Old deploy had a digest + no content.
URL="https://syllabai-demo.vercel.app/courses/igcse-chemistry-19"
for i in $(seq 1 20); do
  html=$(curl -s "$URL" --max-time 30)
  digest=$(printf '%s' "$html" | grep -c '"digest"' || true)
  content=$(printf '%s' "$html" | grep -c 'spec points' || true)
  build=$(printf '%s' "$html" | grep -oE 'x-vercel-id|NEXT_HTTP_ERROR_FALLBACK' | head -1)
  echo "attempt $i: content_markers=$content digest=$digest"
  if [ "$content" -ge 1 ] && [ "$digest" -eq 0 ]; then
    echo "DEPLOY_LIVE: hub renders with content, no error digest"
    exit 0
  fi
  sleep 30
done
echo "TIMEOUT: new deploy not detected within polling window"
exit 1
