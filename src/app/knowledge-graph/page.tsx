import { getDataProvider } from "@/lib/data";
import { KnowledgeGraphClient } from "./client";

export const dynamic = "force-dynamic";

export default async function KnowledgeGraphPage() {
  const provider = getDataProvider();
  const [curriculum, graph, sim] = await Promise.all([
    provider.curriculum(),
    provider.conceptGraph(),
    provider.simLearnerState(),
  ]);
  return <KnowledgeGraphClient curriculum={curriculum} graph={graph} overlay={sim} />;
}
