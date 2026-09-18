#!/usr/bin/env bash
# SSR sweep: for each course that had affected MCQs, fetch one affected topic
# page from the standalone server and verify:
#   - letter-button radiogroups present
#   - legacy amber fallback GONE
set -u
BASE="http://127.0.0.1:3100"
declare -A PICK=(
  ["ial-biology-18"]="the-nervous-system--exam-questions"
  ["ial-chemistry-17"]="1-10-alkenes--multiple-choice-questions"
  ["ial-physics-19"]="forces-and-momentum--multiple-choice-questions"
  ["igcse-business-19"]="costs-and-break-even-analysis--exam-questions"
  ["igcse-chemistry-19"]="1-2-elements-compounds-and-mixtures--exam-questions"
  ["igcse-chemistry-modular-24-unit-1"]="introduction-to-organic-chemistry--exam-questions"
  ["igcse-chemistry-modular-24-unit-2"]="esters--exam-questions"
  ["igcse-economics-17"]="government-intervention--exam-questions"
  ["igcse-maths-a-18-higher"]="graphs-of-functions--exam-questions"
  ["igcse-maths-a-modular-24-higher-unit-1"]="graphs-of-functions--exam-questions"
  ["igcse-physics-19"]="1-1-movement-and-position--exam-questions"
  ["igcse-physics-modular-24-unit-1"]="components-in-series-parallel-circuits--exam-questions"
  ["igcse-physics-modular-24-unit-2"]="cosmology--exam-questions"
  ["igcse-science-double-award-17-chemistry"]="gases-in-the-atmosphere--exam-questions"
  ["igcse-science-double-award-17-physics"]="stellar-evolution--exam-questions"
)
fail=0
for course in "${!PICK[@]}"; do
  url="$BASE/courses/$course/exam-questions/${PICK[$course]}"
  html=$(curl -s "$url" --max-time 30)
  code=$?
  letters=$(printf '%s' "$html" | grep -c 'MCQ answer letters' || true)
  rows=$(printf '%s' "$html" | grep -c 'MCQ options' || true)
  amber=$(printf '%s' "$html" | grep -c 'lives in the source image' || true)
  digest=$(printf '%s' "$html" | grep -c '"digest"' || true)
  status="OK"
  if [ "$code" -ne 0 ] || [ "$letters" -eq 0 ] || [ "$amber" -gt 0 ] || [ "$digest" -gt 0 ]; then
    status="FAIL"; fail=1
  fi
  printf '%-46s letters=%-3s rows=%-3s amber=%-2s digest=%-2s %s\n' "$course" "$letters" "$rows" "$amber" "$digest" "$status"
done
exit $fail
