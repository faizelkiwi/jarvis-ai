import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { approvals } from "../db/schema";
import { audit } from "../audit/log";
import { INTERNAL_ACTIONS, isConsequential } from "../approvals/catalog";
import { executeApproval, type ExecutionResult } from "../approvals/executors";
import { getSetting } from "../settings/service";
import type { ToolContext } from "./tools";

/**
 * Auto-executes a LOW-RISK INTERNAL action permitted by the approval rules.
 * It still goes through the approval table (recorded as auto-approved) so every
 * action has the same audit trail. Consequential actions are rejected outright.
 */
export async function executeApprovalDirectInternal(action: string, payload: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult> {
  if (isConsequential(action) || !(action in INTERNAL_ACTIONS)) throw new Error(`"${action}" cannot be auto-executed`);
  const rules = await getSetting("approvals.rules");
  if (!rules.autoApprove[action]) throw new Error(`"${action}" is not enabled for automatic execution`);
  const db = await getDb();
  const [row] = await db
    .insert(approvals)
    .values({
      action,
      title: `${INTERNAL_ACTIONS[action].label} (auto)`,
      agentId: ctx.agent.id,
      taskId: ctx.task.id,
      reason: "Auto-approved by approval rule",
      expectedOutcome: INTERNAL_ACTIONS[action].description,
      risks: "Low-risk internal action",
      riskLevel: INTERNAL_ACTIONS[action].risk,
      payload,
      status: "approved",
      decidedAt: new Date(),
      decisionNote: `Auto-approved by rule "${action}"`,
    })
    .returning();
  const result = await executeApproval(row.id);
  await db.update(approvals).set({ status: result.ok ? "executed" : "execution_failed", executionResult: result }).where(eq(approvals.id, row.id));
  await audit({
    actorType: "agent",
    actorId: ctx.agent.id,
    action: "action.auto_executed",
    entityType: "approval",
    entityId: row.id,
    details: { action, ok: result.ok, message: result.message },
  });
  return result;
}
