#!/bin/bash
# UX audit page walk: screenshot + contrast/UX injection + semantics injection per page.
# Usage: bash scripts/ux_audit_walk.sh <outdir>
set -u
OUT="${1:-work/ux_audit}"
cd /home/z/my-project
mkdir -p "$OUT"

audit_page() {
  local name="$1" url="$2"
  echo "== $name =="
  agent-browser open "$url" >/dev/null 2>&1
  agent-browser wait --load networkidle >/dev/null 2>&1 || true
  sleep 0.6
  agent-browser screenshot "$OUT/$name.png" >/dev/null 2>&1
  agent-browser eval "$(cat scripts/ux_audit_inject.js)" > "$OUT/$name.audit.json" 2>&1
  agent-browser eval "$(cat scripts/ux_semantics_inject.js)" > "$OUT/$name.sem.json" 2>&1
}

audit_page 03-courses        "http://localhost:3000/courses"
audit_page 04-dashboard      "http://localhost:3000/dashboard"
audit_page 05-revision-notes "http://localhost:3000/revision-notes"
audit_page 06-exam-questions "http://localhost:3000/exam-questions"
audit_page 07-flashcards     "http://localhost:3000/flashcards"
audit_page 08-tutor          "http://localhost:3000/tutor"
audit_page 09-practice       "http://localhost:3000/practice"
audit_page 10-kg             "http://localhost:3000/knowledge-graph"
audit_page 11-explorer       "http://localhost:3000/graph-explorer"
audit_page 12-learner        "http://localhost:3000/learner"
audit_page 13-experiments    "http://localhost:3000/experiments"
echo DONE
