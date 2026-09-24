#!/bin/bash
# Check production test-builder chunks for the clamp-fix literal
BASE="https://syllabai-demo.vercel.app"
while read -r u; do
  if curl -s "$BASE/$u" | rg -q "settings are out of range"; then
    echo "NEW CODE LIVE in $u"
    exit 0
  fi
done < /home/z/my-project/scripts/tb_chunks.txt
echo "literal not found in any chunk"
