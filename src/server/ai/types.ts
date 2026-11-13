export type ToolSchema = {
  name: string;
  description: string;
  /** JSON schema for the tool input (object). */
  inputSchema: Record<string, unknown>;
};

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };
export type ToolResult = { id: string; name: string; content: string; isError?: boolean };

export type ChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      text: string;
      toolCalls: ToolCall[];
      /** Provider-native content, replayed verbatim to the same provider (e.g. Claude thinking blocks). */
      raw?: unknown;
      rawProvider?: string;
    }
  | { role: "tool_results"; results: ToolResult[] };

export type GenerateRequest = {
  model: string;
  system: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  /** Enables provider-hosted web search when supported (Claude). */
  webSearch?: boolean;
  /** Request JSON output conforming to this schema. */
  jsonSchema?: Record<string, unknown>;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
};

export type StopReason = "end" | "tool_use" | "max_tokens" | "refusal" | "pause";

export type GenerateResponse = {
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  raw?: unknown;
  /** Web sources cited by the provider (if web search ran). */
  sources?: { url: string; title?: string }[];
};

export interface AIProvider {
  name: string;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(public provider: string) {
    super(
      `AI provider "${provider}" is not configured. Add an API key in Integrations or set the environment variable, then retry.`,
    );
    this.name = "ProviderNotConfiguredError";
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public retryable: boolean,
    public status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
