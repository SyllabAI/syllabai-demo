// Content part 2: sections 7-10 + Appendix A
"use strict";
const { h1, h2, body, bullet, figure, dataTable } = require("./sme_report_lib.js");

const S = [];

// ── 7. Supporting Study Systems ──
S.push(h1("7", "Supporting Study Systems"));
S.push(h2("7.1", "Flashcards"));
S.push(body("Flashcards are organised as per-sub-topic decks reached through the same sidebar tree (the tree header count reads Topics without note counts, and decks sit at sub-topic level, for example States of Matter: Flashcards, with 37 cards in the collection). The player is a single-card view with flip on click, Previous control, and a two-bucket self-rating after the reveal: Still learning or I know this. Supporting controls include Stuck? Help with this card (a hint affordance), Shuffle flashcards, Full screen, and a Filters menu. Below the player the full card list of the collection is rendered for browsing. The two-bucket rating rather than a three- or five-point scale is a deliberate simplification that lowers friction; it also mirrors what the SyllabAI demo flashcard surface already does with its flip interaction, so the gap is mainly the rating loop and per-deck tree integration."));
S.push(...figure("23-flashcards.png", "Flashcard player: flip card, Still learning / I know this rating, hint, shuffle and full screen controls."));
S.push(h2("7.2", "Past Papers, Mock Exams, and Target Tests"));
S.push(body("Past Papers collect every past paper for the course with mark schemes in one filterable list; Mock Exams are expert-created full practice papers that carry the Practice and Diagnose tags, meaning their results feed the analytics layer rather than stopping at a score. Target Test is the adaptive entry point: the hub describes it as custom exam practice to target your weak spots, and it assembles short tests from questions the analytics layer has identified as weaknesses. These three resources complete the Practice-Diagnose half of the framework. For SyllabAI they correspond naturally to assets that already exist (the 2,708-paper past-paper corpus) or features that are explicitly out of scope for the demo shell, but the sidebar must reserve their slots so the IA survives their arrival."));
S.push(h2("7.3", "Strengths and Weaknesses, Smart Mark, and Platform Tools"));
S.push(body("The Strengths and Weaknesses tab inside each course is the analytics destination. Anonymously it shows a Strength score panel with a No data available yet state and a How It Works triplet: Answer (progress through past-paper and exam-style questions), Analyse (strengths and weaknesses are computed by topic), and Improve (weaker topics are targeted with teacher- and examiner-created resources), plus a Try exam questions call to action. Public documentation of the logged-in feature states that it analyses every question answered, builds a personalised topic breakdown, gives instant feedback after tests, and updates continuously. Platform-level tools referenced across the site include Smart Mark (AI marking of written answers), a Study Planner, and a personal dashboard that tracks progress and highlights weak areas. Trustpilot messaging claims an average improvement of 2.6 grades, which, whatever its methodology, shows how prominently outcome claims sit next to the product."));
S.push(...figure("22-strengths-data.png", "Strengths and Weaknesses: Answer, Analyse, Improve onboarding; strength score per topic once data exists."));

// ── 8. Progress Model ──
S.push(h1("8", "The Progress Model"));
S.push(body("Progress on Save My Exams is built from three primitives. The first is the per-sub-topic progress ring, a small circular indicator that appears in every sidebar tree row across notes, questions, and flashcards. The second is the mark: in structured questions the student types a score out of the available marks after self-marking against the scheme, and in MCQs the platform marks instantly; both feed the same aggregation. The third is completion and helpfulness events on notes (and card ratings on flashcards), which round out study-side progress. Rings therefore encode a mixture of coverage (did you engage) and performance (how well you scored), which is what allows the same ring to mean something useful on a notes page and on a question set."));
S.push(body("Aggregation rises one level: topic-level rings summarise their sub-topics, and the course-level Strengths and Weaknesses view converts per-topic performance into strength scores with weak-area identification. Writing progress requires an account: submitting an MCQ answer anonymously raises a Sign up now, it is free modal, and score entry is likewise gated, although reading, browsing, PDF download, and the mark-scheme reveals all work anonymously. The design consequence for SyllabAI is direct: the demo can reproduce the entire visual and interaction system with its SIMULATED learner overlay, and the production path can persist the same events per user without changing the interface, provided the learner state remains an overlay keyed to SpecificationPoint anchors rather than a mutation of canonical content."));

// ── 9. Mapping to SyllabAI ──
S.push(h1("9", "Mapping to SyllabAI Assets and Constraints"));
S.push(body("The Save My Exams model fits the SyllabAI corpus with unusually little friction because the numbered topic tree that powers Save My Exams navigation is, in SyllabAI terms, the official specification tree. The 4CH1 hub on Save My Exams shows four numbered topics; the parsed Edexcel specification and the syllabai-resources graph-as-code files (topics, specification_points, relationships, concepts, concept_edges) already encode the same hierarchy with stable identifiers. Where Save My Exams numbers notes 1-1-1, 1-1-2, SyllabAI can route by SpecificationPoint code, which keeps provenance exact and satisfies the constraint that every surface anchors to the canonical spec model."));
S.push(body("Content readiness is uneven across resource types, and the phasing in Section 10 follows that unevenness. Revision notes and exam questions are downloaded and already imported into the demo corpus for 4CH1 (9 notes, 58 questions with parts, command words, and mark schemes in the demo subset, with the full downloaded corpus behind the importer). Flashcards are being downloaded and are additionally flagged DEMO_DERIVED when generated, so the flashcard surface can ship behind a provenance badge. Specifications are parsed, and mapping of notes and questions to spec points is ongoing and partial across the 39 courses; the hub must therefore render unmapped or partially mapped subjects honestly (a MAPPING_IN_PROGRESS badge rather than a silent empty state), consistent with the status discipline used across the SyllabAI repos."));
S.push(...dataTable(
  "Feature-to-asset mapping and readiness",
  ["SME feature", "SyllabAI asset or mechanism", "Readiness"],
  [
    ["Numbered topic tree", "Parsed spec + graph-as-code topics/specification_points", "Ready for mapped subjects; partial elsewhere"],
    ["Per-subject Learning Hub", "39 course configs (IGCSE subject or IAL unit)", "Ready; hub shell to be built"],
    ["Sidebar tree + progress rings", "DemoDataProvider tree + SIMULATED learner overlay", "Ready in demo form"],
    ["Revision Notes reader", "SME-RevisionNotes corpus, canonical rn_* ids", "Ready (4CH1 subset in demo)"],
    ["Authorship / provenance byline", "Provenance tiers (RULE_DERIVED, AI_SUGGESTED, DEMO_DERIVED)", "Ready; display as badges"],
    ["Exam Questions + mark scheme reveal", "SME-ExamQuestion topic.json (parts, command words, mark schemes)", "Ready (58 questions in demo subset)"],
    ["Self-mark score entry", "Learner overlay event sink", "Ready; SIMULATED in demo"],
    ["Difficulty tabs", "Question difficulty metadata", "Verify coverage per subject before enabling"],
    ["Guided Practice (adaptive)", "Future: provider-side adaptive selection", "Phase C; not in initial shell"],
    ["MCQ sibling sets", "MCQ question import (board-dependent)", "Import required for CIE/IAL MCQ papers"],
    ["Flashcards + rating", "Flashcard corpus (downloading); DEMO_DERIVED badge", "In progress"],
    ["Saved questions", "Overlay state (bookmarks)", "Trivial once state sink exists"],
    ["Strengths and Weaknesses", "Aggregation of overlay events by spec point", "Phase C; simulated data in demo"],
    ["Ask about this / AI tutor", "Existing grounded tutor with sufficiency gate", "Ready; anchor chat to spec point"],
  ],
  [30, 42, 28]
));
S.push(body("Two SyllabAI invariants must be preserved while porting the UX. First, chat output and practice events must never write to canonical content: the tutor answers from retrieved notes and questions with citations and refuses when the sufficiency gate fails, and self-scores land in the overlay, not in the corpus. Second, provenance must stay visible: Save My Exams earns trust with examiner bylines; SyllabAI earns it with tier badges and spec anchors on every derived artifact, including flashcards and any AI-suggested links between concepts. Where the two systems disagree, Save My Exams shows that aggressive simplification (one tree, two-bucket ratings, one ring visual) drives adoption; SyllabAI can adopt those simplifications at the interface layer without weakening the model layer."));

// ── 10. Phased Implementation Recommendations ──
S.push(h1("10", "Phased Implementation Recommendations"));
S.push(body("Phase A should deliver the hub shell and the reading loop for mapped subjects, since it requires no new content infrastructure. Concretely: a course registry for the 39 subjects and units; the persistent three-group sidebar; the hub page with exam-code pill, specification link (SyllabAI can deep-link its parsed spec rather than a PDF), and resource cards; the notes index and note reader with the sidebar tree, Previous/Next in canonical spec order, provenance byline, and the Build on this topic cross-links. The demo already contains every raw ingredient for this phase; the work is assembly and the tree component."));
S.push(body("Phase B should deliver the practice loop on top of the same tree: the question index with count pills per topic, the question set page with difficulty tabs where metadata permits, the structured player with Save, View answer mark-scheme modal (AND-joined marking points with per-point marks, which the imported mark schemes already express), the self-score entry, and the MCQ player with instant marking for subjects whose MCQ sets are imported. Saved questions and the flashcard player with two-bucket rating complete the phase. All of this writes only to the learner overlay, keeping the canonical graph untouched."));
S.push(body("Phase C should add the intelligence and analytics layer: Guided Practice-style adaptive sessions built on the retrieval and sufficiency machinery the demo already has, per-topic strength scores computed from overlay events, a Strengths and Weaknesses view per course, and Ask-about-this chat anchored to each spec point and question. This phasing keeps every phase demoable and honest: nothing in A or B requires AI, and everything in C rides on seams that already exist in the demo architecture (DemoDataProvider, provider abstraction, overlay event sink)."));
S.push(...dataTable(
  "Proposed phasing",
  ["Phase", "Scope", "Depends on"],
  [
    ["A: Hub + reading loop", "Course registry, sidebar, hub page, notes index/reader, cross-links, provenance byline", "Existing notes corpus + spec tree; demo ingredients present"],
    ["B: Practice loop", "Question index/set/player, mark-scheme modal, self-score, MCQ player, saved questions, flashcards + rating", "Question metadata (difficulty, MCQ) per subject; overlay event sink"],
    ["C: Adaptive + analytics", "Guided practice sessions, strength scores, Strengths & Weaknesses view, per-anchor AI chat", "Overlay event history; retrieval + sufficiency gate; provider abstraction"],
  ],
  [22, 46, 32]
));

// ── Appendix A ──
S.push(h1("Appendix A", "URL Taxonomy Reference"));
S.push(body("The following taxonomy was captured from live URLs during the walkthrough. Numeric identifiers (19, 17, 23) are Save My Exams internal course ids; the numbered path segments are syllabus section numbers. The pattern is stable across qualifications and boards and can be adopted almost verbatim as the SyllabAI route scheme, with spec-point codes replacing the note ordinals where a canonical code exists."));
S.push(...dataTable(
  "Captured URL patterns",
  ["Page", "URL pattern (Edexcel IGCSE Chemistry, id 19)"],
  [
    ["Course hub", "/igcse/chemistry/edexcel/19/"],
    ["Revision notes index", "/igcse/chemistry/edexcel/19/revision-notes/"],
    ["Note page", "/igcse/chemistry/edexcel/19/revision-notes/1-principles-of-chemistry/1-1-states-of-matter/1-1-1-the-three-states-of-matter/"],
    ["Exam questions index", "/igcse/chemistry/edexcel/19/topic-questions/"],
    ["Question set", "/igcse/chemistry/edexcel/19/topic-questions/1-principles-of-chemistry/1-1-states-of-matter/"],
    ["MCQ set (CIE example)", "/igcse/chemistry/cie/23/topic-questions/1-states-of-matter/1-1-solids-liquids-and-gases/multiple-choice-questions/"],
    ["Flashcards deck", "/igcse/chemistry/edexcel/19/flashcards/1-principles-of-chemistry/1-1-states-of-matter/"],
    ["Target tests", "/igcse/chemistry/edexcel/19/target-tests/"],
    ["Mock exams", "/igcse/chemistry/edexcel/19/mock-exams/"],
    ["Past papers", "/igcse/chemistry/edexcel/past-papers/"],
    ["Strengths & weaknesses", "/igcse/chemistry/edexcel/19/strengths-and-weaknesses/"],
    ["A Level hub (units via modular rows)", "/a-level/chemistry/edexcel/17/"],
  ],
  [30, 70]
));

module.exports = S;
