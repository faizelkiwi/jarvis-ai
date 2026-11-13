import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, ChatMessage, GenerateRequest, GenerateResponse, ToolCall } from "../types";
import { ProviderError } from "../types";

type BetaParam = Anthropic.Beta.Messages.BetaMessageParam;
type BetaBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;

/** Claude models that accept server-side refusal fallbacks. */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-2", "claude-fable-5-1", "claude-sonnet-5-5"]);

function toAnthropicMessages(messages: ChatMessage[]): BetaParam[] {
  const out: BetaParam[] = [];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      if (m.rawProvider === "anthropic" && Array.isArray(m.raw)) {
        // Replay native content unchanged (thinking blocks must be passed back verbatim).
        out.push({ role: "assistant", content: m.raw as BetaBlockParam[] });
      } else {
        const content: BetaBlockParam[] = [];
        if (m.text) content.push({ type: "text", text: m.text });
        for (const c of m.toolCalls) content.push({ type: "tool_use", id: c.id, name: c.name, input: c.input });
        out.push({ role: "assistant", content: content.length ? content : [{ type: "text", text: "(no output)" }] });
      }
    } else {
      out.push({
        role: "user",
        content: m.results.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.id,
          content: r.content,
          is_error: r.isError ?? false,
        })),
      });
    }
  }
  return out;
}

export function createAnthropicProvider(apiKey: string): AIProvider {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });

  return {
    name: "anthropic",
    async generate(req: GenerateRequest): Promise<GenerateResponse> {
      const tools: Anthropic.Beta.Messages.BetaToolUnion[] = (req.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
      }));
      if (req.webSearch) tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 5 });

      const useFallbacks = FALLBACK_MODELS.has(req.model);
      try {
        const response = await client.beta.messages.create({
          model: req.model,
          max_tokens: req.maxTokens ?? 16000,
          system: req.system,
          messages: toAnthropicMessages(req.messages),
          ...(tools.length ? { tools } : {}),
          output_config: {
            ...(req.effort ? { effort: req.effort } : {}),
            ...(req.jsonSchema ? { format: { type: "json_schema" as const, schema: req.jsonSchema } } : {}),
          },
          ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        });

        const toolCalls: ToolCall[] = [];
        const texts: string[] = [];
        const sources: { url: string; title?: string }[] = [];
        for (const block of response.content) {
          if (block.type === "text") {
            texts.push(block.text);
            for (const c of block.citations ?? []) {
              if (c.type === "web_search_result_location") sources.push({ url: c.url, title: c.title ?? undefined });
            }
          } else if (block.type === "tool_use") {
            toolCalls.push({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> });
          } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            for (const r of block.content) if (r.type === "web_search_result") sources.push({ url: r.url, title: r.title });
          }
        }

        const stop = response.stop_reason;
        return {
          text: texts.join("\n").trim(),
          toolCalls,
          stopReason:
            stop === "tool_use"
              ? "tool_use"
              : stop === "max_tokens"
                ? "max_tokens"
                : stop === "refusal"
                  ? "refusal"
                  : stop === "pause_turn"
                    ? "pause"
                    : "end",
          usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
          model: response.model,
          raw: response.content,
          sources: dedupeSources(sources),
        };
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError)
          throw new ProviderError("Anthropic rejected the API key (401). Check the key in Integrations.", "anthropic", false, 401);
        if (err instanceof Anthropic.PermissionDeniedError)
          throw new ProviderError("Anthropic denied access to this model or feature (403).", "anthropic", false, 403);
        if (err instanceof Anthropic.NotFoundError)
          throw new ProviderError(`Model "${req.model}" was not found (404).`, "anthropic", false, 404);
        if (err instanceof Anthropic.RateLimitError)
          throw new ProviderError("Anthropic rate limit reached (429). The task will be retried.", "anthropic", true, 429);
        if (err instanceof Anthropic.BadRequestError)
          throw new ProviderError(`Anthropic rejected the request: ${err.message}`, "anthropic", false, 400);
        if (err instanceof Anthropic.APIConnectionError)
          throw new ProviderError("Could not reach the Anthropic API (network error).", "anthropic", true);
        if (err instanceof Anthropic.APIError)
          throw new ProviderError(`Anthropic API error ${err.status}: ${err.message}`, "anthropic", (err.status ?? 500) >= 500, err.status);
        throw err;
      }
    },
  };
}

function dedupeSources(s: { url: string; title?: string }[]) {
  const seen = new Set<string>();
  return s.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)));
}
