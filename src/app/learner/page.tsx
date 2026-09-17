import { getDataProvider } from "@/lib/data";
import { LearnerClient } from "./client";

export const dynamic = "force-dynamic";

export default async function LearnerPage() {
  const provider = getDataProvider();
  const state = await provider.simLearnerState();
  return <LearnerClient state={state} />;
}
