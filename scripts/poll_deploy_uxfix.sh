#!/usr/bin/env bash
# Poll Vercel until the UX fix-batch deploy (1aced87) is live.
# Markers:
#   1) production buildId == local .next/BUILD_ID
#   2) home page contains scoped-stats copy "Inside the 4CH1 Chemistry pilot"
#   3) home page no longer contains stale "39 Learning Hubs"
#   4) hub page (course shell) carries full muted-foreground sidebar classes
set -u
LOCAL_BUILD_ID=$(cat .next/BUILD_ID 2>/dev/null || echo "")
if [ -z "$LOCAL_BUILD_ID" ]; then echo "ERROR: no local BUILD_ID (run build first)"; exit 1; fi
echo "local buildId: $LOCAL_BUILD_ID"

BASE="https://syllabai-demo.vercel.app"
for i in $(seq 1 30); do
  home_html=$(curl -s "$BASE/" --max-time 30)
  remote_bid=$(printf '%s' "$home_html" | grep -oE '"buildId":"[^"]+"' | head -1 | cut -d'"' -f4)
  [ -z "$remote_bid" ] && remote_bid=$(curl -sI "$BASE/" --max-time 30 | grep -oiE 'x-nextjs-build-id: [^ ]+' | head -1 | awk '{print $2}' | tr -d '\r')
  scoped=$(printf '%s' "$home_html" | grep -c 'Inside the 4CH1 Chemistry pilot' || true)
  stale39=$(printf '%s' "$home_html" | grep -c '39 Learning Hubs' || true)
  echo "attempt $i: remote_buildId=${remote_bid:-unknown} scoped_stats=$scoped stale39=$stale39"
  if [ "$remote_bid" = "$LOCAL_BUILD_ID" ] && [ "$scoped" -ge 1 ] && [ "$stale39" -eq 0 ]; then
    hub_html=$(curl -s "$BASE/courses/igcse-chemistry-19" --max-time 30)
    sidebar_full=$(printf '%s' "$hub_html" | grep -c 'text-muted-foreground"' || true)
    sidebar_old=$(printf '%s' "$hub_html" | grep -cE 'text-muted-foreground/(70|60|55)' || true)
    echo "hub sidebar: full-opacity classes=$sidebar_full old /70-/60-/55 classes=$sidebar_old"
    if [ "$sidebar_old" -eq 0 ] && [ "$sidebar_full" -ge 1 ]; then
      echo "DEPLOY_LIVE: UX fix batch fully deployed (buildId match + all markers)"
      exit 0
    fi
    echo "buildId matched but hub marker mismatch — inspecting anyway"; exit 2
  fi
  sleep 30
done
echo "TIMEOUT: deploy not detected within polling window"
exit 1
