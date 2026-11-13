import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { approvals, tasks, transactions } from "@/server/db/schema";
import { createTask } from "@/server/tasks/service";
import { drainJobs } from "@/server/jobs/worker";
import { decideApproval, ApprovalDecisionError } from "@/server/approvals/service";
import { executeApproval, ExecutionBlockedError } from "@/server/approvals/executors";
import { setSetting } from "@/server/settings/service";
import { agentBySlug, clearProvider, makeUser, scriptedProvider } from "./helpers";

afterEach(() => clearProvider());

async function runAgentTask(slug: string, title: string) {
  const agent = await agentBySlug(slug);
  const t = await createTask({ title, description: title, agentId: agent.id, createdBy: "user" });
  const { scheduleReadyTasks } = await import("@/server/tasks/service");
  await scheduleReadyTasks();
  await drainJobs();
  const db = await getDb();
  const [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
  const appr = await db.select().from(approvals).where(eq(approvals.taskId, t.id));
  return { task: row, approvals: appr, agent };
}

describe("approval enforcement", () => {
  it("a consequential tool call only files an approval — nothing executes", async () => {
    let fetched = false;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      fetched = true;
      return origFetch(...args);
    }) as typeof fetch;
    try {
      scriptedProvider([
        () => ({
          stopReason: "tool_use",
          toolCalls: [
            {
              id: "c1",
              name: "send_email",
              input: { to: "client@example.com", subject: "Hi", body: "Hello", reason: "Follow up", expected_outcome: "Reply", risks: "None" },
            },
          ],
        }),
        () => ({ text: "Email prepared and submitted for approval." }),
      ]);
      const { task, approvals: appr } = await runAgentTask("customer-service", "Email the client");
      expect(task.status).toBe("awaiting_approval");
      expect(appr).toHaveLength(1);
      expect(appr[0]).toMatchObject({ action: "send_email", status: "pending", reason: "Follow up", expectedOutcome: "Reply", risks: "None", riskLevel: "high" });
      expect(appr[0].payload).toMatchObject({ to: "client@example.com" });
      expect(fetched).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("the executor refuses to run anything that is not approved", async () => {
    const db = await getDb();
    const [pending] = await db.select().from(approvals).where(eq(approvals.status, "pending"));
    await expect(executeApproval(pending.id)).rejects.toBeInstanceOf(ExecutionBlockedError);
  });

  it("viewers and operators cannot decide approvals", async () => {
    const db = await getDb();
    const [pending] = await db.select().from(approvals).where(eq(approvals.status, "pending"));
    for (const role of ["viewer", "operator"] as const) {
      const u = await makeUser(role);
      await expect(decideApproval(pending.id, "approve", u)).rejects.toBeInstanceOf(ApprovalDecisionError);
    }
  });

  it("approval executes once; missing integration fails honestly; decisions are single-use", async () => {
    const db = await getDb();
    const [pending] = await db.select().from(approvals).where(eq(approvals.status, "pending"));
    const owner = await makeUser("owner");
    const res = await decideApproval(pending.id, "approve", owner, "ok");
    expect(res.status).toBe("execution_failed");
    expect(res.result?.message).toMatch(/not configured/);
    await expect(decideApproval(pending.id, "approve", owner)).rejects.toThrow(/already decided/);
    const [t] = await db.select().from(tasks).where(eq(tasks.id, pending.taskId!));
    expect(t.status).toBe("completed");
    expect(t.output).toMatch(/Approval outcome/);
  });

  it("agents cannot use tools outside their permissions", async () => {
    scriptedProvider([
      () => ({
        stopReason: "tool_use",
        toolCalls: [{ id: "c1", name: "make_payment", input: { payee: "x", amount: 5, currency: "ZAR", description: "y", reason: "r", expected_outcome: "o", risks: "k" } }],
      }),
      () => ({ text: "done" }),
    ]);
    const { task, approvals: appr } = await runAgentTask("content", "Pay a supplier");
    expect(appr).toHaveLength(0);
    expect(task.status).toBe("completed");
    const db = await getDb();
    const logs = await db.query.taskLogs.findMany({ where: (l, { eq }) => eq(l.taskId, task.id) });
    expect(logs.some((l) => l.level === "warn" && /Blocked tool call "make_payment"/.test(l.message))).toBe(true);
  });

  it("rejecting leaves the action unexecuted; request-changes creates a revision task", async () => {
    const script = () =>
      scriptedProvider([
        () => ({
          stopReason: "tool_use",
          toolCalls: [{ id: "c1", name: "publish_social_post", input: { platform: "facebook", content: "Launch!", reason: "r", expected_outcome: "o", risks: "k" } }],
        }),
        () => ({ text: "Submitted." }),
      ]);
    script();
    const owner = await makeUser("owner");
    const first = await runAgentTask("social-media", "Post launch");
    const r = await decideApproval(first.approvals[0].id, "reject", owner, "Not now");
    expect(r.status).toBe("rejected");

    script();
    const second = await runAgentTask("social-media", "Post launch v2");
    await decideApproval(second.approvals[0].id, "request_changes", owner, "Make it shorter");
    const db = await getDb();
    const revisions = await db.select().from(tasks).where(eq(tasks.parentTaskId, second.task.id));
    expect(revisions).toHaveLength(1);
    expect(revisions[0].description).toContain("Make it shorter");
    await drainJobs(); // let the revision task finish so it can't leak into the next test
  });

  it("internal actions follow configurable rules", async () => {
    const tool = (amount: number) => () => ({
      stopReason: "tool_use" as const,
      toolCalls: [{ id: "c1", name: "record_transaction", input: { date: "2026-11-01", description: "Hosting", amount, type: "expense" } }],
    });
    // Default rule: record_transaction requires approval.
    scriptedProvider([tool(100), () => ({ text: "ok" })]);
    const a = await runAgentTask("finance", "Record hosting");
    expect(a.approvals[0].status).toBe("pending");
    const db = await getDb();
    expect(await db.select().from(transactions)).toHaveLength(0);

    await setSetting("approvals.rules", { autoApprove: { save_memory: true, delegate_task: true, create_project: true, record_transaction: true } });
    scriptedProvider([tool(250), () => ({ text: "ok" })]);
    const b = await runAgentTask("finance", "Record hosting again");
    expect(b.approvals[0].status).toBe("executed");
    const tx = await db.select().from(transactions);
    expect(tx).toHaveLength(1);
    expect(tx[0].amount).toBe("250.00");
  });

  it("consequential actions cannot be auto-approved even if a rule is set", async () => {
    await setSetting("approvals.rules", { autoApprove: { send_email: true } });
    scriptedProvider([
      () => ({
        stopReason: "tool_use",
        toolCalls: [{ id: "c1", name: "send_email", input: { to: "a@b.co", subject: "s", body: "b", reason: "r", expected_outcome: "o", risks: "k" } }],
      }),
      () => ({ text: "ok" }),
    ]);
    const r = await runAgentTask("customer-service", "Email");
    expect(r.approvals[0].status).toBe("pending");
  });
});
