/**
 * T-SME-11 validation: parse the 10 new content packages with the app's zod
 * contracts (same schemas the running site enforces). Run with bun.
 */
import {
  ContentManifest,
  Curriculum,
  ConceptGraph,
  RevisionNote,
  ExamQuestionTopic,
  Flashcard,
  SimLearnerState,
} from "../src/lib/contracts";
import { z } from "zod";
import { readFileSync } from "fs";

const PACKAGES = [
  "igcse-english-language-a-16-paper-1-non-fiction-texts-and-transactional-writing",
  "igcse-english-language-a-16-paper-2-poetry-and-prose-texts-and-imaginative-writing",
  "igcse-english-language-a-16-paper-3-coursework",
  "igcse-maths-b-16",
  "igcse-science-double-award-modular-24-biology-unit-1",
  "igcse-science-double-award-modular-24-biology-unit-2",
  "igcse-science-double-award-modular-24-chemistry-unit-1",
  "igcse-science-double-award-modular-24-chemistry-unit-2",
  "igcse-science-double-award-modular-24-physics-unit-1",
  "igcse-science-double-award-modular-24-physics-unit-2",
];

function read(pkg: string, file: string): unknown {
  return JSON.parse(
    readFileSync(`/home/z/my-project/content/${pkg}/${file}`, "utf8"),
  );
}

let failures = 0;
for (const pkg of PACKAGES) {
  const checks: Array<[string, z.ZodTypeAny, unknown]> = [
    ["manifest.json", ContentManifest, read(pkg, "manifest.json")],
    ["curriculum.json", Curriculum, read(pkg, "curriculum.json")],
    ["concept-graph.json", ConceptGraph, read(pkg, "concept-graph.json")],
    ["notes.json", z.array(RevisionNote), read(pkg, "notes.json")],
    ["questions.json", z.array(ExamQuestionTopic), read(pkg, "questions.json")],
    ["flashcards.json", z.array(Flashcard), read(pkg, "flashcards.json")],
    ["learner-sim.json", SimLearnerState, read(pkg, "learner-sim.json")],
  ];
  for (const [file, schema, data] of checks) {
    const r = schema.safeParse(data);
    if (r.success) {
      console.log(`OK   ${pkg.slice(0, 52).padEnd(54)} ${file}`);
    } else {
      failures++;
      const issues = r.error.issues.slice(0, 4).map((i) => `${i.path.join(".")} ${i.message}`);
      console.log(`FAIL ${pkg.slice(0, 52).padEnd(54)} ${file}: ${issues.join(" | ")}`);
    }
  }
}
console.log(failures === 0 ? "\nALL CONTRACTS PASS" : `\n${failures} CONTRACT FAILURES`);
process.exit(failures === 0 ? 0 : 1);
