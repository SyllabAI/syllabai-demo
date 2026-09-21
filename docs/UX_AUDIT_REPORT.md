# UX & Visual Fidelity Audit — syllabai-demo

**Date:** 2026-09-21 · **Build:** local dev @ main `48f8b34` · **Viewports:** 1440×900 (desktop), 390×844 (mobile)
**Method:** Playwright walk of 17 routes (home, courses, dashboard, dashboard-empty, revision-notes, exam-questions, flashcards, tutor, practice, knowledge-graph, graph-explorer, learner, experiments, course hub, note reader, question set, flashcard deck) + injected WCAG contrast / touch-target / overflow / semantics probes (scripts/ux_audit_inject.js, ux_semantics_inject.js) + code forensics per finding. Screenshots + raw JSON: `work/ux_audit/`.

Severity: **P1** breaks usability/accessibility on a core path · **P2** confuses or misleads · **P3** polish.

---

## P1 — High

### 1. Mobile horizontal overflow on /courses (+52px) — grid track inflated by `truncate` titles
- **Evidence:** viewport 390px → `document.scrollWidth` 442px; every course card resolves to 426px inside a 358px container; resolved grid track = `425.5px`. Screenshot `19-m-courses.png` shows cards cut at the right edge.
- **Mechanism:** `course-directory.tsx:45` grid (`grid gap-2 sm:grid-cols-2 lg:grid-cols-3`) items have no `min-w-0`; the card title `truncate` (`:57`, `white-space: nowrap`) contributes its full single-line width to the grid track's min-content sizing, so the longest course title forces one 426px track on every breakpoint below the title's fit width.
- **Fix:** add `min-w-0` to the card anchor (grid item). One class.

### 2. Mobile horizontal overflow on home (+106px) — unbreakable mono bundle string
- **Evidence:** "What is real in this demo" provenance card content = 455px wide vs 390px viewport (`18-m-home.png`, offender: the `Bundle:` line).
- **Mechanism:** `page.tsx:233` renders `repo@ref · commit-hash` as `font-mono` with no break opportunities; a 40-hex-char token cannot wrap.
- **Fix:** `break-all` on the mono span, or truncate the displayed hash to 7–10 chars (full hash stays in the repo).

### 3. Sidebar contrast failures on every course page (the core study surfaces)
Injected probe, white background, all below WCAG AA (normal text ≥ 4.5:1):
| Element | Ratio | Code |
|---|---|---|
| Section labels COURSE / REVISION / EXAM PRACTICE (11px) | **2.71:1** | `course-shell.tsx:124,256` — `text-muted-foreground/70` |
| Disabled "Target Test" (14px) | **2.29:1** | `course-shell.tsx:149,279` — `/60` |
| Empty sub-topic placeholders | ≈2.3:1 | `topic-tree.tsx:314` — `/55` |
- The neutral `--muted-foreground` (oklch 0.556) itself is borderline: ≈4.7:1 on white (passes), but **4.34:1 on `bg-muted`** and any `/50–/70` opacity variant fails everywhere (measured 1.96–2.71:1).
- **Fix:** raise `/70→/100` and `/60→/95` for these labels (or introduce a `--muted-foreground-strong` ≈ oklch 0.44); disabled nav should keep ≥ 4.5:1 or become a labelled "coming soon" chip at full contrast.

### 4. Flashcard "Know" button fails AA — primary learning-loop action
- **Evidence:** white on `rgb(0,153,102)` = **3.67:1** (need 4.5 at 14px) on every deck rating row (`17-deck.png`).
- **Fix:** darken the green (≈ `#00875A`/oklch(0.52 0.12 160) → 4.6:1) or switch to dark text on light green. Check the "Still learning" pink pair too while there.

---

## P2 — Medium

### 5. Stale count "39" hardcoded across home/courses/dashboard copy — real registry is 49
`page.tsx` ("Courses — 39 Hubs", "39 subjects ready to add"), `courses/page.tsx` ("— 39 Learning Hubs", "All 39 bundles"), `course-directory.tsx` placeholder, `dashboard-client.tsx` (×3). Actual: **49 course cards** (36 IGCSE + 13 IAL, verified by DOM count). Copy contradicts the page it sits on — an immediate credibility hit. Fix: derive from `registry.length`; never hardcode.

### 6. Home stat cards are 4CH1-scoped but presented as global totals
Home shows 182 spec points / 113 graph nodes / 112 revision notes / 524 exam questions — exactly the 4CH1 Chemistry pilot numbers. Corpus-wide: 49 hubs, 3,743 notes, 24,128 flashcards, and the KG pages show 215–217 nodes. No scope label anywhere. Fix: label the row "inside the 4CH1 pilot" or compute corpus-wide totals.

### 7. Duplicate indistinguishable course cards — "Accounting 4AC1" ×2 (also on dashboard add-list)
`igcse-accounting-17-financial-statements` vs `…-introduction-to-bookkeeping-and-accounting` render as two identical title+code cards (`03-courses.png`). The differentiator (paper/unit name) exists in the lane title but isn't shown. Fix: show the lane subtitle (e.g. "Paper 3: Financial Statements") on the card.

### 8. Notes topic panel jams counts onto titles — "States of matter5 notes"
Visible on every note-reader page (`15-note-reader.png`). Root cause: nested sub-topic rows (`topic-tree.tsx:236–247`) render `{row}` (ring + title + count) inside a **non-flex** `Link`, so the count span flows inline; the plain path (`:298–310`) uses `flex gap-2` and looks right (which is why the questions panel is fine). Fix: add `flex items-center gap-2` to the nested Link. Also "Elements, compounds and mixtures5 not…" clips mid-word.

### 9. 9–10px micro-text is systemic
9px: "roadmap" chips (course hub cards, sidebar). 10px: spec-point codes (4CH1-1.1), "23 questions / 120 marks" stat chips, provenance badges (mock/zai, RULE_DERIVED), KG stats, "5 notes" counts (10.5px), footer. Below an 11px floor; several also sit on `bg-muted` (4.34:1). Fix: floor at 11–12px; chips ≥ 10.5px only if full-contrast.

### 10. Graph canvas label collisions + occlusion (both /knowledge-graph and /graph-explorer)
- "Ionic bonding" and "Chemical formulae, equations and calculations" overlap into a garbled run-on; long sub-topic labels ("Group 7 (halogens) — chlorine, bromine and iodine") collide with neighbours (`10-kg.png`, `11-explorer.png`).
- The search input floats mid-canvas and occludes nodes; faint emphasis halos overlap labels.
- Fix: label collision pass (hide/cull lower-priority labels at low zoom), pin search to a corner, dim halo rings.

### 11. Redundant graph IA — two near-identical full-bleed explorers in the nav
`/knowledge-graph` and `/graph-explorer` are the same OpenHuman canvas (same collisions, same toolbars, 215 vs 217 nodes) with different headers. Post T-KG-2 one should redirect; "Graph Explorer (OpenHuman)" + "Knowledge Graph" in the same menu invites wrong turns.

---

## P3 — Low

12. **Dark theme is unreachable dead code.** `.dark` token set + dark chip variants (globals.css:82–156) exist; no ThemeProvider/toggle anywhere (`rg ThemeProvider|setTheme` → none). Wire a toggle or drop ~75 lines.
13. **Breadcrumb separators 1.96:1** (`chrome.tsx:27` `muted-foreground/50`) and breadcrumb links are 19.5px tall (< 24px WCAG 2.5.8 target minimum) on notes/qset/deck.
14. **Heading skips:** h1→h3 (revision-notes index), h1→h3→h5 (note reader) — flattens the screen-reader outline.
15. **"(1 mark)" labels detach** from their question part (right column drops below the part's baseline when text wraps) on the question player (`16-question-set.png`, `09-practice.png`).
16. **Deck h1 noise:** "States of matter (Chemistry): Flashcards" — "(Chemistry)" is redundant with breadcrumb+sidebar and wraps the h1 to two lines on mobile.
17. **Disabled "Target Test"** is a `<span cursor-not-allowed>` without `aria-disabled` / tooltip explaining ROADMAP status.

---

## What is working well (fidelity strengths)

- SME parity reads convincingly: header pattern, course sidebar, chip system (Practice/Diagnose), display typography, stat-chip rows.
- Demo discipline is genuinely good UX: SIMULATED banners, RULE_DERIVED/AI_SUGGESTED provenance chips, honest empty decks ("Courses the upstream corpus has no decks for show honestly empty").
- Non-course pages: **zero** contrast failures, zero overflow at both viewports; every page has exactly one h1; no generic link text; all images aria-hidden/decorative; the practice "Flag self-doubt" switch is correctly labelled via label htmlFor.
- Keyboard focus ring visible on CTAs (screenshot `24-focus.png`); mobile header collapses cleanly; question-number grid and deck UI adapt well at 390px.

## Suggested fix order

1. `min-w-0` on course cards + `break-all`/short-hash on home bundle line (two one-line fixes, kills both mobile overflows).
2. Contrast pass on course-shell/topic-tree opacities + "Know" green.
3. topic-tree nested Link `flex gap-2` (count jam).
4. Replace hardcoded "39"s with registry count; scope-label home stats.
5. Graph label culling + search reposition; decide the /knowledge-graph vs /graph-explorer consolidation.

---

*Audit scripts: `scripts/ux_audit_inject.js`, `scripts/ux_semantics_inject.js`, `scripts/ux_audit_walk.sh`, `scripts/ux_audit_summarize.py`. Evidence: `work/ux_audit/*.png` + `*.audit.json` / `*.sem.json` (28 screenshots, 17 route audits).*
