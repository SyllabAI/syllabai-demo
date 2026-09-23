#!/bin/bash
# Poll production until TEACHER-3 (Phase 2) markers are live (effe6b1)
BASE="https://syllabai-demo.vercel.app"
for i in $(seq 1 24); do
  sleep 15
  ASG=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/teacher/assignments")
  VAL=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/teacher/validation")
  VQ=$(curl -s "$BASE/api/teacher/validation-queue?slug=igcse-chemistry-19" | grep -c "resourceId" || true)
  A_HTML=$(curl -s "$BASE/teacher/assignments?course=igcse-chemistry-19")
  M1=$(echo "$A_HTML" | grep -c "SAMPLE roster sim" || true)
  V_HTML=$(curl -s "$BASE/teacher/validation?course=igcse-chemistry-19")
  M2=$(echo "$V_HTML" | grep -c "AI content validation" || true)
  echo "attempt $i: asg=$ASG val=$VAL vq_resourceId=$VQ asg_marker=$M1 val_marker=$M2"
  if [ "$ASG" = "200" ] && [ "$VAL" = "200" ] && [ "$VQ" -ge 1 ] && [ "$M1" -ge 1 ] && [ "$M2" -ge 1 ]; then
    echo "LIVE: Phase 2 teacher surfaces responding with TEACHER-3 markers"
    exit 0
  fi
done
echo "NOT_LIVE after 6 min"
exit 1
