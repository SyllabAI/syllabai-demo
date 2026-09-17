import { Suspense } from "react";
import { notFound } from "next/navigation";
import { loadHubCourse } from "@/lib/courses";
import { CourseShell, type SidebarData } from "@/components/hub/course-shell";

export const dynamic = "force-dynamic";

/**
 * Per-course layout — mounts the persistent Learning Hub chrome (sidebar +
 * resource topic tree) around every course surface, the SaveMyExams model
 * (research §4): one course, one sidebar, one canonical topic tree.
 */
export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();

  const data: SidebarData = {
    course: {
      slug: hub.meta.slug,
      subject: hub.meta.subject,
      level: hub.meta.level,
      code: hub.meta.code,
    },
    tree: hub.index.tree,
    counts: hub.counts,
    hrefs: hub.hrefs,
    noteSubtopic: hub.noteSubtopic,
  };

  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading course…</div>}>
      <CourseShell data={data}>{children}</CourseShell>
    </Suspense>
  );
}
