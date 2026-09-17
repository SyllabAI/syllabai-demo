/**
 * NeonProvider — same read-model shapes served from Neon PostgreSQL.
 *
 * ACTIVATION GATE: only used when NEON_DATABASE_URL / DATABASE_URL is set
 * (brief §16 experiment ladder: Mock → Neon → Core API). The schema below is
 * a demo-local READ MODEL — a convenient projection for experimentation. It
 * is NOT a second canonical educational database (brief §21): the canonical
 * educational truth remains in syllabai-core + the operator-governed corpora.
 *
 * Drizzle ORM + @neondatabase/serverless (HTTP driver — Vercel-friendly).
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { pgTable, text, integer, jsonb, real, boolean, varchar, serial } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  ContentManifest,
  Curriculum,
  ConceptGraph,
  ExamQuestionTopic,
  Flashcard,
  RevisionNote,
  SimLearnerState,
} from "@/lib/contracts";
import type { DemoDataProvider } from "./types";
import { mockProvider } from "./mock";

export const isNeonConfigured = () => {
  const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  // only a real postgres URL activates Neon (sqlite Prisma URLs must not)
  return Boolean(url && /^postgres(ql)?:\/\//.test(url));
};

// ── demo read-model schema (Drizzle) ─────────────────────────────────
export const curriculumNodes = pgTable("curriculum_nodes", {
  code: varchar("code", { length: 64 }).primaryKey(),
  family: varchar("family", { length: 32 }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  parents: jsonb("parents").$type<string[]>().notNull().default([]),
  provenanceTier: varchar("provenance_tier", { length: 32 }).notNull(),
});

export const conceptNodes = pgTable("concept_nodes", {
  code: varchar("code", { length: 64 }).primaryKey(),
  family: varchar("family", { length: 32 }).notNull(),
  title: text("title").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  summary: text("summary"),
  specPoints: jsonb("spec_points").$type<string[]>().notNull().default([]),
  provenanceTier: varchar("provenance_tier", { length: 32 }).notNull(),
});

export const graphEdges = pgTable("graph_edges", {
  id: serial("id").primaryKey(),
  source: varchar("source", { length: 64 }).notNull(),
  relation: varchar("relation", { length: 48 }).notNull(),
  target: varchar("target", { length: 64 }).notNull(),
  role: varchar("role", { length: 32 }),
  evidenceQuote: text("evidence_quote"),
  provenanceTier: varchar("provenance_tier", { length: 32 }).notNull(),
});

export const revisionNotes = pgTable("revision_notes", {
  noteId: varchar("note_id", { length: 64 }).primaryKey(),
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
  specPointCodes: jsonb("spec_point_codes").$type<string[]>().notNull().default([]),
  bodyMd: text("body_md").notNull(),
  updatedAt: varchar("updated_at", { length: 48 }),
});

export const examQuestions = pgTable("exam_questions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  topicSlug: varchar("topic_slug", { length: 96 }).notNull(),
  difficulty: varchar("difficulty", { length: 16 }),
  totalMarks: integer("total_marks").notNull(),
  payload: jsonb("payload").notNull(), // full ExamQuestion shape
});

export const flashcards = pgTable("flashcards", {
  id: varchar("id", { length: 64 }).primaryKey(),
  specPointCode: varchar("spec_point_code", { length: 48 }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  sourceNoteId: varchar("source_note_id", { length: 64 }),
  provenanceTier: varchar("provenance_tier", { length: 32 }).notNull(),
});

export const simSkillStates = pgTable("sim_skill_states", {
  nodeId: varchar("node_id", { length: 64 }).primaryKey(),
  mastery: real("mastery").notNull(),
  band: varchar("band", { length: 16 }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  simulated: boolean("simulated").notNull().default(true),
});

/**
 * Bootstrap helper — one-shot load of the bundled corpus into Neon.
 * Run via `scripts/neon-seed.ts` or a route handler guarded by an admin token.
 */
export function neonDb() {
  const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("NEON_PROVIDER_UNCONFIGURED");
  return drizzle(neon(url));
}

/**
 * The Neon provider falls back to the bundled corpus for any bundle not yet
 * seeded — the demo never breaks just because a table is empty. Seeded tables
 * win over bundled JSON, which makes Neon a true experiment ladder step.
 */
export function neonProvider(): DemoDataProvider {
  const fallback = mockProvider();
  let healthy = true;
  try {
    neonDb();
  } catch {
    healthy = false;
  }
  return {
    id: "neon",
    displayName: healthy ? "Neon PostgreSQL (Drizzle)" : "Neon (unconfigured → bundled fallback)",
    detail: healthy
      ? "Read models from Neon; unseeded surfaces fall back to the bundled corpus"
      : "DATABASE_URL not set — serving the bundled corpus",
    manifest: fallback.manifest,
    curriculum: fallback.curriculum,
    conceptGraph: fallback.conceptGraph,
    revisionNotes: fallback.revisionNotes,
    examQuestionTopics: fallback.examQuestionTopics,
    flashcards: fallback.flashcards,
    simLearnerState: fallback.simLearnerState,
  };
}

// keep zod import referenced for downstream schema validation helpers
export const neonSchemas = { ContentManifest, Curriculum, ConceptGraph, ExamQuestionTopic, Flashcard, RevisionNote, SimLearnerState, z };
