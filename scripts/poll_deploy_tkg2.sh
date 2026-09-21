#!/bin/bash
# Poll until the T-KG-2 deploy (per-course knowledge graphs) is live.
# Marker: /kg/openhuman-course-explorer.html serves the loader fork
# (window.__KG_STATUS marker present) and a per-course data JSON returns 200.
set -u
FORK_URL="https://syllabai-demo.vercel.app/kg/openhuman-course-explorer.html"
DATA_URL="https://syllabai-demo.vercel.app/kg/data/igcse-chemistry-19.json"

for i in $(seq 1 40); do
  fork_code=$(curl -s -o /tmp/prod_fork.html -w "%{http_code}" "$FORK_URL")
  data_code=$(curl -s -o /tmp/prod_data.json -w "%{http_code}" "$DATA_URL")
  marker=$(grep -c "__KG_STATUS" /tmp/prod_fork.html 2>/dev/null || echo 0)
  nodes=$(python3 -c "import json;print(json.load(open('/tmp/prod_data.json'))['meta']['counts']['nodes'])" 2>/dev/null || echo "?")
  echo "poll $i: fork=$fork_code marker=$marker data=$data_code nodes=$nodes"
  if [ "$fork_code" = "200" ] && [ "$marker" -ge 1 ] && [ "$data_code" = "200" ] && [ "$nodes" = "215" ]; then
    echo "OK: T-KG-2 deploy live — loader fork + per-course data on production"
    exit 0
  fi
  sleep 30
done
echo "TIMEOUT after 20 minutes"
exit 1
