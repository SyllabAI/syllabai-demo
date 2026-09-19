#!/usr/bin/env bash
# Poll Vercel until the Task 22 SME-parity deploy (4199525) is live.
# Markers:
#   /courses/igcse-chemistry-19/past-papers — "partial reconstructions" + session header
#   /courses/igcse-chemistry-19/practice-papers — "Practice Paper 1" + "spans"
#   Regression: /dashboard "My subjects"
BASE="https://syllabai-demo.vercel.app"
for i in $(seq 1 20); do
  pp_code=$(curl -s -o /home/z/my-project/work/pp_probe.html -w "%{http_code}" --max-time 30 "$BASE/courses/igcse-chemistry-19/past-papers")
  pp=$(grep -c "partial reconstructions" /home/z/my-project/work/pp_probe.html || true)
  sess=$(grep -c "Jan1C" /home/z/my-project/work/pp_probe.html || true)
  pr_code=$(curl -s -o /home/z/my-project/work/pr_probe.html -w "%{http_code}" --max-time 30 "$BASE/courses/igcse-chemistry-19/practice-papers")
  pr=$(grep -c "Practice Paper 1" /home/z/my-project/work/pr_probe.html || true)
  spans=$(grep -c "spans" /home/z/my-project/work/pr_probe.html || true)
  dash=$(curl -s --max-time 30 "$BASE/dashboard" | grep -c "My subjects" || true)
  echo "attempt $i: pp_code=$pp_code pp=$pp sess=$sess pr_code=$pr_code pr=$pr spans=$spans dash=$dash"
  if [ "$pp_code" = "200" ] && [ "$pp" -ge 1 ] && [ "$sess" -ge 1 ] && [ "$pr_code" = "200" ] && [ "$pr" -ge 1 ] && [ "$spans" -ge 1 ] && [ "$dash" -ge 1 ]; then
    echo "DEPLOY_LIVE: Task 22 past papers + practice papers + progress live in production"
    exit 0
  fi
  sleep 25
done
echo "TIMEOUT: Task 22 deploy not detected within polling window"
exit 1
