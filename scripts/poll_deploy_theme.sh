#!/usr/bin/env bash
# Poll Vercel until the dual-theme deploy (b9ea215) is live.
# Markers:
#   1) inline no-flash bootstrap present (localStorage "syllabai-theme")
#   2) footer theme toggle text "SME · System" (SSR'd from theme-toggle row)
#   3) QG token present in CSS: --fern or [data-theme="quiet-green"] in a
#      stylesheet chunk referenced by the home page
BASE="https://syllabai-demo.vercel.app"
for i in $(seq 1 20); do
  home=$(curl -s "$BASE/" --max-time 30)
  bootstrap=$(printf '%s' "$home" | grep -c 'syllabai-theme' || true)
  toggle=$(printf '%s' "$home" | grep -c 'SME · System' || true)
  css=$(printf '%s' "$home" | grep -oE '/_next/static/chunks/[a-z0-9_-]+\.css' | head -4 | sort -u)
  qgcss=0
  for c in $css; do
    n=$(curl -s "$BASE$c" --max-time 30 | grep -c 'data-theme="quiet-green"' || true)
    [ "$n" -ge 1 ] && qgcss=1 && break
  done
  echo "attempt $i: bootstrap=$bootstrap toggle=$toggle qg_css=$qgcss"
  if [ "$bootstrap" -ge 1 ] && [ "$toggle" -ge 1 ] && [ "$qgcss" -eq 1 ]; then
    echo "DEPLOY_LIVE: dual-theme build detected"
    exit 0
  fi
  sleep 30
done
echo "TIMEOUT"
exit 1
