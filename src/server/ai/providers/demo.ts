import type { AIProvider, GenerateRequest, GenerateResponse, ToolCall } from "../types";

/**
 * DEMO provider — deterministic, offline, NO real AI.
 * Only active when JARVIS_DEMO_MODE=true (clearly flagged in the UI) and in automated
 * tests. It exercises the real orchestration, tool, approval and logging paths so the
 * system can be verified without spending API credits.
 */
const ROUTES: [RegExp, string][] = [
  [/research|competitor|market|opportunit/i, "research"],
  [/instagram|tiktok|post|social|publish/i, "social-media"],
  [/youtube|script|blog|article|content|caption/i, "content"],
  [/campaign|marketing|advert/i, "marketing"],
  [/affiliate|commission|landing page/i, "sales-affiliate"],
  [/expense|income|cash ?flow|profit|budget|pay|invoice|finance/i, "finance"],
  [/project|milestone|plan the/i, "project-manager"],
  [/automat|workflow|webhook/i, "automation"],
  [/customer|support|enquir/i, "customer-service"],
  [/calendar|remind|meeting|brief|email/i, "personal-assistant"],
  [/remember|memory|knowledge/i, "knowledge-memory"],
  [/report|performance|business/i, "business-manager"],
];

const TOOL_TRIGGERS: [RegExp, string, (input: string) => Record<string, unknown>][] = [
  [
    /send (an )?email|email (to|the)/i,
    "send_email",
    (s) => ({
      to: (s.match(/[\w.+-]+@[\w-]+\.[\w.]+/) ?? ["client@example.com"])[0],
      subject: "Follow-up from JARVIS (demo)",
      body: "Hello,\n\nThis is a demo email prepared by JARVIS.\n\nRegards",
      reason: "The instruction asked for an email to be sent.",
      expected_outcome: "Recipient receives the email.",
      risks: "Email content is a demo placeholder.",
    }),
  ],
  [
    /publish|post (it|this|to)/i,
    "publish_social_post",
    () => ({
      platform: "facebook",
      content: "Demo post prepared by JARVIS.",
      reason: "The instruction asked for publishing.",
      expected_outcome: "Post becomes publicly visible.",
      risks: "Public content is visible immediately.",
    }),
  ],
  [
    /\bpay\b|payment|purchase/i,
    "make_payment",
    () => ({
      payee: "Demo Supplier",
      amount: 100,
      currency: "ZAR",
      description: "Demo payment",
      reason: "The instruction asked for a payment.",
      expected_outcome: "Supplier is paid.",
      risks: "Money leaves the business account.",
    }),
  ],
  [/remember|note that/i, "save_memory", (s) => ({ title: "Demo memory", content: s.slice(0, 500), kind: "preference" })],
];

function lastUserText(req: GenerateRequest) {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i];
    if (m.role === "user") return m.content;
  }
  return "";
}

export function createDemoProvider(): AIProvider {
  return {
    name: "demo",
    async generate(req: GenerateRequest): Promise<GenerateResponse> {
      const input = lastUserText(req);
      const usage = { inputTokens: 0, outputTokens: 0 };
      const props = (req.jsonSchema?.properties ?? {}) as Record<string, unknown>;

      // Orchestrator planning call.
      if ("tasks" in props) {
        const instruction = input.split("INSTRUCTION:").pop() ?? input;
        const hits = ROUTES.filter(([re]) => re.test(instruction)).map(([, slug]) => slug);
        const slugs = [...new Set(hits)].slice(0, 3);
        const plan = {
          understanding: `[DEMO] Interpreted instruction: ${instruction.trim().slice(0, 200)}`,
          direct_response: slugs.length ? "" : "[DEMO] No specialised agent required. In live mode JARVIS would answer directly.",
          tasks: slugs.map((slug, i) => ({
            key: `t${i + 1}`,
            agent_slug: slug,
            title: `${slug.replace(/-/g, " ")} work for: ${instruction.trim().slice(0, 60)}`,
            instruction: instruction.trim(),
            depends_on: i > 0 ? [`t${i}`] : [],
            priority: "medium",
          })),
        };
        return { text: JSON.stringify(plan), toolCalls: [], stopReason: "end", usage, model: "demo" };
      }

      const lastMsg = req.messages[req.messages.length - 1];
      const toolNames = new Set((req.tools ?? []).map((t) => t.name));
      if (lastMsg?.role === "user" && toolNames.size) {
        const calls: ToolCall[] = [];
        for (const [re, tool, mk] of TOOL_TRIGGERS) {
          if (re.test(input) && toolNames.has(tool)) calls.push({ id: `demo_${tool}_${Date.now()}`, name: tool, input: mk(input) });
        }
        if (calls.length) return { text: "", toolCalls: calls.slice(0, 1), stopReason: "tool_use", usage, model: "demo" };
      }

      if (lastMsg?.role === "tool_results") {
        const summary = lastMsg.results.map((r) => `${r.name}: ${r.content.slice(0, 200)}`).join("\n");
        return {
          text: `[DEMO MODE — no real AI was called]\nTool results:\n${summary}`,
          toolCalls: [],
          stopReason: "end",
          usage,
          model: "demo",
        };
      }

      return {
        text: `[DEMO MODE — no real AI was called]\nThis placeholder stands in for the agent's response to:\n"${input
          .split("\n")
          .slice(-3)
          .join(" ")
          .slice(0, 300)}"\n\nConfigure an Anthropic API key and disable JARVIS_DEMO_MODE for genuine output.`,
        toolCalls: [],
        stopReason: "end",
        usage,
        model: "demo",
      };
    },
  };
}
