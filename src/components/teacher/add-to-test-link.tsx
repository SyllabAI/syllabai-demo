"use client";

/**
 * Teacher affordance on the shared exam-questions index (TEACHER-2):
 * TEACHER_ARCHITECTURE §5 — the teacher's resource surface adds actions such
 * as "add to custom test". Renders only for the teacher role (mock identity);
 * deep-links into the Test Builder with the topic's subtopics preselected.
 */
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { useIdentity } from "@/lib/identity";

export function AddToTestLink({
  courseSlug,
  codes,
}: {
  courseSlug: string;
  codes: string[];
}) {
  const identity = useIdentity();
  if (identity?.role !== "teacher" || codes.length === 0) return null;
  return (
    <Link
      href={`/teacher/test-builder?course=${courseSlug}&subtopics=${encodeURIComponent(codes.join(","))}`}
      className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      <ClipboardList className="size-3" aria-hidden />
      Add topic to Test Builder
    </Link>
  );
}
