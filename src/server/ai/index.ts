import { getDb } from "../db/client";
import { aiUsage } from "../db/schema";
import { getIntegrationSecrets } from "../integrations/service";
import { getSetting } from "../settings/service";
import type { ProviderName } from "../settings/defaults";
import { createAnthropicProvider } from "./providers/anthropic";
import { createDemoProvider } from "./providers/demo";
import { createGeminiProvider } from "./providers/gemini";
import { createOpenAIProvider } from "./providers/openai";
import { ProviderNotConfiguredError, type AIProvider, type GenerateRequest, type GenerateResponse } from "./types";

export function isDemoMode() {
  return process.env.JARVIS_DEMO_MODE === "true";
}

/** USD per million tokens [input, output]. Used for cost estimates only. */
const PRICING: Record<string, [number, number]> = {
  "claude-fable-5-2": [8, 40],
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const p = PRICING[model] ?? (model.startsWith("claude") ? [4, 20] : [2.5, 10]);
  return (inputTokens * p[0] + outputTokens * p[1]) / 1_000_000;
}

const testOverride = globalThis as unknown as { __jarvisProviderOverride?: AIProvider };
/** Test hook: force a specific provider implementation. */
export function __setProviderOverride(p: AIProvider | undefined) {
  testOverride.__jarvisProviderOverride = p;
}

export async function getProvider(name: ProviderName): Promise<AIProvider> {
  if (testOverride.__jarvisProviderOverride) return testOverride.__jarvisProviderOverride;
  if (isDemoMode() || name === "demo") return createDemoProvider();
  const secrets = await getIntegrationSecrets(name);
  if (!secrets.apiKey) throw new ProviderNotConfiguredError(name);
  if (name === "anthropic") return createAnthropicProvider(secrets.apiKey);
  if (name === "openai") return createOpenAIProvider(secrets.apiKey);
  if (name === "gemini") return createGeminiProvider(secrets.apiKey);
  throw new ProviderNotConfiguredError(name);
}

export async function resolveModel(agent?: { provider: string | null; model: string | null; effort: string | null } | null) {
  const d = await getSetting("ai.defaults");
  const provider = (agent?.provider ?? d.provider) as ProviderName;
  // A provider-specific model only makes sense with its provider.
  const model = agent?.model ?? (provider === d.provider ? d.model : provider === "openai" ? "gpt-5" : provider === "gemini" ? "gemini-2.5-pro" : d.model);
  const effort = (agent?.effort ?? d.effort) as GenerateRequest["effort"];
  return { provider, model, effort };
}

/** Generate + record token usage and estimated cost. */
export async function generateTracked(
  provider: AIProvider,
  req: GenerateRequest,
  meta: { purpose: string; agentId?: string | null; taskId?: string | null },
): Promise<GenerateResponse> {
  const res = await provider.generate(req);
  const db = await getDb();
  await db.insert(aiUsage).values({
    provider: provider.name,
    model: res.model || req.model,
    agentId: meta.agentId ?? null,
    taskId: meta.taskId ?? null,
    purpose: meta.purpose,
    inputTokens: res.usage.inputTokens,
    outputTokens: res.usage.outputTokens,
    costUsd: provider.name === "demo" ? "0" : estimateCostUsd(req.model, res.usage.inputTokens, res.usage.outputTokens).toFixed(6),
  });
  return res;
}
