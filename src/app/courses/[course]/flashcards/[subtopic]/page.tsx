import { notFound } from "next/navigation";
import { loadHubCourse } from "@/lib/courses";
import { CourseHeader } from "@/components/hub/course-header";
import { DeckPlayer, type DeckCard } from "./deck-player";

export const dynamic = "force-dynamic";

export default async function FlashcardDeckPage({
  params,
}: {
  params: Promise<{ course: string; subtopic: string }>;
}) {
  const { course: slug, subtopic: subtopicCode } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();

  const subtopic = hub.index.subtopicByCode.get(subtopicCode);
  if (!subtopic) notFound();
  const topic = hub.index.topicByCode.get(subtopic.topicCode);
  const cardIds = new Set(hub.cardsBySubtopic[subtopicCode] ?? []);
  const cards: DeckCard[] = hub.flashcards
    .filter((c) => cardIds.has(c.id))
    .map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      sourceNoteId: c.sourceNoteId,
      sourceTitle: c.sourceTitle,
      provenanceTier: c.provenanceTier,
    }));

  const { meta } = hub;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <CourseHeader
          meta={meta}
          title={`${subtopic.title} (${meta.subject}): Flashcards`}
          description={
            topic
              ? `Deck ${topic.number}.${subtopic.label} — ${cards.length} card${cards.length === 1 ? "" : "s"} for “${subtopic.title}”, imported from the Save My Exams deck corpus.`
              : `${cards.length} cards for “${subtopic.title}”, imported from the Save My Exams deck corpus.`
          }
        />
        <div className="mt-6">
          <DeckPlayer course={meta.slug} subtopicCode={subtopicCode} cards={cards} />
        </div>
      </div>
    </div>
  );
}
