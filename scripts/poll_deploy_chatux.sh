#!/usr/bin/env bash
# Poll Vercel until the sidebar-rail + chat-ergonomics deploy (91f6f98) is live.
# Markers:
#   1) /tutor prerendered HTML contains the new welcome heading
#      "Ask the corpus anything" AND aria-label "Tutor conversation"
#   2) /courses/ial-chemistry-17 SSR aside carries the new class order
#      "w-64 shrink-0" (old build emitted "...transition-all lg:block w-64")
#   3) route regression: / /courses /practice /tutor all 200
BASE="https://syllabai-demo.vercel.app"
for i in $(seq 1 20); do
  tutor=$(curl -s "$BASE/tutor" --max-time 30)
  welcome=$(printf '%s' "$tutor" | grep -c 'Ask the corpus anything' || true)
  logattr=$(printf '%s' "$tutor" | grep -c 'Tutor conversation' || true)
  course=$(curl -s "$BASE/courses/ial-chemistry-17" --max-time 30)
  rail=$(printf '%s' "$course" | grep -c 'w-64 shrink-0' || true)
  codes=""
  for r in / /courses /practice /tutor; do
    codes="$codes $(curl -s -o /dev/null -w '%{http_code}' "$BASE$r" --max-time 30)"
  done
  echo "attempt $i: welcome=$welcome conv_attr=$logattr aside_class=$rail codes:$codes"
  if [ "$welcome" -ge 1 ] && [ "$logattr" -ge 1 ] && [ "$rail" -ge 1 ]; then
    echo "DEPLOY_LIVE: 91f6f98 build detected"
    exit 0
  fi
  sleep 30
done
echo "TIMEOUT"
exit 1
