/**
 * Public (non-secret) runtime configuration surfaced to the client for the
 * mode badges. SERVER secrets are never exported here — only which provider
 * ids are active, never their keys.
 */
import "server-only";
import { resolveDataMode } from "@/lib/data";
import { isNeonConfigured } from "@/lib/data/neon";
import { isCoreApiConfigured } from "@/lib/data/core-api";
import { resolveAiProvider } from "@/lib/ai/providers";

export interface PublicConfig {
  dataMode: "mock" | "neon" | "core-api";
  aiProviderId: string;
  aiProviderName: string;
  neonConfigured: boolean;
  coreConfigured: boolean;
}

export function publicConfig(): PublicConfig {
  const ai = resolveAiProvider();
  return {
    dataMode: resolveDataMode(),
    aiProviderId: ai.id,
    aiProviderName: ai.displayName,
    neonConfigured: isNeonConfigured(),
    coreConfigured: isCoreApiConfigured(),
  };
}
