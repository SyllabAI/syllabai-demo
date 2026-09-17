import { listCourses } from "@/lib/courses";
import { CourseDirectory } from "./course-directory";

export const dynamic = "force-dynamic";

export default async function CoursesIndexPage() {
  const courses = await listCourses();
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Courses</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Every Edexcel IAL and IGCSE course in the SyllabAI corpus registry — 39 subjects, each
          with its own Learning Hub (revision notes, exam questions and flashcards organised
          around that course&apos;s specification tree). The pilot corpus (4CH1) is fully loaded;
          the rest show their import status honestly until their bundles land.
        </p>
      </header>
      <CourseDirectory courses={courses} />
    </div>
  );
}
