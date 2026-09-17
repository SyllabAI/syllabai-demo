import { publicConfig } from "@/lib/config";
import { getCorpusIndex } from "@/lib/tutor";

export const runtime = "nodejs";

/**
 * GET /api/health — demo self-report: active data mode, AI provider,
 * corpus index size. No secrets.
 */
export async function GET() {
  const cfg = publicConfig();
  let corpusSegments: number | null = null;
  try {
    const index = await getCorpusIndex();
    corpusSegments = index.segments.length;
  } catch {
    corpusSegments = null;
  }
  return Response.json({
    status: "ok",
    service: "syllabai-demo",
    dataMode: cfg.dataMode,
    aiProvider: { id: cfg.aiProviderId, name: cfg.aiProviderName },
    neonConfigured: cfg.neonConfigured,
    coreConfigured: cfg.coreConfigured,
    corpusSegments,
    time: new Date().toISOString(),
  });
}
