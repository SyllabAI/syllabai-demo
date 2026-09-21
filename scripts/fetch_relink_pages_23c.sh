#!/bin/bash
# Fetch the 5 affected SME topic-questions pages 3x each (widget-stability check).
set -u
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
DIR=/home/z/my-project/work/relink_23c
mkdir -p "$DIR"

declare -A PAGES=(
  [lit-macbeth]="https://www.savemyexams.com/igcse/english-literature/edexcel/16/topic-questions/literary-heritage/macbeth/exam-questions/"
  [lit-romeo]="https://www.savemyexams.com/igcse/english-literature/edexcel/16/topic-questions/literary-heritage/romeo-and-juliet/exam-questions/"
  [lit-inspector]="https://www.savemyexams.com/igcse/english-literature/edexcel/16/topic-questions/modern-drama/an-inspector-calls-/exam-questions/"
  [math-lin]="https://www.savemyexams.com/igcse/maths/edexcel/a-modular/24/foundation-unit-1/topic-questions/algebra/linear-equations/exam-questions/"
  [econ-costs]="https://www.savemyexams.com/igcse/economics/edexcel/17/topic-questions/business-economics/business-costs-revenues-and-profit/exam-questions/"
)

for key in lit-macbeth lit-romeo lit-inspector math-lin econ-costs; do
  url="${PAGES[$key]}"
  for i in 1 2 3; do
    out="$DIR/${key}.${i}.html"
    code=$(curl -sL --compressed -w "%{http_code}" -A "$UA" --max-time 60 "$url" -o "$out")
    size=$(wc -c < "$out")
    echo "$key.$i  http=$code  bytes=$size"
    sleep $((1 + RANDOM % 3))
  done
done
