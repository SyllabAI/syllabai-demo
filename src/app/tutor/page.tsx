import { Suspense } from "react";
import { TutorChat } from "./chat";

export const metadata = { title: "Tutor — syllabai-demo" };

export default function TutorPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading tutor…</div>}>
      <TutorChat />
    </Suspense>
  );
}
