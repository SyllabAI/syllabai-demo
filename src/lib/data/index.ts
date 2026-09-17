/**
 * Data-provider factory (brief §16). Selection order:
 *
 *   1. DEMO_DATA_MODE env ("mock" | "neon" | "core-api") — explicit override
 *   2. core-api when SYLLABAI_CORE_BASE_URL is set
 *   3. neon when NEON_DATABASE_URL / DATABASE_URL is set
 *   4. mock (always available — the hermetic default)
 */
import "server-only";
import type { DemoDataProvider } from "./types";
import { mockProvider } from "./mock";
import { coreApiProvider, isCoreApiConfigured } from "./core-api";
import { isNeonConfigured, neonProvider } from "./neon";

export type DataMode = "mock" | "neon" | "core-api";

export function resolveDataMode(): DataMode {
  const forced = process.env.DEMO_DATA_MODE as DataMode | undefined;
  if (forced === "mock" || forced === "neon" || forced === "core-api") return forced;
  if (isCoreApiConfigured()) return "core-api";
  if (isNeonConfigured()) return "neon";
  return "mock";
}

export function getDataProvider(): DemoDataProvider {
  switch (resolveDataMode()) {
    case "core-api":
      return coreApiProvider();
    case "neon":
      return neonProvider();
    default:
      return mockProvider();
  }
}
