#!/bin/bash
# Ensure the standalone Next.js server is up on :3100 (start if down).
if curl -s -o /dev/null --max-time 2 http://127.0.0.1:3100/login; then
  echo "server-alive"
  exit 0
fi
cd /home/z/my-project
pkill -f "standalone/server" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 1
PORT=3100 setsid node .next/standalone/server.js > /tmp/tb-standalone.log 2>&1 < /dev/null &
for i in $(seq 1 20); do
  sleep 1
  if curl -s -o /dev/null --max-time 2 http://127.0.0.1:3100/login; then
    echo "server-restarted (attempt $i)"
    exit 0
  fi
done
echo "server-FAILED"
exit 1
