# Corpus Import & Mapping Integrity Report

Imported from `SyllabAI/syllabai-resources` @ `main` (`7575585`, 2026-09-17T18:19:23Z) — 
the operator-authorized Save My Exams corpus (see `LICENSE-DATA.md` upstream).

Every course is imported with its **own corpus-native navigation tree**:

- `official` — the Pearson-registered 4CH1 specification tree (182 points,
  graph-as-code Phase 1/2); notes and question parts carry official
  `4CH1-x.y` codes (`AI_VALIDATED`, operator-delegated upstream).
- `sme-native` — the SME tree the scraper harvested (section > topic >
  `spcpt_*` spec points). These courses are **not yet mapped to official
  specification codes upstream** — the demo leaves `specPointCodes` empty
  rather than inventing anchors.

## Cross-resource mapping (how notes ↔ questions ↔ flashcards connect)

All three resource families join through the SME spec-point ids
(`spcpt_*`) that the scraper preserved verbatim:

- revision notes → `spec_point_ids` (frontmatter, per page)
- exam-question parts → `spec_point_ids` (per part) + topic-level
  `revision_note_id` links back to the covering notes
- flashcards → `spec_links` (per card), joined to notes via the course's
  `spec_point_index.json` (SME-native id → name/definition/notes)

## Per-course audit

| course | tree | secs | tops | spec pts | notes | notes anchored | notes placed | sets | qs | parts | parts anchored | parts resolved | decks | cards | cards linked | cards placed |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ial-biology-18 | sme-native | 8 | 28 | 223 | 170 | 170 | 170 | 28 | 207 | 611 | 603 | 603 | 28 | 1847 | 1847 | 1847 |
| ial-chemistry-17 | sme-native | 7 | 40 | 262 | 196 | 196 | 196 | 72 | 472 | 957 | 939 | 939 | 39 | 1723 | 1723 | 1723 |
| ial-further-maths-18-further-pure-1 | sme-native | 7 | 9 | 44 | 25 | 25 | 25 | 9 | 108 | 280 | 280 | 280 | 0 | 0 | 0 | 0 |
| ial-maths-20-decision-1 | sme-native | 4 | 9 | 53 | 26 | 26 | 26 | 9 | 95 | 375 | 373 | 373 | 9 | 223 | 223 | 223 |
| ial-maths-20-mechanics-1 | sme-native | 4 | 10 | 39 | 34 | 34 | 34 | 10 | 339 | 539 | 473 | 473 | 10 | 211 | 211 | 211 |
| ial-maths-20-mechanics-2 | sme-native | 5 | 8 | 26 | 21 | 21 | 21 | 8 | 268 | 554 | 470 | 395 | 8 | 140 | 140 | 140 |
| ial-maths-20-pure-1 | sme-native | 5 | 13 | 42 | 42 | 42 | 42 | 13 | 462 | 712 | 707 | 681 | 13 | 267 | 267 | 267 |
| ial-maths-20-pure-2 | sme-native | 8 | 12 | 40 | 38 | 38 | 38 | 12 | 374 | 591 | 568 | 511 | 12 | 239 | 239 | 239 |
| ial-maths-20-pure-3 | sme-native | 6 | 12 | 37 | 35 | 35 | 35 | 12 | 459 | 790 | 726 | 616 | 12 | 200 | 200 | 200 |
| ial-maths-20-pure-4 | sme-native | 7 | 12 | 39 | 39 | 39 | 39 | 12 | 390 | 660 | 590 | 544 | 12 | 224 | 224 | 224 |
| ial-maths-20-statistics-1 | sme-native | 3 | 7 | 44 | 30 | 30 | 30 | 7 | 254 | 574 | 564 | 564 | 7 | 205 | 205 | 205 |
| ial-maths-20-statistics-2 | sme-native | 2 | 7 | 23 | 15 | 15 | 15 | 7 | 240 | 591 | 503 | 479 | 7 | 126 | 126 | 126 |
| ial-physics-19 | sme-native | 6 | 37 | 265 | 222 | 222 | 222 | 67 | 302 | 546 | 534 | 534 | 37 | 1412 | 1412 | 1412 |
| igcse-accounting-17-financial-statements | sme-native | 2 | 6 | 31 | 20 | 20 | 20 | 5 | 32 | 73 | 71 | 69 | 0 | 0 | 0 | 0 |
| igcse-accounting-17-introduction-to-bookkeeping-and-accounting | sme-native | 3 | 15 | 110 | 43 | 43 | 43 | 15 | 243 | 328 | 313 | 313 | 0 | 0 | 0 | 0 |
| igcse-biology-19 | sme-native | 5 | 21 | 210 | 142 | 142 | 142 | 21 | 324 | 976 | 970 | 970 | 21 | 1205 | 6 | 1205 |
| igcse-biology-modular-24-unit-1 | sme-native | 2 | 8 | 78 | 43 | 43 | 43 | 8 | 106 | 366 | 365 | 365 | 8 | 434 | 0 | 434 |
| igcse-biology-modular-24-unit-2 | sme-native | 4 | 13 | 132 | 99 | 99 | 99 | 13 | 164 | 549 | 514 | 514 | 13 | 771 | 6 | 771 |
| igcse-business-19 | sme-native | 6 | 28 | 203 | 89 | 89 | 89 | 25 | 612 | 612 | 607 | 607 | 25 | 1008 | 1008 | 1008 |
| igcse-chemistry-19 | official | 4 | 28 | 182 | 112 | 112 | 112 | 28 | 524 | 1404 | 1358 | 1358 | 28 | 909 | 0 | 909 |
| igcse-chemistry-modular-24-unit-1 | sme-native | 4 | 14 | 93 | 65 | 65 | 65 | 14 | 270 | 704 | 681 | 617 | 14 | 542 | 542 | 542 |
| igcse-chemistry-modular-24-unit-2 | sme-native | 4 | 14 | 68 | 47 | 47 | 47 | 14 | 237 | 651 | 622 | 529 | 14 | 387 | 387 | 387 |
| igcse-economics-17 | sme-native | 5 | 17 | 204 | 80 | 80 | 80 | 13 | 468 | 623 | 617 | 617 | 16 | 980 | 980 | 980 |
| igcse-english-literature-16 | sme-native | 5 | 21 | 625 | 136 | 136 | 136 | 16 | 115 | 115 | 115 | 97 | 15 | 298 | 240 | 298 |
| igcse-further-maths-19 | sme-native | 7 | 19 | 99 | 58 | 58 | 58 | 19 | 176 | 464 | 461 | 461 | 19 | 430 | 430 | 430 |
| igcse-geography-19 | sme-native | 17 | 41 | 262 | 102 | 102 | 102 | 39 | 750 | 883 | 852 | 852 | 38 | 1168 | 1168 | 1168 |
| igcse-ict-17 | sme-native | 5 | 28 | 149 | 69 | 69 | 69 | 21 | 111 | 134 | 128 | 128 | 21 | 730 | 730 | 730 |
| igcse-maths-a-18-foundation | sme-native | 6 | 45 | 154 | 139 | 139 | 139 | 45 | 275 | 431 | 428 | 410 | 27 | 330 | 0 | 330 |
| igcse-maths-a-18-higher | sme-native | 6 | 58 | 203 | 191 | 191 | 191 | 58 | 2703 | 3550 | 3533 | 3350 | 58 | 999 | 0 | 999 |
| igcse-maths-a-modular-24-foundation-unit-1 | sme-native | 4 | 25 | 87 | 79 | 79 | 79 | 25 | 123 | 200 | 196 | 191 | 0 | 0 | 0 | 0 |
| igcse-maths-a-modular-24-foundation-unit-2 | sme-native | 4 | 21 | 67 | 59 | 59 | 59 | 21 | 88 | 132 | 126 | 126 | 0 | 0 | 0 | 0 |
| igcse-maths-a-modular-24-higher-unit-1 | sme-native | 6 | 32 | 100 | 98 | 98 | 98 | 31 | 1299 | 1665 | 1653 | 1621 | 32 | 514 | 0 | 514 |
| igcse-maths-a-modular-24-higher-unit-2 | sme-native | 6 | 27 | 93 | 92 | 92 | 92 | 27 | 1269 | 1696 | 1637 | 1575 | 27 | 485 | 0 | 485 |
| igcse-physics-19 | sme-native | 8 | 24 | 188 | 127 | 127 | 127 | 24 | 489 | 1135 | 1134 | 1134 | 24 | 922 | 0 | 922 |
| igcse-physics-modular-24-unit-1 | sme-native | 4 | 12 | 89 | 62 | 62 | 62 | 12 | 236 | 559 | 557 | 493 | 12 | 438 | 434 | 438 |
| igcse-physics-modular-24-unit-2 | sme-native | 5 | 12 | 97 | 65 | 65 | 65 | 12 | 249 | 569 | 562 | 556 | 12 | 459 | 456 | 459 |
| igcse-science-double-award-17-biology | sme-native | 5 | 20 | 166 | 110 | 110 | 110 | 20 | 215 | 688 | 682 | 682 | 20 | 1529 | 1529 | 1529 |
| igcse-science-double-award-17-chemistry | sme-native | 4 | 22 | 119 | 80 | 80 | 80 | 22 | 277 | 624 | 592 | 587 | 22 | 705 | 705 | 705 |
| igcse-science-double-award-17-physics | sme-native | 8 | 18 | 142 | 95 | 95 | 95 | 18 | 353 | 789 | 763 | 602 | 18 | 688 | 0 | 688 |

**Totals** — notes 3195, questions 15678, parts 27700, flashcards 22748, spec points 5088.

Column glossary:

- *anchored*: object carries at least one upstream spec-point anchor
  (`spcpt_*`, or official `4CH1-x.y` on the pilot).
- *placed*: object resolves into the bundle's navigation tree (directly
  or via its anchors), i.e. it is reachable from the hub sidebar.
- *resolved*: at least one anchor exists in the course tree.

Known upstream gaps (honestly inherited, never fabricated):

- a small minority of question parts reference SME spec points tagged in
  sibling courses (cross-unit/cross-tier tagging upstream) — those parts
  still render, they just resolve into no row of THIS course's tree;
- MCQ option lists were not captured by the upstream scrape (only stems +
  worked solutions) — the player shows its honest fallback instead of
  inventing options;
- 5 of 39 courses have no SME flashcard decks (further-pure, both
  accounting variants, maths-a modular foundation units).

## T-SME-11 addition — missing-subjects round (2026-09-20)

Upstream round `sme: T-SME-11 missing-subjects round` (`9e6b2cd`, repair
`c2fcd88`) closed the live-SME catalog gap: 49 Edexcel course roots vs the
39 previously mirrored. The 10 missing lanes across 3 families were ingested
upstream through the same pipeline and are imported here from
`main` (`c2fcd88`, 2026-09-20T06:48:02Z):

- **English Language A 4EA1** — 3 paper lanes (Paper 1, Paper 2,
  Paper 3 coursework). Papers 1–2 carry real SME topic questions
  (100 q / 1,980 marks and 65 q / 1,950 marks, 0 missing).
- **Maths B 4MB1** — 199 notes, 62 decks / 1,082 cards; no topic questions
  published on SME (honest upstream census, `status_note` recorded).
- **Science (Double Award) Modular 2024 4XSD1** — 6 unit lanes
  (biology / chemistry / physics × unit 1 / 2), notes-only; SME publishes
  neither topic questions nor flashcards for the new modular spec yet.

Official specifications for the three quals were parsed upstream from the
Pearson PDFs and PDF-vs-parse re-audited verbatim (4EA1 26/26, 4MB1 97/98,
4XSD1 397/411 — residuals are PDF text-layer glyph-order artifacts, the same
class as the established quals).

| course | tree | secs | tops | spec pts | notes | notes anchored | notes placed | sets | qs | parts | parts anchored | parts resolved | decks | cards | cards linked | cards placed |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|

| igcse-english-language-a-16-paper-1-non-fiction-texts-and-transactional-writing | sme-native | 1 | 3 | 150 | 40 | 40 | 40 | 29 | 100 | 100 | 100 | 100 | 3 | 166 | 166 | 166 |
| igcse-english-language-a-16-paper-2-poetry-and-prose-texts-and-imaginative-writing | sme-native | 1 | 3 | 97 | 20 | 20 | 20 | 33 | 65 | 65 | 65 | 65 | 3 | 132 | 132 | 132 |
| igcse-english-language-a-16-paper-3-coursework | sme-native | 1 | 3 | 24 | 7 | 7 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| igcse-maths-b-16 | sme-native | 10 | 62 | 215 | 199 | 199 | 199 | 0 | 0 | 0 | 0 | 0 | 62 | 1082 | 268 | 1082 |
| igcse-science-double-award-modular-24-biology-unit-1 | sme-native | 2 | 8 | 59 | 32 | 32 | 32 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| igcse-science-double-award-modular-24-biology-unit-2 | sme-native | 4 | 12 | 99 | 75 | 75 | 75 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| igcse-science-double-award-modular-24-chemistry-unit-1 | sme-native | 4 | 13 | 77 | 51 | 51 | 51 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| igcse-science-double-award-modular-24-chemistry-unit-2 | sme-native | 4 | 9 | 43 | 29 | 29 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| igcse-science-double-award-modular-24-physics-unit-1 | sme-native | 4 | 8 | 64 | 44 | 44 | 44 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| igcse-science-double-award-modular-24-physics-unit-2 | sme-native | 5 | 10 | 76 | 51 | 51 | 51 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
