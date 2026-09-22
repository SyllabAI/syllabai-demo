import type { Metadata } from "next";
import { TeacherClient } from "./teacher-client";

export const metadata: Metadata = {
  title: "Teacher workspace (mockup) — syllabai-demo",
  description:
    "Planned teacher mode for SyllabAI: cohort overview, spec-point mastery heatmap, assignments, AI content validation. Mockup — sign in as a teacher from /login.",
};

export default function TeacherPage() {
  return <TeacherClient />;
}
