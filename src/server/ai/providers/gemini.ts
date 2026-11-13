import type { AIProvider, GenerateRequest, GenerateResponse } from "../types";
import { ProviderError } from "../types";

/** Google Gemini generateContent adapter (REST). */
export function createGeminiProvider(apiKey: string): AIProvider {
  return {
    name: "gemini",
    async generate(req: GenerateRequest): Promise<GenerateResponse> {
      const contents: unknown[] = [];
      for (const m of req.messages) {
        if (m.role === "user") contents.push({ role: "user", parts: [{ text: m.content }] });
        else if (m.role === "assistant")
          contents.push({
            role: "model",
            parts: [
              ...(m.text ? [{ text: m.text }] : []),
              ...m.toolCalls.map((c) => ({ functionCall: { name: c.name, args: c.input } })),
            ],
          });
        else
          contents.push({
            role: "user",
            parts: m.results.map((r) => ({ functionResponse: { name: r.name, response: { content: r.content } } })),
          });
      }
      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents,
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 8000,
          ...(req.jsonSchema ? { responseMimeType: "application/json" } : {}),
        },
      };
      if (req.tools?.length)
        body.tools = [
          { functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })) },
        ];
      let res: Response;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`,
          {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(300_000),
          },
        );
      } catch {
        throw new ProviderError("Could not reach the Gemini API (network error).", "gemini", true);
      }
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new ProviderError(`Gemini API error ${res.status}: ${msg.slice(0, 300)}`, "gemini", res.status === 429 || res.status >= 500, res.status);
      }
      const data = await res.json();
      const cand = data.candidates?.[0];
      const parts: { text?: string; functionCall?: { name: string; args: Record<string, unknown> } }[] = cand?.content?.parts ?? [];
      const toolCalls = parts
        .filter((p) => p.functionCall)
        .map((p, i) => ({ id: `gem_${Date.now()}_${i}`, name: p.functionCall!.name, input: p.functionCall!.args ?? {} }));
      return {
        text: parts.map((p) => p.text ?? "").join(""),
        toolCalls,
        stopReason: toolCalls.length ? "tool_use" : cand?.finishReason === "MAX_TOKENS" ? "max_tokens" : cand?.finishReason === "SAFETY" ? "refusal" : "end",
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        },
        model: req.model,
      };
    },
  };
}
