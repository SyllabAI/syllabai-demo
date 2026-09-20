#!/bin/bash
# Poll until the NEW deploy (speech-math fix) is live on production.
# Marker: the reported note's RENDERED html (up to first <script>) must not
# contain MathML speech text, and must carry >=25 katex-rendered elements.
set -u
NOTE_URL="https://syllabai-demo.vercel.app/courses/igcse-maths-b-16/revision-notes/rn_XDKBYvZP5QNfgHTx"

for i in $(seq 1 40); do
  curl -s "$NOTE_URL" -o /tmp/prod_note.html
  # visible portion only — the RSC flight payload legitimately embeds the raw body
  vis=$(sed 's|<script.*||' /tmp/prod_note.html)
  speech=$(echo "$vis" | grep -c "open parentheses" || true)
  katex=$(grep -o 'class="katex' /tmp/prod_note.html | wc -l)
  echo "poll $i: visible-speech=$speech katex-hits=$katex"
  if [ "$speech" = "0" ] && [ "$katex" -ge 25 ]; then
    echo "OK: new deploy live — speech spans rendered as KaTeX math"
    exit 0
  fi
  sleep 30
done
echo "TIMEOUT after 20 minutes"
exit 1
