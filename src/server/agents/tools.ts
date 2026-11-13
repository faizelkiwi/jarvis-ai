import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { agents, projects, tasks, transactions } from "../db/schema";
import type { ToolSchema } from "../ai/types";
import { CONSEQUENTIAL_ACTIONS, INTERNAL_ACTIONS, actionLabel } from "../approvals/catalog";
import { requestApproval } from "../approvals/service";
import { executeApprovalDirectInternal } from "./internal-exec";
import { formatKnowledgeContext, searchKnowledge } from "../knowledge/service";
import { getSetting } from "../settings/service";

export type AgentRow = typeof agents.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type ToolContext = { agent: AgentRow; task: TaskRow };

export type ToolDef = ToolSchema & {
  category: "read" | "internal" | "consequential" | "server";
  run?: (ctx: ToolContext, input: Record<string, unknown>) => Promise<string>;
};

const approvalFields = {
  reason: { type: "string", description: "Why this action is needed" },
  expected_outcome: { type: "string", description: "What will happen if approved" },
  risks: { type: "string", description: "Potential risks or downsides" },
};
const approvalRequired = ["reason", "expected_outcome", "risks"];

function str(v: unknown, max = 10_000) {
  return typeof v === "string" ? v.slice(0, max) : v === undefined || v === null ? "" : JSON.stringify(v).slice(0, max);
}

/** Consequential tools never execute: they file an approval request and report back. */
function consequential(name: string, description: string, props: Record<string, unknown>, required: string[], titleOf: (i: Record<string, unknown>) => string): ToolDef {
  return {
    name,
    description: `${description} REQUIRES HUMAN APPROVAL: calling this tool files a request in the approval queue; it does not execute the action.`,
    category: "consequential",
    inputSchema: { type: "object", properties: { ...props, ...approvalFields }, required: [...required, ...approvalRequired] },
    async run(ctx, input) {
      const { reason, expected_outcome, risks, ...payload } = input;
      const approval = await requestApproval({
        action: name,
        title: titleOf(input).slice(0, 200),
        agentId: ctx.agent.id,
        taskId: ctx.task.id,
        reason: str(reason),
        expectedOutcome: str(expected_outcome),
        risks: str(risks),
        payload,
      });
      return `Approval request ${approval.id} filed for "${actionLabel(name)}". The action has NOT been executed; it will run only if the human approves it. Do not claim it was completed.`;
    },
  };
}

/** Internal tools auto-execute only when allowed by the approval rules; otherwise they file an approval. */
function internal(name: string, description: string, props: Record<string, unknown>, required: string[], titleOf: (i: Record<string, unknown>) => string): ToolDef {
  return {
    name,
    description,
    category: "internal",
    inputSchema: { type: "object", properties: props, required },
    async run(ctx, input) {
      const rules = await getSetting("approvals.rules");
      const payload = name === "delegate_task" ? { ...input, _fromAgentId: ctx.agent.id, _parentTaskId: ctx.task.id } : input;
      if (rules.autoApprove[name]) {
        const res = await executeApprovalDirectInternal(name, payload, ctx);
        return res.ok ? res.message : `Failed: ${res.message}`;
      }
      const approval = await requestApproval({
        action: name,
        title: titleOf(input).slice(0, 200),
        agentId: ctx.agent.id,
        taskId: ctx.task.id,
        reason: `Agent ${ctx.agent.name} requested: ${INTERNAL_ACTIONS[name].description}`,
        expectedOutcome: titleOf(input),
        risks: "Internal record change",
        payload,
      });
      return `Approval request ${approval.id} filed for "${actionLabel(name)}" (not executed yet).`;
    },
  };
}

export const TOOLS: Record<string, ToolDef> = {
  // ── Read ──
  search_knowledge: {
    name: "search_knowledge",
    description: "Search the business knowledge base and memory (documents, facts, preferences, past research).",
    category: "read",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    async run(ctx, input) {
      const hits = await searchKnowledge(str(input.query, 500), { limit: 6, categories: ctx.agent.knowledgeScopes });
      return hits.length ? formatKnowledgeContext(hits) : "No matching knowledge found.";
    },
  },
  get_business_profile: {
    name: "get_business_profile",
    description: "Get the business profile: name, industry, goals, currency and timezone.",
    category: "read",
    inputSchema: { type: "object", properties: {}, required: [] },
    async run() {
      return JSON.stringify(await getSetting("business.profile"));
    },
  },
  list_tasks: {
    name: "list_tasks",
    description: "List recent tasks with status, agent and due date. Optionally filter by status.",
    category: "read",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["pending", "assigned", "running", "awaiting_approval", "completed", "failed", "cancelled"] } },
      required: [],
    },
    async run(_ctx, input) {
      const db = await getDb();
      const rows = await db
        .select({ id: tasks.id, title: tasks.title, status: tasks.status, priority: tasks.priority, dueDate: tasks.dueDate, agent: agents.name })
        .from(tasks)
        .leftJoin(agents, eq(agents.id, tasks.agentId))
        .where(input.status ? eq(tasks.status, input.status as TaskRow["status"]) : undefined)
        .orderBy(desc(tasks.createdAt))
        .limit(40);
      return JSON.stringify(rows);
    },
  },
  list_projects: {
    name: "list_projects",
    description: "List projects with status, objective and due date.",
    category: "read",
    inputSchema: { type: "object", properties: {}, required: [] },
    async run() {
      const db = await getDb();
      return JSON.stringify(await db.select().from(projects).orderBy(desc(projects.updatedAt)).limit(40));
    },
  },
  finance_summary: {
    name: "finance_summary",
    description: "Summarise recorded income and expenses (real bookkeeping records only) for the last N days, by category.",
    category: "read",
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 730 } }, required: [] },
    async run(_ctx, input) {
      const days = Math.min(730, Math.max(1, Number(input.days ?? 30)));
      const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
      const db = await getDb();
      const rows = await db
        .select({ type: transactions.type, category: transactions.category, currency: transactions.currency, total: sql<string>`sum(${transactions.amount})`, n: sql<number>`count(*)::int` })
        .from(transactions)
        .where(gte(transactions.date, since))
        .groupBy(transactions.type, transactions.category, transactions.currency);
      if (!rows.length) return `No transactions recorded in the last ${days} days. Do not invent figures.`;
      return JSON.stringify({ periodDays: days, since, rows });
    },
  },

  // ── Internal writes ──
  save_memory: internal(
    "save_memory",
    "Save a note to long-term memory. Agent-saved notes are stored as unverified unless the human verifies them. Search first to avoid duplicates.",
    {
      title: { type: "string" },
      content: { type: "string" },
      category: { type: "string" },
      kind: { type: "string", enum: ["preference", "temporary", "assumption", "decision", "procedure"] },
    },
    ["title", "content"],
    (i) => `Save memory: ${str(i.title, 120)}`,
  ),
  delegate_task: internal(
    "delegate_task",
    "Delegate a sub-task to another specialised agent you are permitted to work with.",
    {
      agent_slug: { type: "string", description: "Target agent slug" },
      title: { type: "string" },
      instruction: { type: "string" },
      priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
    },
    ["agent_slug", "title", "instruction"],
    (i) => `Delegate to ${str(i.agent_slug, 50)}: ${str(i.title, 120)}`,
  ),
  create_project: internal(
    "create_project",
    "Create a new project on the project board.",
    { name: { type: "string" }, description: { type: "string" }, objective: { type: "string" } },
    ["name"],
    (i) => `Create project: ${str(i.name, 120)}`,
  ),
  record_transaction: internal(
    "record_transaction",
    "Record an income or expense bookkeeping entry (does not move money).",
    {
      date: { type: "string", description: "YYYY-MM-DD" },
      description: { type: "string" },
      amount: { type: "number" },
      currency: { type: "string" },
      type: { type: "string", enum: ["income", "expense"] },
      category: { type: "string" },
    },
    ["date", "description", "amount", "type"],
    (i) => `Record ${str(i.type, 10)}: ${str(i.description, 80)} (${str(i.amount, 20)})`,
  ),

  // ── Server tool (provider-hosted) ──
  web_research: {
    name: "web_research",
    description: "Live web search with citations (Claude-hosted).",
    category: "server",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // ── Consequential (always approval) ──
  publish_social_post: consequential(
    "publish_social_post",
    "Publish a post to a social media platform.",
    { platform: { type: "string", enum: ["facebook", "instagram", "tiktok", "youtube"] }, content: { type: "string" }, link: { type: "string" } },
    ["platform", "content"],
    (i) => `Publish to ${str(i.platform, 20)}: ${str(i.content, 100)}`,
  ),
  send_email: consequential(
    "send_email",
    "Send an external email.",
    { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
    ["to", "subject", "body"],
    (i) => `Email ${str(i.to, 100)}: ${str(i.subject, 100)}`,
  ),
  send_customer_message: consequential(
    "send_customer_message",
    "Send a WhatsApp message to a customer.",
    { to_phone: { type: "string", description: "E.164 phone number" }, message: { type: "string" } },
    ["to_phone", "message"],
    (i) => `Message ${str(i.to_phone, 20)}: ${str(i.message, 100)}`,
  ),
  send_telegram_message: consequential(
    "send_telegram_message",
    "Send a Telegram message via the business bot.",
    { text: { type: "string" }, chat_id: { type: "string" } },
    ["text"],
    (i) => `Telegram: ${str(i.text, 120)}`,
  ),
  make_payment: consequential(
    "make_payment",
    "Request a payment or purchase.",
    { payee: { type: "string" }, amount: { type: "number" }, currency: { type: "string" }, description: { type: "string" } },
    ["payee", "amount", "currency", "description"],
    (i) => `Pay ${str(i.amount, 20)} ${str(i.currency, 5)} to ${str(i.payee, 80)}`,
  ),
  launch_ad_campaign: consequential(
    "launch_ad_campaign",
    "Launch a paid advertising campaign.",
    { platform: { type: "string" }, budget: { type: "number" }, currency: { type: "string" }, campaign_brief: { type: "string" } },
    ["platform", "budget", "currency", "campaign_brief"],
    (i) => `Launch ${str(i.platform, 30)} ad campaign, budget ${str(i.budget, 20)} ${str(i.currency, 5)}`,
  ),
  trigger_external_workflow: consequential(
    "trigger_external_workflow",
    "Trigger an external automation (Make.com or n8n webhook).",
    { platform: { type: "string", enum: ["make", "n8n"] }, data: { type: "object" }, content: { type: "string" } },
    ["platform"],
    (i) => `Trigger ${str(i.platform, 10)} workflow`,
  ),
  delete_knowledge: consequential(
    "delete_knowledge",
    "Delete a knowledge base document.",
    { document_id: { type: "string" } },
    ["document_id"],
    (i) => `Delete knowledge document ${str(i.document_id, 40)}`,
  ),
  schedule_calendar_event: consequential(
    "schedule_calendar_event",
    "Create a calendar event.",
    { title: { type: "string" }, start: { type: "string", description: "ISO datetime" }, end: { type: "string" }, attendees: { type: "array", items: { type: "string" } } },
    ["title", "start"],
    (i) => `Calendar: ${str(i.title, 100)} at ${str(i.start, 30)}`,
  ),
};

// Sanity: every consequential action exposed as a tool must be in the hard-coded catalogue.
for (const t of Object.values(TOOLS)) {
  if (t.category === "consequential" && !(t.name in CONSEQUENTIAL_ACTIONS)) throw new Error(`Tool ${t.name} missing from catalogue`);
}

export const ASSIGNABLE_TOOLS = Object.values(TOOLS).map((t) => ({ name: t.name, category: t.category, description: t.description }));

export function toolsForAgent(agent: AgentRow) {
  return agent.permissions.map((p) => TOOLS[p]).filter((t): t is ToolDef => !!t);
}

export async function activeAgentSlugs(slugs: string[]) {
  if (!slugs.length) return [];
  const db = await getDb();
  return db.select().from(agents).where(and(inArray(agents.slug, slugs), eq(agents.active, true)));
}
