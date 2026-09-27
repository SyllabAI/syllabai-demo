import { Suspense } from "react";
import type { Metadata } from "next";
import { TutorChat } from "./chat";

export const metadata: Metadata = { title: "Tutor — SyllabAI" };

export default function TutorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center text-sm text-muted-foreground">
          Loading tutor…
        </div>
      }
    >
      <TutorChat />
    </Suspense>
  );
}
