import { getDataProvider } from "@/lib/data";
import { ExamQuestionsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ExamQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ spec?: string }>;
}) {
  const { spec } = await searchParams;
  const provider = getDataProvider();
  const topics = await provider.examQuestionTopics();
  return <ExamQuestionsClient topics={topics} specFilter={spec ?? null} />;
}
