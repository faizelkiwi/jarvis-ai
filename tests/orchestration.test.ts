import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { agents, approvals, commands, tasks } from "@/server/db/schema";
import { submitCommand } from "@/server/agents/orchestrator";
import { drainJobs } from "@/server/jobs/worker";
import { ProviderError } from "@/server/ai/types";
import { createTask, scheduleReadyTasks } from "@/server/tasks/service";
import { decideApproval } from "@/server/approvals/service";
import { runWorkflow, saveWorkflow } from "@/server/workflows/service";
import { agentBySlug, clearProvider, makeUser, scriptedProvider } from "./helpers";

afterEach(() => clearProvider());

async function commandWithTasks(id: string) {
  const db = await getDb();
  const [cmd] = await db.select().from(commands).where(eq(commands.id, id));
  const ts = await db
    .select({ t: tasks, slug: agents.slug })
    .from(tasks)
    .leftJoin(agents, eq(agents.id, tasks.agentId))
    .where(eq(tasks.commandId, id));
  return { cmd, ts };
}

describe("JARVIS orchestration", () => {
  it("delegates a natural-language instruction to the correct agent and consolidates the result", async () => {
    const u = await makeUser();
    const cmd = await submitCommand({ text: "JARVIS, ask the research agent to analyse my competitors.", userId: u.id, channel: "text" });
    await drainJobs();
    const { cmd: done, ts } = await commandWithTasks(cmd.id);
    expect(ts.map((x) => x.slug)).toContain("research");
    expect(ts.every((x) => x.t.status === "completed")).toBe(true);
    expect(done.status).toBe("completed");
    expect(done.response).toBeTruthy();
  });

  it("multiple agents collaborate with dependencies (output flows downstream)", async () => {
    const u = await makeUser();
    const plan = {
      understanding: "Research then create content",
      direct_response: "",
      tasks: [
        { key: "t1", agent_slug: "research", title: "Research niche", instruction: "Find 3 niches", depends_on: [], priority: "high" },
        { key: "t2", agent_slug: "content", title: "Write posts", instruction: "Write posts for niche", depends_on: ["t1"], priority: "medium" },
      ],
    };
    const provider = scriptedProvider([
      () => ({ text: JSON.stringify(plan) }),
      () => ({ text: "NICHE-RESULT: budgeting templates" }),
      (req) => ({ text: req.messages[0].role === "user" && req.messages[0].content.includes("NICHE-RESULT") ? "Posts about budgeting templates" : "missing upstream" }),
      () => ({ text: "Consolidated: posts ready." }),
    ]);
    const cmd = await submitCommand({ text: "Research a niche and write posts", userId: u.id, channel: "text" });
    await drainJobs();
    const { cmd: done, ts } = await commandWithTasks(cmd.id);
    const content = ts.find((x) => x.slug === "content")!;
    const research = ts.find((x) => x.slug === "research")!;
    expect(content.t.dependsOn).toEqual([research.t.id]);
    expect(content.t.output).toBe("Posts about budgeting templates");
    expect(done.response).toBe("Consolidated: posts ready.");
    expect(provider.calls[0].jsonSchema).toBeDefined();
  });

  it("answers directly when no agent is needed", async () => {
    const u = await makeUser();
    scriptedProvider([() => ({ text: JSON.stringify({ understanding: "greeting", direct_response: "Good morning.", tasks: [] }) })]);
    const cmd = await submitCommand({ text: "Good morning JARVIS", userId: u.id, channel: "voice" });
    await drainJobs();
    const { cmd: done, ts } = await commandWithTasks(cmd.id);
    expect(ts).toHaveLength(0);
    expect(done).toMatchObject({ status: "completed", response: "Good morning.", channel: "voice" });
  });

  it("ignores plans that reference unknown agents", async () => {
    const u = await makeUser();
    scriptedProvider([
      () => ({ text: JSON.stringify({ understanding: "x", direct_response: "fallback", tasks: [{ key: "t1", agent_slug: "hacker", title: "x", instruction: "x", depends_on: [], priority: "low" }] }) }),
    ]);
    const cmd = await submitCommand({ text: "do something", userId: u.id, channel: "text" });
    await drainJobs();
    const { ts, cmd: done } = await commandWithTasks(cmd.id);
    expect(ts).toHaveLength(0);
    expect(done.status).toBe("completed");
  });
});

describe("API failure handling", () => {
  it("fails a task gracefully on a non-retryable provider error", async () => {
    scriptedProvider([
      () => {
        throw new ProviderError("Anthropic rejected the API key (401).", "anthropic", false, 401);
      },
    ]);
    const agent = await agentBySlug("content");
    const t = await createTask({ title: "Write", agentId: agent.id, createdBy: "user" });
    await scheduleReadyTasks();
    await drainJobs();
    const db = await getDb();
    const [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/401/);
  });

  it("retries transient errors and then succeeds", async () => {
    let n = 0;
    scriptedProvider([
      () => {
        n++;
        throw new ProviderError("rate limited", "anthropic", true, 429);
      },
      () => ({ text: "Recovered output" }),
    ]);
    const agent = await agentBySlug("content");
    const t = await createTask({ title: "Write again", agentId: agent.id, createdBy: "user" });
    await scheduleReadyTasks();
    const db = await getDb();
    // First attempt fails and is re-queued with back-off; pull it forward for the test.
    await drainJobs();
    await db.execute(`update jobs set run_at = now() where status = 'queued'` as never);
    await drainJobs();
    const [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(n).toBe(1);
    expect(row.status).toBe("completed");
    expect(row.output).toBe("Recovered output");
  });

  it("marks the command failed with a clear message when no provider is configured", async () => {
    clearProvider();
    process.env.JARVIS_DEMO_MODE = "false";
    try {
      const u = await makeUser();
      const cmd = await submitCommand({ text: "Plan my week", userId: u.id, channel: "text" });
      await drainJobs();
      const db = await getDb();
      const [row] = await db.select().from(commands).where(eq(commands.id, cmd.id));
      expect(row.status).toBe("failed");
      expect(row.error).toMatch(/not configured/);
    } finally {
      process.env.JARVIS_DEMO_MODE = "true";
    }
  });
});

describe("workflows", () => {
  it("runs agent → approval checkpoint → agent, pausing for the human", async () => {
    const owner = await makeUser("owner");
    scriptedProvider([(req) => ({ text: `output for: ${req.messages[0].role === "user" ? req.messages[0].content.slice(-40) : ""}` })]);
    const wf = await saveWorkflow(
      {
        name: "Content pipeline",
        steps: [
          { id: "s1", type: "agent", agentSlug: "research", instruction: "Research trending topics" },
          { id: "s2", type: "approval", title: "Review research" },
          { id: "s3", type: "agent", agentSlug: "content", instruction: "Write a blog post" },
        ],
      },
      owner.id,
    );
    const run = await runWorkflow(wf.id, "Focus on budgeting", owner.id);
    await drainJobs();
    const db = await getDb();
    let ts = await db.select().from(tasks).where(eq(tasks.workflowRunId, run.id));
    const byStatus = ts.map((t) => t.status).sort();
    expect(byStatus).toEqual(["assigned", "awaiting_approval", "completed"]);
    const [cp] = await db.select().from(approvals).where(eq(approvals.action, "workflow_checkpoint"));
    expect(cp.status).toBe("pending");

    await decideApproval(cp.id, "approve", owner);
    await drainJobs();
    ts = await db.select().from(tasks).where(eq(tasks.workflowRunId, run.id));
    expect(ts.every((t) => t.status === "completed")).toBe(true);
    const { workflowRuns } = await import("@/server/db/schema");
    const [r] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, run.id));
    expect(r.status).toBe("completed");
  });
});
