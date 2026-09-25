/**
 * AI provider abstraction (brief §11).
 *
 *   AIProvider
 *    ├── Groq        (GROQ_API_KEY)
 *    ├── OpenRouter  (OPENROUTER_API_KEY)
 *    ├── Gemini      (GEMINI_API_KEY)
 *    ├── FreeLLM     (FREELLM_API_KEY, OpenAI-compatible)
 *    ├── Zai         (ZAI_BASE_URL + ZAI_API_KEY env, or the SDK's .z-ai-config
 *    │                file in the sandbox — see zaiProvider below)
 *    └── Mock        (deterministic offline fallback)
 *
 * All adapters are SERVER-ONLY. Keys never reach the browser; the client only
 * ever talks to /api/ai/chat on this origin. Provider selection is
 * configuration (DEMO_AI_PROVIDER), not code scattered through components.
 */
import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AiCompletionRequest, AiCompletionResult, AiProvider } from "@/lib/contracts";

export function firstAvailable(): AiProvider {
  const pool = getProviderPool();
  return pool[0] ?? mockProvider();
}

export function getProviderPool(): AiProvider[] {
  const pool: AiProvider[] = [];
  const forced = process.env.DEMO_AI_PROVIDER;
  const wanted = forced ? [forced] : ["groq", "openrouter", "gemini", "freellm", "zai"];
  const all: Record<string, () => AiProvider> = {
    groq: () => groqProvider(),
    openrouter: () => openRouterProvider(),
    gemini: () => geminiProvider(),
    freellm: () => freeLlmProvider(),
    zai: () => zaiProvider(),
    mock: () => mockProvider(),
  };
  for (const id of wanted) {
    try {
      const p = all[id]?.();
      if (p && p.available()) pool.push(p);
    } catch {
      // adapter construction must never break the app
    }
  }
  return pool;
}

export function resolveAiProvider(): AiProvider {
  const forced = process.env.DEMO_AI_PROVIDER;
  if (forced) {
    const pool = getProviderPool();
    const match = pool.find((p) => p.id === forced);
    if (match) return match;
  }
  return firstAvailable();
}

// ── OpenAI-compatible adapter factory ────────────────────────────────
interface OpenAiCompatConfig {
  id: string;
  displayName: string;
  defaultModel: string;
  baseUrl: string;
  apiKeyEnv: string;
  extraHeaders?: Record<string, string>;
}

function openAiCompatible(cfg: OpenAiCompatConfig): AiProvider {
  const key = () => process.env[cfg.apiKeyEnv];
  return {
    id: cfg.id as never,
    displayName: cfg.displayName,
    model: cfg.defaultModel,
    available: () => Boolean(key()),
    async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
      const started = Date.now();
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key()}`,
          ...(cfg.extraHeaders ?? {}),
        },
        body: JSON.stringify({
          model: process.env[`${cfg.apiKeyEnv}_MODEL`] ?? cfg.defaultModel,
          messages: req.messages,
          temperature: req.temperature ?? 0.3,
          max_tokens: req.maxTokens ?? 900,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`${cfg.id}_HTTP_${res.status}: ${detail.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return {
        text: json.choices?.[0]?.message?.content ?? "",
        provider: cfg.id,
        model: process.env[`${cfg.apiKeyEnv}_MODEL`] ?? cfg.defaultModel,
        latencyMs: Date.now() - started,
      };
    },
  };
}

export const groqProvider = () =>
  openAiCompatible({
    id: "groq",
    displayName: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
  });

export const openRouterProvider = () =>
  openAiCompatible({
    id: "openrouter",
    displayName: "OpenRouter",
    defaultModel: "google/gemini-2.0-flash-exp:free",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    extraHeaders: { "HTTP-Referer": "https://syllabai-demo.vercel.app" },
  });

export const freeLlmProvider = () =>
  openAiCompatible({
    id: "freellm",
    displayName: "FreeLLM API",
    defaultModel: "default",
    baseUrl: process.env.FREELLM_BASE_URL ?? "https://api.freellm.dev/v1",
    apiKeyEnv: "FREELLMA_API_KEY" in process.env ? "FREELLMA_API_KEY" : "FREELLM_API_KEY",
  });

export const geminiProvider = (): AiProvider => ({
  id: "gemini",
  displayName: "Google Gemini",
  model: "gemini-2.0-flash",
  available: () => Boolean(process.env.GEMINI_API_KEY),
  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const started = Date.now();
    const model = process.env.GEMINI_API_KEY_MODEL ?? "gemini-2.0-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: req.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          systemInstruction: {
            parts: [{ text: req.messages.find((m) => m.role === "system")?.content ?? "" }],
          },
          generationConfig: { temperature: req.temperature ?? 0.3, maxOutputTokens: req.maxTokens ?? 900 },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`gemini_HTTP_${res.status}: ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return {
      text: json.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
      provider: "gemini",
      model,
      latencyMs: Date.now() - started,
    };
  },
});

export const zaiProvider = (): AiProvider => {
  // env-var mode — the deployment path (Vercel). The SDK's ZAI.create() only
  // reads a .z-ai-config FILE (cwd / ~ / /etc; no constructor args, no env
  // support), which cannot exist on a serverless host. The endpoint it wraps
  // is a plain OpenAI-compatible POST, so we speak it directly. Required
  // header trio (probed live, s134): Authorization: Bearer, X-Z-AI-From: Z,
  // X-Token — the endpoint 401s "missing X-Token header" without the last
  // one, so all three env values gate env-mode engagement (a partial config
  // falls through to the honest mock instead of failing every call at 401).
  // ZAI_USER_ID / ZAI_CHAT_ID are optional passthroughs; X-Chat-Id is left
  // unsent by default because pinning to one chat thread rate-limits (429).
  // The optional `model` body field is accepted (verified 200 with/without).
  const baseUrl = process.env.ZAI_BASE_URL;
  const apiKey = process.env.ZAI_API_KEY;
  const apiToken = process.env.ZAI_TOKEN;
  if (baseUrl && apiKey && apiToken) {
    const model = process.env.ZAI_MODEL ?? "glm";
    return {
      id: "zai",
      displayName: "Z.ai",
      model,
      available: () => true,
      async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
        const started = Date.now();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-Z-AI-From": "Z",
          "X-Token": apiToken,
        };
        if (process.env.ZAI_USER_ID) headers["X-User-Id"] = process.env.ZAI_USER_ID;
        if (process.env.ZAI_CHAT_ID) headers["X-Chat-Id"] = process.env.ZAI_CHAT_ID;
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages: req.messages,
            temperature: req.temperature ?? 0.3,
            max_tokens: req.maxTokens ?? 900,
          }),
          signal: AbortSignal.timeout(45_000),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`zai_HTTP_${res.status}: ${detail.slice(0, 200)}`);
        }
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        return {
          text: json.choices?.[0]?.message?.content ?? "",
          provider: "zai",
          model,
          latencyMs: Date.now() - started,
        };
      },
    };
  }

  // SDK mode — the sandbox default, where .z-ai-config is preinstalled.
  // available() is honest now: without env vars AND without a config file
  // the provider is NOT in the pool, so an unconfigured deployment falls
  // through to the clearly-labeled mock instead of failing every call at
  // runtime with "Configuration file not found".
  return {
    id: "zai",
    displayName: "Z.ai (sandbox default)",
    model: "glm",
    available: zaiSdkConfigExists,
    async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
      const started = Date.now();
      const ZAI = (await import("z-ai-web-dev-sdk")).default;
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: req.messages as never,
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxTokens ?? 900,
      });
      return {
        text: completion.choices[0]?.message?.content ?? "",
        provider: "zai",
        model: "glm (z-ai-web-dev-sdk)",
        latencyMs: Date.now() - started,
      };
    },
  };
};

/** The SDK's loadConfig() searches exactly these three paths (dist/index.js). */
function zaiSdkConfigExists(): boolean {
  for (const p of [
    path.join(process.cwd(), ".z-ai-config"),
    path.join(os.homedir(), ".z-ai-config"),
    "/etc/.z-ai-config",
  ]) {
    try {
      if (fs.existsSync(p)) return true;
    } catch {
      // a broken fs probe must never take the provider pool down
    }
  }
  return false;
}

export const mockProvider = (): AiProvider => ({
  id: "mock",
  displayName: "Offline mock (no network)",
  model: "deterministic-v0",
  available: () => true,
  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const last = req.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    return {
      text:
        `[offline-mock] No AI provider key is configured, so this is a deterministic placeholder.\n\n` +
        `You asked: “${last.slice(0, 220)}”\n\n` +
        `Set GROQ_API_KEY / OPENROUTER_API_KEY / GEMINI_API_KEY / FREELLM_API_KEY, or ` +
        `ZAI_BASE_URL + ZAI_API_KEY + ZAI_TOKEN, to get real model output; ` +
        `in the sandbox the z.ai default provider answers instead of this message.`,
      provider: "mock",
      model: "deterministic-v0",
      latencyMs: 5,
    };
  },
});
