import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import {
  agents,
  approvals,
  commands,
  taskLogs,
  tasks,
  workflowRuns,
  type TaskPriority,
  type TaskStatus,
  type approvals as ApprovalsTable,
} from "../db/schema";
import { audit } from "../audit/log";
import { enqueue, hasOpenJob } from "../jobs/queue";
import { requestApproval } from "../approvals/service";
import { actionLabel } from "../approvals/catalog";

type TaskRow = typeof tasks.$inferSelect;
type ApprovalRow = typeof ApprovalsTable.$inferSelect;

export const TERMINAL: TaskStatus[] = ["completed", "failed", "cancelled"];

export async function logTask(
  taskId: string,
  level: "info" | "warn" | "error" | "tool" | "llm",
  message: string,
  data?: Record<string, unknown>,
  agentId?: string | null,
) {
  const db = await getDb();
  await db.insert(taskLogs).values({ taskId, agentId: agentId ?? null, level, message: message.slice(0, 4000), data: data ?? null });
}

export const createTaskInput = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20_000).default(""),
  agentId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dependsOn: z.array(z.string().uuid()).max(20).default([]),
  autoRun: z.boolean().default(true),
});

export async function createTask(
  input: z.input<typeof createTaskInput> & {
    commandId?: string | null;
    workflowRunId?: string | null;
    parentTaskId?: string | null;
    kind?: "agent" | "checkpoint" | "manual";
    taskInput?: Record<string, unknown>;
    createdBy: string;
  },
) {
  const v = createTaskInput.parse(input);
  const db = await getDb();
  const kind = input.kind ?? (v.agentId ? "agent" : "manual");
  const [task] = await db
    .insert(tasks)
    .values({
      title: v.title,
      description: v.description,
      agentId: v.agentId ?? null,
      projectId: v.projectId ?? null,
      priority: v.priority as TaskPriority,
      dueDate: v.dueDate ?? null,
      dependsOn: v.dependsOn,
      commandId: input.commandId ?? null,
      workflowRunId: input.workflowRunId ?? null,
      parentTaskId: input.parentTaskId ?? null,
      kind,
      input: { ...(input.taskInput ?? {}), autoRun: v.autoRun },
      status: v.agentId ? "assigned" : "pending",
      createdBy: input.createdBy,
    })
    .returning();
  await audit({
    actorType: input.createdBy === "user" || input.createdBy.startsWith("user:") ? "user" : input.createdBy === "jarvis" ? "system" : "agent",
    actorId: input.createdBy,
    action: "task.created",
    entityType: "task",
    entityId: task.id,
    details: { title: task.title, agentId: task.agentId, kind },
  });
  await logTask(task.id, "info", `Task created by ${input.createdBy}`, undefined, task.agentId);
  return task;
}

/** Called from the delegate_task executor; enforces the agent communication graph. */
export async function createDelegatedTask(p: Record<string, unknown>) {
  const v = z
    .object({
      agent_slug: z.string(),
      title: z.string().min(1).max(300),
      instruction: z.string().min(1).max(20_000),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      _fromAgentId: z.string().uuid(),
      _parentTaskId: z.string().uuid(),
    })
    .parse(p);
  const db = await getDb();
  const [from] = await db.select().from(agents).where(eq(agents.id, v._fromAgentId));
  const [target] = await db.select().from(agents).where(eq(agents.slug, v.agent_slug));
  if (!from) throw new Error("Delegating agent not found");
  if (!target || !target.active) throw new Error(`Agent "${v.agent_slug}" does not exist or is inactive`);
  if (!from.canDelegateTo.includes(target.slug)) throw new Error(`${from.name} is not permitted to delegate to ${target.name}`);
  const [parent] = await db.select().from(tasks).where(eq(tasks.id, v._parentTaskId));
  // Prevent runaway delegation chains.
  let depth = 0;
  let cursor = parent;
  while (cursor?.parentTaskId && depth < 5) {
    depth++;
    [cursor] = await db.select().from(tasks).where(eq(tasks.id, cursor.parentTaskId));
  }
  if (depth >= 3) throw new Error("Delegation depth limit (3) reached");
  const task = await createTask({
    title: v.title,
    description: v.instruction,
    agentId: target.id,
    projectId: parent?.projectId ?? null,
    priority: v.priority ?? parent?.priority ?? "medium",
    commandId: parent?.commandId ?? null,
    parentTaskId: v._parentTaskId,
    createdBy: from.slug,
  });
  await scheduleReadyTasks();
  return task;
}

/** "Request changes" on an agent's proposal creates a revision task for the same agent. */
export async function createRevisionTask(approval: ApprovalRow, note: string) {
  const db = await getDb();
  const [orig] = await db.select().from(tasks).where(eq(tasks.id, approval.taskId!));
  if (!orig) return null;
  if (orig.kind === "checkpoint") {
    // Send the upstream agent step back with the feedback; the checkpoint re-opens afterwards.
    const upstreamId = orig.dependsOn[0];
    if (upstreamId) {
      const [up] = await db.select().from(tasks).where(eq(tasks.id, upstreamId));
      await db
        .update(tasks)
        .set({ status: "assigned", input: { ...(up?.input ?? {}), feedback: note }, attempts: 0, error: null, completedAt: null })
        .where(eq(tasks.id, upstreamId));
      await db.update(tasks).set({ status: "pending" }).where(eq(tasks.id, orig.id));
      await logTask(upstreamId, "info", `Changes requested at checkpoint: ${note}`);
      await scheduleReadyTasks();
    }
    return null;
  }
  if (!orig.agentId) return null;
  return createTask({
    title: `Revise: ${orig.title}`.slice(0, 300),
    description: [
      `Original task:\n${orig.description}`,
      `Your previous proposal (${actionLabel(approval.action)}) was sent back for changes.`,
      `Proposed data:\n${JSON.stringify(approval.payload, null, 2)}`,
      `Human feedback:\n${note}`,
      "Prepare a revised proposal and submit it again through the appropriate tool.",
    ].join("\n\n"),
    agentId: orig.agentId,
    projectId: orig.projectId,
    priority: orig.priority,
    commandId: orig.commandId,
    parentTaskId: orig.id,
    createdBy: "user",
  }).then(async (t) => {
    await scheduleReadyTasks();
    return t;
  });
}

export async function onApprovalResolved(taskId: string, action: string, status: string, message: string) {
  const db = await getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return;
  if (task.kind === "checkpoint") {
    if (status === "approved" || status === "executed" || status === "execution_failed") {
      const ok = status !== "execution_failed";
      await db
        .update(tasks)
        .set({ status: ok ? "completed" : "failed", output: message, error: ok ? null : message, completedAt: new Date() })
        .where(eq(tasks.id, taskId));
    } else if (status === "rejected") {
      await db.update(tasks).set({ status: "cancelled", output: `Rejected: ${message}`, completedAt: new Date() }).where(eq(tasks.id, taskId));
    }
    await logTask(taskId, "info", `Checkpoint ${status}: ${message}`);
    await afterTaskChange(task);
    return;
  }
  await logTask(taskId, "info", `${actionLabel(action)} → ${status}${message ? `: ${message}` : ""}`, undefined, task.agentId);
  if (task.status !== "awaiting_approval") return;
  const pending = await db.select({ id: approvals.id }).from(approvals).where(and(eq(approvals.taskId, taskId), eq(approvals.status, "pending")));
  if (pending.length) return;
  await db
    .update(tasks)
    .set({
      status: "completed",
      completedAt: new Date(),
      output: `${task.output ?? ""}\n\n---\nApproval outcome — ${actionLabel(action)}: ${status}${message ? ` (${message})` : ""}`.trim(),
    })
    .where(eq(tasks.id, taskId));
  await afterTaskChange(task);
}

async function outputsOf(ids: string[]) {
  if (!ids.length) return "";
  const db = await getDb();
  const rows = await db.select({ title: tasks.title, output: tasks.output }).from(tasks).where(inArray(tasks.id, ids));
  return rows.map((r) => `## ${r.title}\n${r.output ?? ""}`).join("\n\n");
}

/**
 * Resolves the dependency graph: enqueues agent tasks whose dependencies are complete,
 * opens approval checkpoints, and cancels tasks whose upstream failed.
 */
export async function scheduleReadyTasks() {
  const db = await getDb();
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    const open = await db
      .select()
      .from(tasks)
      .where(inArray(tasks.status, ["pending", "assigned"]));
    if (!open.length) return;
    const depIds = [...new Set(open.flatMap((t) => t.dependsOn))];
    const deps = depIds.length ? await db.select({ id: tasks.id, status: tasks.status }).from(tasks).where(inArray(tasks.id, depIds)) : [];
    const statusOf = new Map(deps.map((d) => [d.id, d.status]));

    for (const t of open) {
      const ds = t.dependsOn.map((id) => statusOf.get(id));
      if (ds.some((s) => s === "failed" || s === "cancelled")) {
        await db.update(tasks).set({ status: "cancelled", error: "Cancelled because an upstream task failed or was cancelled", completedAt: new Date() }).where(eq(tasks.id, t.id));
        await logTask(t.id, "warn", "Cancelled: upstream dependency failed");
        changed = true;
        continue;
      }
      if (!ds.every((s) => s === "completed")) continue;

      if (t.kind === "agent" && t.agentId && t.status === "assigned" && t.input.autoRun !== false) {
        if (!(await hasOpenJob("run_task", "taskId", t.id))) await enqueue("run_task", { taskId: t.id }, { maxAttempts: t.maxAttempts + 1 });
      } else if (t.kind === "checkpoint" && t.status === "pending") {
        const upstream = await outputsOf(t.dependsOn);
        const action = (t.input.action as string) || "workflow_checkpoint";
        const params = (t.input.params as Record<string, unknown>) ?? {};
        await requestApproval({
          action,
          title: t.title,
          agentId: null,
          taskId: t.id,
          reason: (t.input.instruction as string) || "Workflow checkpoint: review the previous step's output before continuing.",
          expectedOutcome: action === "workflow_checkpoint" ? "The workflow continues to the next step." : `${actionLabel(action)} using the reviewed content.`,
          risks: action === "workflow_checkpoint" ? "Approving lets downstream steps use this output." : "External, possibly irreversible action.",
          payload: action === "workflow_checkpoint" ? { summary: upstream.slice(0, 20_000) } : { ...params, content: upstream.slice(0, 20_000) },
        });
        await db.update(tasks).set({ status: "awaiting_approval" }).where(eq(tasks.id, t.id));
        changed = true;
      }
    }
    if (!changed) return;
    await refreshParents(open);
  }
}

async function refreshParents(rows: TaskRow[]) {
  for (const id of new Set(rows.map((r) => r.commandId).filter(Boolean) as string[])) await refreshCommand(id);
  for (const id of new Set(rows.map((r) => r.workflowRunId).filter(Boolean) as string[])) await refreshWorkflowRun(id);
}

export async function afterTaskChange(task: Pick<TaskRow, "commandId" | "workflowRunId">) {
  await scheduleReadyTasks();
  if (task.commandId) await refreshCommand(task.commandId);
  if (task.workflowRunId) await refreshWorkflowRun(task.workflowRunId);
}

export async function refreshCommand(commandId: string) {
  const db = await getDb();
  const [cmd] = await db.select().from(commands).where(eq(commands.id, commandId));
  if (!cmd || cmd.status === "planning") return;
  const ts = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.commandId, commandId));
  if (!ts.length) return;
  const active = ts.some((t) => ["pending", "assigned", "running"].includes(t.status));
  if (active) {
    if (cmd.status !== "running") await db.update(commands).set({ status: "running" }).where(eq(commands.id, commandId));
    return;
  }
  if (!cmd.response) {
    if (!(await hasOpenJob("synthesize_command", "commandId", commandId))) await enqueue("synthesize_command", { commandId });
    return;
  }
  const awaiting = ts.some((t) => t.status === "awaiting_approval");
  const status = awaiting ? "awaiting_approval" : ts.every((t) => t.status === "failed" || t.status === "cancelled") ? "failed" : "completed";
  if (cmd.status !== status) await db.update(commands).set({ status, completedAt: status === "awaiting_approval" ? null : new Date() }).where(eq(commands.id, commandId));
}

export async function refreshWorkflowRun(runId: string) {
  const db = await getDb();
  const ts = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.workflowRunId, runId));
  if (!ts.length) return;
  let status: "running" | "completed" | "failed" | "cancelled" = "running";
  if (ts.every((t) => t.status === "completed")) status = "completed";
  else if (ts.some((t) => t.status === "failed")) status = "failed";
  else if (ts.every((t) => TERMINAL.includes(t.status))) status = "cancelled";
  await db
    .update(workflowRuns)
    .set({ status, completedAt: status === "running" ? null : new Date() })
    .where(eq(workflowRuns.id, runId));
}

export async function cancelTask(id: string, userId: string) {
  const db = await getDb();
  const [t] = await db
    .update(tasks)
    .set({ status: "cancelled", completedAt: new Date(), error: "Cancelled by user" })
    .where(and(eq(tasks.id, id), sql`${tasks.status} not in ('completed','failed','cancelled')`))
    .returning();
  if (!t) return null;
  // Withdraw any pending approvals belonging to the task.
  await db.update(approvals).set({ status: "rejected", decisionNote: "Task cancelled", decidedBy: userId, decidedAt: new Date() }).where(and(eq(approvals.taskId, id), eq(approvals.status, "pending")));
  await audit({ actorType: "user", actorId: userId, action: "task.cancelled", entityType: "task", entityId: id });
  await logTask(id, "warn", "Task cancelled by user");
  await afterTaskChange(t);
  return t;
}

export async function retryTask(id: string, userId: string) {
  const db = await getDb();
  const [t] = await db
    .update(tasks)
    .set({ status: "assigned", error: null, attempts: 0, completedAt: null, startedAt: null })
    .where(and(eq(tasks.id, id), inArray(tasks.status, ["failed", "cancelled"]), sql`${tasks.agentId} is not null`))
    .returning();
  if (!t) return null;
  await audit({ actorType: "user", actorId: userId, action: "task.retried", entityType: "task", entityId: id });
  await logTask(id, "info", "Retry requested by user");
  await db.update(tasks).set({ input: { ...t.input, autoRun: true } }).where(eq(tasks.id, id));
  await afterTaskChange(t);
  return t;
}

export async function runTaskNow(id: string, userId: string) {
  const db = await getDb();
  const [t] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!t || !t.agentId || t.status !== "assigned") return null;
  await db.update(tasks).set({ input: { ...t.input, autoRun: true } }).where(eq(tasks.id, id));
  await audit({ actorType: "user", actorId: userId, action: "task.run_requested", entityType: "task", entityId: id });
  await scheduleReadyTasks();
  return t;
}

export const updateTaskInput = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(20_000).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  agentId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  status: z.enum(["pending", "completed"]).optional(), // manual tasks only
});

export async function updateTask(id: string, patch: z.infer<typeof updateTaskInput>, userId: string) {
  const db = await getDb();
  const [cur] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!cur) return null;
  const set: Partial<TaskRow> = { ...patch } as Partial<TaskRow>;
  if (patch.status && cur.kind !== "manual") delete set.status;
  if (patch.status === "completed") set.completedAt = new Date();
  if (patch.agentId !== undefined && cur.kind !== "checkpoint") {
    set.kind = patch.agentId ? "agent" : "manual";
    if (patch.agentId && ["pending", "assigned"].includes(cur.status)) set.status = "assigned";
  }
  const [t] = await db.update(tasks).set(set).where(eq(tasks.id, id)).returning();
  await audit({ actorType: "user", actorId: userId, action: "task.updated", entityType: "task", entityId: id, details: { fields: Object.keys(patch) } });
  return t;
}

export async function listTasks(filter: { status?: string; agentId?: string; projectId?: string; commandId?: string; limit?: number } = {}) {
  const db = await getDb();
  const conds = [];
  if (filter.status) conds.push(eq(tasks.status, filter.status as TaskStatus));
  if (filter.agentId) conds.push(eq(tasks.agentId, filter.agentId));
  if (filter.projectId) conds.push(eq(tasks.projectId, filter.projectId));
  if (filter.commandId) conds.push(eq(tasks.commandId, filter.commandId));
  return db
    .select({ task: tasks, agentName: agents.name, agentSlug: agents.slug, agentColor: agents.color })
    .from(tasks)
    .leftJoin(agents, eq(agents.id, tasks.agentId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(tasks.createdAt))
    .limit(filter.limit ?? 300);
}
