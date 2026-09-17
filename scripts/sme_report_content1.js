// Content part 1: sections 1-6
"use strict";
const { h1, h2, body, bullet, figure, dataTable } = require("./sme_report_lib.js");

const S = [];

// ── 1. Executive Summary ──
S.push(h1("1", "Executive Summary"));
S.push(body("This report documents the user experience of Save My Exams (savemyexams.com) as observed in a live browser walkthrough on 18 September 2026, focusing on the two surfaces the SyllabAI Learning Hub must replicate feature-for-feature: Revision Notes and Exam Questions. The walkthrough covered the Edexcel IGCSE Chemistry (4CH1) course end-to-end, with cross-checks against the Edexcel A Level Chemistry structure and a Cambridge (CIE) IGCSE course to capture the multiple-choice question pattern. Twenty-five annotated screenshots, the full URL taxonomy, and the interaction states of every major control were captured as evidence."));
S.push(body("Three findings matter most for SyllabAI. First, the entire product hangs off a single canonical tree: qualification, subject, exam board, numbered topic, numbered sub-topic, numbered resource. That tree is simultaneously the navigation sidebar, the URL scheme, the syllabus map, and the progress model, which means one well-modelled specification anchor can drive every surface. This maps directly onto the SyllabAI SpecificationPoint model. Second, progress is pervasive and lightweight: every sub-topic in every sidebar carries a progress ring, fed by self-entered marks on questions and completion events, and rolled up into a course-level Strengths and Weaknesses view. Third, the question experience is a loop rather than a list: attempt, self-score or submit, reveal a mark scheme with annotated marking points, jump to related notes when stuck, and save questions for later; an optional Guided Practice mode adapts difficulty based on answers."));
S.push(body("The report closes with a mapping of each observed feature to SyllabAI assets (39 Edexcel IAL and IGCSE courses, downloaded notes and exam questions, flashcards in progress, parsed specifications, ongoing spec mapping) and a three-phase implementation plan that respects SyllabAI invariants: SpecificationPoint remains the canonical anchor, learner state stays an overlay, and provenance tiers are preserved end-to-end."));

// ── 2. Research Scope and Method ──
S.push(h1("2", "Research Scope and Method"));
S.push(body("The primary research instrument was a live, unauthenticated walkthrough of savemyexams.com using a scripted headless browser (Playwright via the agent-browser CLI). Each page of interest was opened, scrolled systematically, interacted with (accordion expansion, tab switches, answer reveals, MCQ submission, toggles), and captured as a full screenshot with a structural accessibility snapshot. This combination records both the visual design and the underlying component semantics, which makes the findings directly actionable for interface implementation."));
S.push(body("Coverage centred on the Edexcel IGCSE Chemistry course (exam code 4CH1) because it is the pilot subject of the SyllabAI Cycle-1 trial and the course whose corpus SyllabAI has already imported in full. The Edexcel A Level Chemistry course was walked through to confirm how unit-based qualifications are organised, and a Cambridge (CIE) IGCSE Chemistry question set was opened to document the multiple-choice player, since Edexcel IGCSE Chemistry topic questions on Save My Exams are structured-only. Public reviews and Save My Exams feature announcements were used as secondary sources to confirm the names and scope of platform-level tools that sit behind login (Smart Mark, Study Planner, Target Tests, Strengths and Weaknesses analytics)."));
S.push(body("Two limitations should be noted. Authenticated states (saved progress syncing across devices, teacher assignments, premium-only content) were observed only at their gates, for example the sign-up prompt that appears when an anonymous user submits an MCQ answer. Server-side personalisation such as adaptive difficulty inside Guided Practice was therefore documented from its on-screen description rather than from first-hand use. Neither limitation affects the layout and interaction findings, which are fully observable anonymously."));

// ── 3. Product Model and Global IA ──
S.push(h1("3", "Product Model and Global Information Architecture"));
S.push(body("Save My Exams organises everything under a three-level qualification spine: qualification (GCSE, IGCSE, AS, A Level, IB, O Level, AP, IELTS), then subject, then exam board. The IGCSE landing page lists subjects as expandable accordion rows; expanding a subject reveals board tabs (for Chemistry: Cambridge CIE, Edexcel, Oxford AQA), an Add to my subjects personalisation button, and a fixed set of resource links per board. For modular qualifications the same pattern recurses: IGCSE Science subjects appear as separate rows per unit (for example Chemistry Modular: Unit 1 and Unit 2), which is exactly how an A Level-style unit split must be handled."));
S.push(body("Six resource types are exposed per course: Revision Notes, Exam Questions (topic questions), Flashcards, Target Test, Past Papers, and Mock Exams, together with a Course Overview page. The subject accordion for Edexcel IGCSE Chemistry exposes exactly this set, and the course hub groups them into two labelled bands: Revision (Revision Notes, Flashcards) and Exam Practice (Exam Questions, Target Test, Past Papers, Mock Exams). Every resource card is additionally tagged with one or more of three framework labels that Save My Exams uses as its pedagogy: Study (notes), Practice (questions, past papers, flashcards), and Diagnose (Target Test, Mock Exams, Strengths and Weaknesses). The hub page states this framework explicitly as a revision loop: Study, then Practice, then Diagnose."));
S.push(body("The URL scheme is fully hierarchical and human-readable, mirroring the numbered syllabus: /igcse/chemistry/edexcel/19/ identifies the course, and resources hang beneath it as /revision-notes/1-principles-of-chemistry/1-1-states-of-matter/1-1-1-the-three-states-of-matter/. Numbers are the syllabus section numbers, so the URL is simultaneously a spec reference. Appendix A gives the full taxonomy. For SyllabAI this confirms a design principle already adopted in the specification model: make the official numbering the primary key of navigation, and derive every route, breadcrumb, and sidebar from it."));
S.push(...dataTable(
  "Resource suite exposed per course on Save My Exams",
  ["Resource", "Band", "Framework tag", "On-page description"],
  [
    ["Revision Notes", "Revision", "Study", "Concise notes written to the exact syllabus, downloadable as PDFs"],
    ["Flashcards", "Revision", "Practice", "Per-topic decks for key facts and definitions"],
    ["Exam Questions", "Exam Practice", "Study / Practice / Diagnose", "Past-paper, exam-style and quiz questions with solutions, organised by topic"],
    ["Target Test", "Exam Practice", "Practice / Diagnose", "Custom exam practice that targets weak spots"],
    ["Past Papers", "Exam Practice", "Practice", "All past papers for the course in one place"],
    ["Mock Exams", "Exam Practice", "Practice / Diagnose", "Expert-created full practice papers"],
  ],
  [22, 18, 24, 36]
));

// ── 4. Learning Hub ──
S.push(h1("4", "The Learning Hub: Per-Subject Anatomy"));
S.push(body("The course hub (Save My Exams calls it Course Resources) is the per-subject Learning Hub. Its layout has three stable regions. A persistent left sidebar carries the course-wide navigation in three groups: Course (Course Resources, Strengths and Weaknesses), Revision (Revision Notes, Flashcards), and Exam Practice (Exam Questions, Target Test, Past Papers, Mock Exams). The sidebar is collapsible (Hide menu) and identical on every page of the course, so the student is never more than one click from any resource. A top header carries the global student-versus-teacher switch, a study tools menu, subject search, and the dark-mode toggle that Save My Exams exposes site-wide."));
S.push(...figure("03-edexcel-chem-hub.png", "Edexcel IGCSE Chemistry hub: persistent course sidebar, breadcrumb, exam-code pill, specification download card."));
S.push(body("The main column opens with a breadcrumb (Home / IGCSE / Chemistry / Edexcel), an exam-code pill in the top right (Exam code: 4CH1), the course title with a one-paragraph description, and an Add to my subjects button that pins the course to the student header for one-click return. Directly beneath sits a specification download card: Specification 4CH1 with a Download action. This is a deliberate trust signal; the hub visibly anchors itself to the official syllabus document before showing any of its own content."));
S.push(body("Below the header the hub lists its resources as cards in the two bands described in Section 3. Each card pairs an icon, the framework tags, a one-line description, and two actions: an All topics deep link (for topic-organised resources) and a Go to primary action. The hub then restates the pedagogy (Our revision framework: Study, Practice, Diagnose) and finishes with an Explore by topic section that links the numbered topics (1. Principles of Chemistry through 4. Organic Chemistry), previewing the topic tree that every resource page will expand in its sidebar."));
S.push(...figure("04-hub-cards.png", "Hub resource cards with framework tags; note All topics and Go to actions per card."));
S.push(body("A second hub tab, Strengths and Weaknesses, sits beside Course Resources in the main column as well as in the sidebar. It is the analytics destination fed by question activity (Section 8). The hub therefore has a dual role: a marketing-shaped landing page for discovery and a genuine dashboard entry point once the student has answered questions."));

// ── 5. Revision Notes ──
S.push(h1("5", "Revision Notes: UX Teardown"));
S.push(h2("5.1", "Index Page and Topic Tree"));
S.push(body("The Revision Notes index page opens with the standard header block (breadcrumb, title pattern Edexcel IGCSE Chemistry Revision Notes, exam-code pill, and two short positioning paragraphs) followed by the full course tree rendered in the page body: numbered topics as section headings, sub-topics as accordion buttons, and note pages as links inside the expanded accordion. The first sub-topic of the first topic is expanded by default so the page never reads as a wall of collapsed headers. Note titles are concrete and syllabus-phrased (for example Practical: Investigate the Solubility of a Solid in Water at a Specific Temperature), which signals spec coverage to a revising student at a glance."));
S.push(...figure("05-notes-tree.png", "Revision Notes index: numbered topic headings with sub-topic accordions and note links."));
S.push(h2("5.2", "Sidebar Tree and Progress Rings"));
S.push(body("On any note page the left sidebar switches from resource links to the topic tree for the current resource, headed by a View all topics link that returns to the index. The tree shows the current topic expanded (1. Principles of Chemistry, annotated 9 Topics - 40 Revision Notes) and every other topic collapsed with its own counts (2. Inorganic Chemistry, 8 Topics - 36 Revision Notes, and so on). Each sub-topic row carries a circular progress ring, empty at 0 percent; the current page is marked with a filled blue bullet, and unpublished or locked pages are greyed. A Hide topics toggle collapses the whole tree to give the reading column full width. The identical tree reappears in Exam Questions and Flashcards with resource-appropriate counts and annotations, which means students learn one navigation model for the whole product."));
S.push(...figure("07-note-page-top.png", "Note page: sidebar tree with progress rings, authorship block, exam board selector, guided study banner, PDF download."));
S.push(h2("5.3", "Note Page Anatomy"));
S.push(body("A note page is a tightly standardised article. The header carries the title with the qualification in parentheses (The Three States of Matter (Edexcel IGCSE Chemistry): Revision Note), an exam-code pill, a prominent Download PDF button, and a dual authorship block: Written by and Reviewed by with photographed avatars and a verified check, plus an Updated on date and an Exam board selector dropdown. This provenance-byline pattern is worth replicating because it converts reviewer identity into perceived reliability; the SyllabAI analogue is the SME-reviewer and provenance-tier metadata already present in the notes corpus."));
S.push(body("The body content follows a fixed component vocabulary: H2 section headings, short bullet exposition with bolded key terms, summary tables, diagrams with italic captions, embedded explainer videos with play controls, and a distinctive callout type titled Examiner Tips and Tricks. Content is metered for anonymous users: partway down, the page transitions into an Unlock more, it is free paywall band. The audio narration player (Play 1.1.1 EDX IGCSE States of Matter) sits above the content, indicating per-note recorded audio keyed to the same numbering as the URL."));
S.push(body("A guided study banner overlays the top of the content: Guided study available on this topic, with an Ask about this pill that opens an AI chat anchored to the note, and a Start guided study button that launches a step-through mode with understanding checks. This is the first of two AI-assist surfaces observed on content pages; the second is the persistent floating Ask about this chip available throughout reading and question answering."));
S.push(...figure("12-note-tips.png", "Note footer: helpfulness vote and Build on this topic cross-links to Exam Questions and Flashcards for the same topic."));
S.push(h2("5.4", "Note Footer and Cross-Links"));
S.push(body("Every note ends with the same three-part footer. First a micro-feedback prompt: Was this revision note helpful? with Yes and No. Second a Build on this topic block with two cross-resource cards: Check your understanding (Try an Exam Question on this topic) and Test your recall (Reinforce key facts and definitions with Flashcards), each linking to the same topic in the other resource. Third, Previous and Next buttons that walk the student through the entire note sequence of the course in canonical order, so the tree also functions as a linear course. An author card and a related-resources rail close the page. The cross-link cards are the connective tissue of the Learning Hub loop and should be treated as mandatory rather than decorative in the SyllabAI implementation."));
S.push(...dataTable(
  "Note page component inventory (in page order)",
  ["Component", "Behaviour", "Purpose"],
  [
    ["Breadcrumb + exam-code pill", "Static context row", "Always show board and spec code"],
    ["Download PDF", "Generates full note PDF", "Offline revision; trust"],
    ["Written by / Reviewed by", "Avatars, verified badge, updated date", "Provenance and credibility"],
    ["Exam board selector", "Dropdown to sibling board courses", "Disambiguation across boards"],
    ["Audio play button", "Narrated version of the note", "Auditory and accessibility revision"],
    ["Guided study banner", "Launches step-through mode with checks", "Active reading with comprehension gates"],
    ["Ask about this", "AI chat anchored to current note", "Instant help without leaving page"],
    ["Examiner Tips callouts", "Highlighted advice blocks in body", "Exam-technique signal amid content"],
    ["Helpful Yes/No", "One-click rating", "Content quality telemetry"],
    ["Build on this topic", "Two cards to questions and flashcards", "Study-to-practice loop"],
    ["Previous / Next", "Canonical course-order navigation", "Tree doubles as linear course"],
  ],
  [26, 38, 36]
));

// ── 6. Exam Questions ──
S.push(h1("6", "Exam Questions: UX Teardown"));
S.push(h2("6.1", "Index Page: Question Bank as Topic Cards"));
S.push(body("The Exam Questions index (titled Edexcel IGCSE Chemistry Exam Questions By Topic) abandons the accordion tree used by notes in favour of grouped cards. Each numbered topic is a section with aggregate statistics rendered as pills next to the heading: an estimated work amount (21 hours for Principles of Chemistry) and a question count (187 questions). Beneath each topic heading, sub-topic cards with arrow affordances link to the question sets, and every card row has a Download PDF action for printing the set with its solutions. The aggregate statistics set expectations before the student commits, and the question counts echo in the sidebar tree afterwards."));
S.push(...figure("13-questions-tree.png", "Exam Questions index: topic groups with time and question-count pills, sub-topic cards, per-set PDF download."));
S.push(h2("6.2", "Question Set Page: Tree, Difficulty Tabs, Guided Practice"));
S.push(body("A question set page (for example States of Matter: Exam Questions, 2 hours - 23 questions) is dominated by three controls above the question list. Difficulty tabs (Easy, Medium, Hard) segment the set; on structured sets the tabs filter question groups by assessed difficulty, and each question card additionally shows its part label (1a, 1b) and mark total as chips. A Download PDF button and an All answers button provide print and bulk-answer access. Finally a Guided Practice toggle switches the page from a browsable list into an adaptive session player: the expanded panel shows Questions and Score counters, states that difficulty adapts based on your answers with support when needed and personalised feedback, and offers a single Start practising action."));
S.push(...figure("14-question-set.png", "Question set header: meta line (2 hours, 23 questions), Guided Practice toggle, PDF and All answers, Easy/Medium/Hard tabs, question grid."));
S.push(body("The sidebar on question pages mirrors the notes tree but counts questions per topic (187 questions under Principles of Chemistry) and adds a Saved questions entry with a bookmark icon above the tree, giving students a personal shortlist independent of the topic structure. Progress rings appear per sub-topic exactly as in notes, and they aggregate the scores students enter while practising."));
S.push(h2("6.3", "The Question Player: Structured Questions"));
S.push(body("Each question renders as a card with a persistent toolbar: Full screen, Save (bookmark to Saved questions), a score entry field labelled Score out of N, Question help, and View answer. Structured questions show the stem, any embedded diagram, and lettered parts with mark allocations rendered at the right margin (for example (1)). The score entry is the core interaction: after attempting on paper, the student reveals the mark scheme, decides their mark, and types it in. A How did you do? prompt with an inline score box (rendered as a dash out of the available marks until filled) repeats the invitation per question group, and Question help expands a Related notes panel that links back to the revision note for that topic, closing the practice-to-study loop in the opposite direction from the note footer."));
S.push(...figure("15-question-player.png", "Structured question with diagram and part marks; toolbar with Save, score entry, Question help, View answer."));
S.push(body("View answer opens a full-screen mark-scheme modal. The modal header carries a topic pill (States of Matter) and a close control; the body restates the question in a collapsible card (part label and marks chip, Show more expander) and then presents the marking points as bullets joined by bold AND connectors, each annotated with its mark value in a highlighted colour ([1 mark]), followed by worked diagrams where relevant. The AND/[1 mark] formatting mirrors real Edexcel mark schemes and teaches students to mark themselves the way an examiner would. Mark my answer, an AI-marking affordance on select questions, pairs a free-text Your answer box with an immediate marking action, previewing the platform-wide Smart Mark capability."));
S.push(...figure("16-answer-reveal.png", "Full-screen mark scheme: question restated with Show more, marking points as AND-joined bullets tagged [1 mark], worked diagram."));
S.push(...figure("17-mark-my-answer.png", "Self-marking loop: How did you do? inline score box (dash out of 3), Question help and View answer in the question footer."));
S.push(h2("6.4", "The Question Player: Multiple-Choice Questions"));
S.push(body("For courses with MCQ papers (Cambridge IGCSE and IAL sciences), the sub-topic tree gains two leaf levels: Multiple Choice Questions and Theory Questions as sibling question sets under the same sub-topic. The MCQ player renders the stem with a 1 mark chip, lists options as A-D lettered rows, and provides a Choose your answer row of letter pills plus a Submit answer button. On submit, the platform marks instantly and surfaces a Next question action, forming a rapid session loop; saving the result to progress triggers the sign-up wall for anonymous users. The structural lesson for SyllabAI is that MCQ is not a variant of the structured player but a sibling set type with its own node in the tree, its own pagination, and instant marking instead of self-marking."));
S.push(...figure("24-mcq-player.png", "MCQ player: A-D options, Choose your answer pills, Submit answer; sidebar shows MCQ and Theory Questions as sibling leaf sets."));
S.push(...dataTable(
  "Player controls and their behaviour",
  ["Control", "Applies to", "Behaviour observed"],
  [
    ["Difficulty tabs", "Structured sets", "Segment set into Easy / Medium / Hard"],
    ["Guided Practice toggle", "Whole set", "Adaptive session mode; difficulty adapts to answers; Start practising CTA"],
    ["Question grid (1-10)", "Both set types", "Jump to question; active state on current"],
    ["Full screen", "Per question", "Distraction-free rendering of one question"],
    ["Save", "Per question", "Bookmark to Saved questions sidebar entry"],
    ["Score out of N", "Structured", "Self-entered mark; feeds progress rings"],
    ["Question help", "Per question", "Expands Related notes panel linking to the topic note"],
    ["View answer", "Both", "Full-screen mark scheme modal with AND-joined marking points"],
    ["Mark my answer", "Select questions", "Free-text answer box with AI marking"],
    ["Submit answer", "MCQ", "Instant marking with correct/incorrect, then Next question"],
  ],
  [24, 22, 54]
));

module.exports = S;
