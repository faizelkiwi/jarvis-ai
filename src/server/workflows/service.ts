import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { agents, workflowRuns, workflows, type WorkflowStep } from "../db/schema";
import { audit } from "../audit/log";
import { CONSEQUENTIAL_ACTIONS } from "../approvals/catalog";
import { createTask, scheduleReadyTasks } from "../tasks/service";

export const workflowStepSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().min(1).max(50), type: z.literal("agent"), agentSlug: z.string().min(1), instruction: z.string().min(1).max(10_000) }),
  z.object({ id: z.string().min(1).max(50), type: z.literal("approval"), title: z.string().min(1).max(200), instruction: z.string().max(2000).optional() }),
  z.object({
    id: z.string().min(1).max(50),
    type: z.literal("integration"),
    action: z.string().refine((a) => a in CONSEQUENTIAL_ACTIONS && a !== "workflow_checkpoint", "Unknown action"),
    instruction: z.string().max(2000),
    params: z.record(z.string(), z.string()).optional(),
  }),
]);

export const workflowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(""),
  steps: z.array(workflowStepSchema).min(1).max(20),
  active: z.boolean().default(true),
});

export async function saveWorkflow(input: z.input<typeof workflowSchema>, userId: string, id?: string) {
  const v = workflowSchema.parse(input);
  const db = await getDb();
  const slugs = v.steps.filter((s) => s.type === "agent").map((s) => (s as { agentSlug: string }).agentSlug);
  if (slugs.length) {
    const found = await db.select({ slug: agents.slug }).from(agents);
    const missing = slugs.filter((s) => !found.some((f) => f.slug === s));
    if (missing.length) throw new Error(`Unknown agent(s): ${missing.join(", ")}`);
  }
  const steps = v.steps as WorkflowStep[];
  const [row] = id
    ? await db.update(workflows).set({ ...v, steps, updatedAt: new Date() }).where(eq(workflows.id, id)).returning()
    : await db.insert(workflows).values({ ...v, steps, createdBy: userId }).returning();
  await audit({ actorType: "user", actorId: userId, action: id ? "workflow.updated" : "workflow.created", entityType: "workflow", entityId: row.id });
  return row;
}

/** Runs a workflow: each step becomes a task depending on the previous one. */
export async function runWorkflow(workflowId: string, input: string, userId: string) {
  const db = await getDb();
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
  if (!wf) throw new Error("Workflow not found");
  if (!wf.active) throw new Error("Workflow is inactive");
  const roster = await db.select().from(agents);
  const [run] = await db.insert(workflowRuns).values({ workflowId, input, createdBy: userId }).returning();
  let prev: string | null = null;
  for (const [i, step] of wf.steps.entries()) {
    const deps = prev ? [prev] : [];
    let taskId: string;
    if (step.type === "agent") {
      const agent = roster.find((a) => a.slug === step.agentSlug);
      if (!agent) throw new Error(`Agent ${step.agentSlug} not found`);
      const t = await createTask({
        title: `${wf.name} · Step ${i + 1}: ${agent.name}`.slice(0, 300),
        description: `${step.instruction}${input ? `\n\nWorkflow input from the owner:\n${input}` : ""}`,
        agentId: agent.id,
        priority: "medium",
        dependsOn: deps,
        workflowRunId: run.id,
        createdBy: `user:${userId}`,
      });
      taskId = t.id;
    } else {
      const t = await createTask({
        title: `${wf.name} · Step ${i + 1}: ${step.type === "approval" ? step.title : `Approve ${CONSEQUENTIAL_ACTIONS[step.action].label}`}`.slice(0, 300),
        description: step.instruction ?? "",
        kind: "checkpoint",
        dependsOn: deps,
        workflowRunId: run.id,
        taskInput: step.type === "integration" ? { action: step.action, params: step.params ?? {}, instruction: step.instruction } : { instruction: step.instruction },
        createdBy: `user:${userId}`,
      });
      taskId = t.id;
    }
    prev = taskId;
  }
  await audit({ actorType: "user", actorId: userId, action: "workflow.run_started", entityType: "workflow", entityId: workflowId, details: { runId: run.id } });
  await scheduleReadyTasks();
  return run;
}

export async function listWorkflows() {
  const db = await getDb();
  const wfs = await db.select().from(workflows).orderBy(desc(workflows.updatedAt));
  const runs = await db.select().from(workflowRuns).orderBy(desc(workflowRuns.createdAt)).limit(100);
  return wfs.map((w) => ({ ...w, runs: runs.filter((r) => r.workflowId === w.id).slice(0, 10) }));
}
