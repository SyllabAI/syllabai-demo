import { getDataProvider } from "@/lib/data";
import { RevisionNotesIndex } from "./client";

export const dynamic = "force-dynamic";

export default async function RevisionNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ spec?: string }>;
}) {
  const { spec } = await searchParams;
  const provider = getDataProvider();
  const notes = await provider.revisionNotes();
  return <RevisionNotesIndex notes={notes} specFilter={spec ?? null} />;
}
