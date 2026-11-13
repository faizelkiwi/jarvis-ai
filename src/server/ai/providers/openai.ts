import type { AIProvider, ChatMessage, GenerateRequest, GenerateResponse } from "../types";
import { ProviderError } from "../types";

/** OpenAI Chat Completions adapter (REST). */
export function createOpenAIProvider(apiKey: string): AIProvider {
  return {
    name: "openai",
    async generate(req: GenerateRequest): Promise<GenerateResponse> {
      const messages: unknown[] = [{ role: "system", content: req.system }];
      for (const m of req.messages as ChatMessage[]) {
        if (m.role === "user") messages.push({ role: "user", content: m.content });
        else if (m.role === "assistant")
          messages.push({
            role: "assistant",
            content: m.text || null,
            ...(m.toolCalls.length
              ? {
                  tool_calls: m.toolCalls.map((c) => ({
                    id: c.id,
                    type: "function",
                    function: { name: c.name, arguments: JSON.stringify(c.input) },
                  })),
                }
              : {}),
          });
        else for (const r of m.results) messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
      }
      const body: Record<string, unknown> = {
        model: req.model,
        messages,
        max_completion_tokens: req.maxTokens ?? 8000,
      };
      if (req.tools?.length)
        body.tools = req.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        }));
      if (req.jsonSchema)
        body.response_format = { type: "json_schema", json_schema: { name: "output", schema: req.jsonSchema } };

      let res: Response;
      try {
        res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(300_000),
        });
      } catch {
        throw new ProviderError("Could not reach the OpenAI API (network error).", "openai", true);
      }
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new ProviderError(`OpenAI API error ${res.status}: ${msg.slice(0, 300)}`, "openai", res.status === 429 || res.status >= 500, res.status);
      }
      const data = await res.json();
      const choice = data.choices?.[0];
      const toolCalls = (choice?.message?.tool_calls ?? []).map((tc: { id: string; function: { name: string; arguments: string } }) => {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch {
          input = { _invalid_json: tc.function.arguments };
        }
        return { id: tc.id, name: tc.function.name, input };
      });
      return {
        text: choice?.message?.content ?? "",
        toolCalls,
        stopReason: toolCalls.length ? "tool_use" : choice?.finish_reason === "length" ? "max_tokens" : "end",
        usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
        model: data.model ?? req.model,
      };
    },
  };
}

export async function openAIEmbed(apiKey: string, inputs: string[], dimensions: number): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: inputs, dimensions }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new ProviderError(`OpenAI embeddings error ${res.status}`, "openai", res.status >= 500, res.status);
  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}
