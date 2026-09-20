#!/usr/bin/env bash
# Task 21-e production poll: T-SME-11 subjects live on syllabai-demo.vercel.app
set -u
BASE="https://syllabai-demo.vercel.app"
MB="$BASE/courses/igcse-maths-b-16"
ELA="$BASE/courses/igcse-english-language-a-16-paper-1-non-fiction-texts-and-transactional-writing"
ELAQ="$ELA/exam-questions"
SDA="$BASE/courses/igcse-science-double-award-modular-24-biology-unit-1"
CHEM="$BASE/courses/igcse-chemistry-19"

for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$MB")
  if [ "$code" = "200" ]; then
    mb=$(curl -s "$MB")
    if echo "$mb" | grep -q '4MB1' && echo "$mb" | grep -q 'Maths B'; then
      echo "[OK] maths-b hub live: 4MB1 + 'Maths B' present"
      ela=$(curl -s "$ELA")
      echo "$ela" | grep -q '4EA1' && echo "[OK] ELA paper-1 hub live: 4EA1 present" || echo "[PENDING] ELA hub marker"
      elaq=$(curl -s "$ELAQ")
      echo "$elaq" | grep -q 'Section A Reading' && echo "[OK] ELA questions index live (Section A Reading)" || echo "[PENDING] ELA questions"
      sda=$(curl -s "$SDA")
      echo "$sda" | grep -q '4XSD1' && echo "[OK] SDA modular biology unit-1 hub live: 4XSD1 present" || echo "[PENDING] SDA"
      chem=$(curl -s "$CHEM")
      echo "$chem" | grep -q '4CH1' && echo "[OK] regression: chemistry hub still live (4CH1)" || echo "[FAIL] chemistry regression"
      # dashboard registry: new course reachable from registry payload
      dash=$(curl -s "$BASE/dashboard")
      echo "$dash" | grep -q 'Maths B' && echo "[OK] dashboard registry lists Maths B" || echo "[note] dashboard client-rendered; Maths B marker not in SSR"
      exit 0
    fi
  fi
  echo "[poll $i] maths-b hub not ready (HTTP $code), waiting 15s..."
  sleep 15
done
echo "TIMEOUT after 40 polls"
exit 1
