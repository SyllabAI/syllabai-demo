#!/usr/bin/env bash
# Poll Vercel until the T-SME-23c deploy (75815d4) is live.
# Marker: the Next.js build chunk fingerprint changes (data-only commit — no
# UI-visible content change; relatedNoteIds are corpus-level, not rendered).
# Then regression: affected qset pages + math-fix note stay healthy.
BASE="https://syllabai-demo.vercel.app"
PROBE="/courses/igcse-economics-17/exam-questions/business-costs-revenues-and-profit--exam-questions"

fingerprint() {
  curl -s --max-time 30 "$BASE$PROBE" \
    | grep -o '/_next/static/[^"]*\.js' | sort | md5sum | cut -d' ' -f1
}

OLD=$(fingerprint)
echo "current prod chunk fingerprint: ${OLD:-none}"

for i in $(seq 1 17); do
  sleep 30
  NEW=$(fingerprint)
  if [ -n "$NEW" ] && [ "$NEW" != "$OLD" ]; then
    echo "attempt $i: fingerprint CHANGED -> $NEW"
    echo "DEPLOY_LIVE: T-SME-23c build fingerprint changed"
    exit 0
  fi
  echo "attempt $i: unchanged (${NEW:-fetch-fail})"
done
echo "TIMEOUT: deploy not detected within polling window"
exit 1
