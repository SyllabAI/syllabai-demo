#!/usr/bin/env bash
# Poll Vercel until the bb101f0 revert (drop labelled Show-menu bar) is live.
# Markers:
#   1) /courses/ial-chemistry-17 SSR: "px-2.5 lg:hidden" ABSENT (bar-era Menu
#      button class gone; bar-era build emitted it)
#   2) course-shell chunk: "Show menu" occurs exactly 2x (aria-label + title
#      of rail icon); bar-era chunk had >=3 (extra JSX label)
#   3) routes / /courses /practice /tutor all 200
BASE="https://syllabai-demo.vercel.app"
for i in $(seq 1 12); do
  html=$(curl -s "$BASE/courses/ial-chemistry-17" --max-time 30)
  old_ssr=$(printf '%s' "$html" | grep -c 'px-2.5 lg:hidden' || true)
  cnt=-1
  for c in $(printf '%s' "$html" | grep -oE '/_next/static/chunks/[a-z0-9_-]+\.js' | sort -u); do
    body=$(curl -s "$BASE$c" --max-time 30)
    n=$(printf '%s' "$body" | grep -o 'Show menu' | wc -l)
    if [ "$n" -ge 2 ]; then cnt=$n; break; fi
  done
  codes=""
  for r in / /courses /practice /tutor; do
    codes="$codes $(curl -s -o /dev/null -w '%{http_code}' "$BASE$r" --max-time 30)"
  done
  echo "attempt $i: old_ssr_marker=$old_ssr chunk_showmenu_count=$cnt codes:$codes"
  if [ "$old_ssr" -eq 0 ] && [ "$cnt" -eq 2 ]; then
    echo "DEPLOY_LIVE: bb101f0 (bar removed, rail icon kept)"
    exit 0
  fi
  sleep 20
done
echo "TIMEOUT"
exit 1
