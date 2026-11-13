import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { agents, approvals, tasks, type UserRole } from "../db/schema";
import { audit } from "../audit/log";
import { notify } from "../notifications/service";
import { actionLabel, actionRisk } from "./catalog";
import { executeApproval } from "./executors";

export type ApprovalRequest = {
  action: string;
  title: string;
  agentId: string | null;
  taskId: string | null;
  reason: string;
  expectedOutcome: string;
  risks: string;
  payload: Record<string, unknown>;
};

export async function requestApproval(req: ApprovalRequest) {
  const db = await getDb();
  const [row] = await db
    .insert(approvals)
    .values({
      action: req.action,
      title: req.title.slice(0, 300),
      agentId: req.agentId,
      taskId: req.taskId,
      reason: req.reason.slice(0, 4000) || "(no reason given)",
      expectedOutcome: req.expectedOutcome.slice(0, 4000) || "(not specified)",
      risks: req.risks.slice(0, 4000) || "(not specified)",
      riskLevel: actionRisk(req.action),
      payload: req.payload,
    })
    .returning();
  await audit({
    actorType: req.agentId ? "agent" : "system",
    actorId: req.agentId,
    action: "approval.requested",
    entityType: "approval",
    entityId: row.id,
    details: { action: req.action, taskId: req.taskId, riskLevel: row.riskLevel },
  });
  await notify("approval", {
    level: "warning",
    title: `Approval needed: ${actionLabel(req.action)}`,
    body: req.title,
    link: `/approvals?id=${row.id}`,
  });
  return row;
}

export class ApprovalDecisionError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const CAN_DECIDE: UserRole[] = ["owner", "admin"];

/**
 * Records a human decision. The conditional UPDATE (… WHERE status = 'pending') makes
 * decisions single-use, so an approval can never be executed twice.
 */
export async function decideApproval(
  id: string,
  decision: "approve" | "reject" | "request_changes",
  user: { id: string; role: UserRole },
  note?: string,
) {
  if (!CAN_DECIDE.includes(user.role)) throw new ApprovalDecisionError("Only owners and admins can decide approvals", 403);
  const db = await getDb();
  const newStatus = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_requested";
  const [row] = await db
    .update(approvals)
    .set({ status: newStatus, decidedBy: user.id, decidedAt: new Date(), decisionNote: note?.slice(0, 2000) ?? null })
    .where(and(eq(approvals.id, id), eq(approvals.status, "pending")))
    .returning();
  if (!row) throw new ApprovalDecisionError("Approval not found or already decided", 409);

  await audit({
    actorType: "user",
    actorId: user.id,
    action: `approval.${newStatus}`,
    entityType: "approval",
    entityId: id,
    details: { action: row.action, note: note ?? null, payload: row.payload },
  });

  let result: { ok: boolean; message: string } | null = null;
  if (decision === "approve") {
    result = await executeApproval(id);
    const [updated] = await db
      .update(approvals)
      .set({ status: result.ok ? "executed" : "execution_failed", executionResult: result })
      .where(eq(approvals.id, id))
      .returning();
    await audit({
      actorType: "system",
      action: result.ok ? "approval.executed" : "approval.execution_failed",
      entityType: "approval",
      entityId: id,
      details: { action: updated.action, message: result.message },
    });
    if (!result.ok)
      await notify("failure", { level: "error", title: `Approved action could not execute`, body: result.message, link: `/approvals?id=${id}` });
  }

  if (decision === "request_changes" && row.taskId) {
    const { createRevisionTask } = await import("../tasks/service");
    await createRevisionTask(row, note ?? "Please revise.");
  }

  if (row.taskId) {
    const { onApprovalResolved } = await import("../tasks/service");
    await onApprovalResolved(row.taskId, row.action, newStatus, result?.message ?? note ?? "");
  }
  return { status: decision === "approve" ? (result?.ok ? "executed" : "execution_failed") : newStatus, result };
}

/** Re-attempts execution of an approved action that previously failed (e.g. integration was not configured). */
export async function retryExecution(id: string, user: { id: string; role: UserRole }) {
  if (!CAN_DECIDE.includes(user.role)) throw new ApprovalDecisionError("Only owners and admins can retry executions", 403);
  const db = await getDb();
  const [row] = await db
    .update(approvals)
    .set({ status: "approved" })
    .where(and(eq(approvals.id, id), eq(approvals.status, "execution_failed")))
    .returning();
  if (!row) throw new ApprovalDecisionError("Only failed executions can be retried", 409);
  await audit({ actorType: "user", actorId: user.id, action: "approval.retry_execution", entityType: "approval", entityId: id });
  const result = await executeApproval(id);
  await db.update(approvals).set({ status: result.ok ? "executed" : "execution_failed", executionResult: result }).where(eq(approvals.id, id));
  await audit({ actorType: "system", action: result.ok ? "approval.executed" : "approval.execution_failed", entityType: "approval", entityId: id, details: { message: result.message } });
  return result;
}

export async function listApprovals(status?: string[]) {
  const db = await getDb();
  return db
    .select({
      approval: approvals,
      agentName: agents.name,
      agentSlug: agents.slug,
      taskTitle: tasks.title,
    })
    .from(approvals)
    .leftJoin(agents, eq(agents.id, approvals.agentId))
    .leftJoin(tasks, eq(tasks.id, approvals.taskId))
    .where(status?.length ? inArray(approvals.status, status as never) : undefined)
    .orderBy(desc(approvals.createdAt))
    .limit(200);
}
