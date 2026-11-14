import { z } from "zod";
import { getDb } from "../db/client";
import { approvals, projects, transactions, type approvals as ApprovalsTable } from "../db/schema";
import { eq } from "drizzle-orm";
import { resolveIntegration, requiredFieldsPresent, recordIntegrationCheck } from "../integrations/service";
import { addKnowledge, deleteKnowledge } from "../knowledge/service";

type ApprovalRow = typeof ApprovalsTable.$inferSelect;
export type ExecutionResult = { ok: boolean; message: string; data?: Record<string, unknown> };

export class ExecutionBlockedError extends Error {}

class NotConfigured extends Error {}

async function integrationValues(slug: string) {
  const { values, row } = await resolveIntegration(slug);
  if (!requiredFieldsPresent(slug, values)) throw new NotConfigured(`Integration "${slug}" is not configured. Add credentials in Integrations, then retry execution.`);
  if (row && !row.enabled) throw new NotConfigured(`Integration "${slug}" is configured but disabled. Enable it in Integrations, then retry execution.`);
  return values;
}

async function httpJson(url: string, init: RequestInit, label: string) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* plain text */
  }
  if (!res.ok) throw new Error(`${label} responded ${res.status}: ${text.slice(0, 300)}`);
  return body as Record<string, unknown>;
}

const EXECUTORS: Record<string, (p: Record<string, unknown>, a: ApprovalRow) => Promise<ExecutionResult>> = {
  // ── Internal actions ──
  async save_memory(p, a) {
    const v = z.object({ title: z.string().min(1), content: z.string().min(1), category: z.string().optional(), kind: z.enum(["preference", "temporary", "assumption", "decision", "procedure"]).optional() }).parse(p);
    const doc = await addKnowledge({ ...v, kind: v.kind ?? "assumption", source: "agent", agentId: a.agentId });
    return { ok: true, message: `Saved to memory as "${doc.title}" (unverified)`, data: { documentId: doc.id } };
  },
  async delegate_task(p) {
    const { createDelegatedTask } = await import("../tasks/service");
    const t = await createDelegatedTask(p);
    return { ok: true, message: `Delegated task "${t.title}"`, data: { taskId: t.id } };
  },
  async create_project(p, a) {
    const v = z.object({ name: z.string().min(1).max(200), description: z.string().max(5000).optional(), objective: z.string().max(2000).optional() }).parse(p);
    const db = await getDb();
    const [proj] = await db.insert(projects).values({ name: v.name, description: v.description ?? "", objective: v.objective ?? "", createdBy: a.decidedBy }).returning();
    return { ok: true, message: `Created project "${proj.name}"`, data: { projectId: proj.id } };
  },
  async record_transaction(p) {
    const v = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().min(1).max(500),
        amount: z.number().positive(),
        currency: z.string().length(3).optional(),
        type: z.enum(["income", "expense"]),
        category: z.string().max(100).optional(),
      })
      .parse(p);
    const db = await getDb();
    const [t] = await db
      .insert(transactions)
      .values({ ...v, amount: v.amount.toFixed(2), currency: v.currency ?? "ZAR", category: v.category ?? "uncategorised", source: "agent" })
      .returning();
    return { ok: true, message: `Recorded ${v.type} of ${v.amount} ${t.currency}`, data: { transactionId: t.id } };
  },
  async workflow_checkpoint() {
    return { ok: true, message: "Checkpoint approved — workflow continues" };
  },
  async delete_knowledge(p, a) {
    const v = z.object({ document_id: z.string().uuid() }).parse(p);
    const doc = await deleteKnowledge(v.document_id, { type: "user", id: a.decidedBy ?? "unknown" });
    return doc ? { ok: true, message: `Deleted "${doc.title}"` } : { ok: false, message: "Document no longer exists" };
  },

  // ── External actions ──
  async send_telegram_message(p) {
    const v = z.object({ text: z.string().min(1).max(4000), chat_id: z.string().optional() }).parse(p);
    const cfg = await integrationValues("telegram");
    const chatId = v.chat_id || cfg.defaultChatId;
    if (!chatId) return { ok: false, message: "No chat ID provided and no default chat ID configured." };
    const body = await httpJson(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: v.text }),
    }, "Telegram");
    return { ok: true, message: "Telegram message sent", data: { messageId: (body.result as { message_id?: number })?.message_id } };
  },
  async send_email(p) {
    const v = z.object({ to: z.string().email(), subject: z.string().min(1).max(300), body: z.string().min(1).max(50_000), thread_id: z.string().max(100).optional() }).parse(p);
    // Prefer the owner's own Gmail when connected; otherwise Resend.
    if (await gmailReady()) {
      const { gmailProfile, sendGmail } = await import("../google/gmail");
      const me = await gmailProfile();
      const sent = await sendGmail({ from: me.emailAddress, to: v.to, subject: v.subject, body: v.body, threadId: v.thread_id });
      return { ok: true, message: `Email sent from ${me.emailAddress} to ${v.to} via Gmail`, data: { id: sent.id, provider: "gmail" } };
    }
    const cfg = await integrationValues("resend");
    const body = await httpJson("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ from: cfg.fromAddress, to: [v.to], subject: v.subject, text: v.body }),
    }, "Resend");
    return { ok: true, message: `Email sent to ${v.to}`, data: { id: body.id } };
  },
  async send_customer_message(p) {
    const v = z.object({ to_phone: z.string().regex(/^\+?\d{8,15}$/), message: z.string().min(1).max(4096) }).parse(p);
    const cfg = await integrationValues("whatsapp");
    const body = await httpJson(`https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.accessToken}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to: v.to_phone.replace(/^\+/, ""), type: "text", text: { body: v.message } }),
    }, "WhatsApp");
    return { ok: true, message: `WhatsApp message sent to ${v.to_phone}`, data: { response: body } };
  },
  async publish_social_post(p) {
    const v = z.object({ platform: z.string(), content: z.string().min(1).max(10_000), link: z.string().url().optional() }).parse(p);
    if (v.platform.toLowerCase() !== "facebook")
      return { ok: false, message: `Publishing to "${v.platform}" is not implemented yet. Copy the approved content and post manually, or connect Facebook Pages.` };
    const cfg = await integrationValues("facebook");
    const body = await httpJson(`https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.pageId)}/feed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: v.content, ...(v.link ? { link: v.link } : {}), access_token: cfg.pageAccessToken }),
    }, "Facebook");
    return { ok: true, message: "Published to Facebook Page", data: { postId: body.id } };
  },
  async trigger_external_workflow(p) {
    const v = z.object({ platform: z.enum(["make", "n8n"]), data: z.record(z.string(), z.unknown()).optional(), content: z.string().optional() }).parse(p);
    const cfg = await integrationValues(v.platform);
    const res = await fetch(cfg.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cfg.headerSecret ? { "x-jarvis-secret": cfg.headerSecret } : {}) },
      body: JSON.stringify({ source: "jarvis", data: v.data ?? {}, content: v.content ?? null }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`${v.platform} webhook responded ${res.status}`);
    return { ok: true, message: `${v.platform} workflow triggered (HTTP ${res.status})` };
  },
  async make_payment() {
    return {
      ok: false,
      message:
        "Approved, but JARVIS does not move money automatically. Complete this payment manually in your banking or payment platform, then record it in Finance.",
    };
  },
  async launch_ad_campaign() {
    return { ok: false, message: "Approved, but no advertising platform integration is implemented yet. Launch the approved campaign manually." };
  },
  async schedule_calendar_event(p) {
    const v = z
      .object({
        title: z.string().min(1).max(300),
        start: z.string().min(10).max(40),
        end: z.string().max(40).optional(),
        attendees: z.array(z.string().email()).max(50).optional(),
        description: z.string().max(8000).optional(),
        location: z.string().max(500).optional(),
      })
      .parse(p);
    const row = await (await import("../integrations/service")).getIntegrationConfig("google-calendar");
    if (row && !row.enabled) throw new NotConfigured('Integration "google-calendar" is disabled. Enable it in Integrations, then retry execution.');
    const { createEvent } = await import("../google/calendar");
    const { getSetting } = await import("../settings/service");
    const tz = (await getSetting("business.profile")).timezone || "Africa/Johannesburg";
    try {
      const e = await createEvent(v, tz);
      return { ok: true, message: `Event “${v.title}” created${v.attendees?.length ? ` and invitations sent to ${v.attendees.join(", ")}` : ""}`, data: { eventId: e.id, link: e.htmlLink } };
    } catch (err) {
      if ((err as Error).name === "Error" && /not connected/i.test((err as Error).message)) throw new NotConfigured((err as Error).message);
      throw err;
    }
  },
  async change_setting() {
    return { ok: false, message: "Approved, but agents cannot change settings directly. Apply the change in Settings." };
  },
};

/**
 * Executes an approved action. Re-reads the approval from the database and refuses to
 * run unless it is in the "approved" state — the only path to side effects.
 */
export async function executeApproval(approvalId: string): Promise<ExecutionResult> {
  const db = await getDb();
  const [a] = await db.select().from(approvals).where(eq(approvals.id, approvalId));
  if (!a) throw new ExecutionBlockedError("Approval not found");
  if (a.status !== "approved") throw new ExecutionBlockedError(`Refusing to execute: approval is "${a.status}", not "approved"`);
  const exec = EXECUTORS[a.action];
  if (!exec) return { ok: false, message: `No executor for action "${a.action}"` };
  try {
    const result = await exec(a.payload, a);
    const slug = await integrationForAction(a.action, a.payload);
    if (slug && result.ok) await recordIntegrationCheck(slug, true);
    return result;
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, message: `Invalid action data: ${e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
    if (e instanceof NotConfigured) return { ok: false, message: e.message };
    const slug = await integrationForAction(a.action, a.payload);
    if (slug) await recordIntegrationCheck(slug, false, (e as Error).message);
    return { ok: false, message: (e as Error).message };
  }
}

async function gmailReady() {
  const { getIntegrationSecrets, getIntegrationConfig } = await import("../integrations/service");
  const [s, row] = await Promise.all([getIntegrationSecrets("gmail"), getIntegrationConfig("gmail")]);
  return !!(s.refreshToken && row?.enabled);
}

async function integrationForAction(action: string, p: Record<string, unknown>) {
  if (action === "send_email") return (await gmailReady()) ? "gmail" : "resend";
  if (action === "send_telegram_message") return "telegram";
  if (action === "schedule_calendar_event") return "google-calendar";
  if (action === "send_customer_message") return "whatsapp";
  if (action === "publish_social_post") return String(p.platform ?? "").toLowerCase() === "facebook" ? "facebook" : null;
  if (action === "trigger_external_workflow") return p.platform === "make" || p.platform === "n8n" ? String(p.platform) : null;
  return null;
}
