/**
 * Action catalogue.
 *
 * CONSEQUENTIAL actions ALWAYS require human approval. This is hard-coded and cannot
 * be relaxed through settings — the approval rules UI only lists INTERNAL actions.
 */
export type RiskLevel = "low" | "medium" | "high" | "critical";

export const CONSEQUENTIAL_ACTIONS: Record<string, { label: string; risk: RiskLevel; integrations: string[] }> = {
  publish_social_post: { label: "Publish social media post", risk: "high", integrations: ["facebook", "instagram", "tiktok"] },
  send_email: { label: "Send external email", risk: "high", integrations: ["resend", "gmail"] },
  send_customer_message: { label: "Send customer message", risk: "high", integrations: ["whatsapp"] },
  send_telegram_message: { label: "Send Telegram message", risk: "medium", integrations: ["telegram"] },
  make_payment: { label: "Spend money / make payment", risk: "critical", integrations: [] },
  launch_ad_campaign: { label: "Launch advertising campaign", risk: "critical", integrations: [] },
  trigger_external_workflow: { label: "Trigger external workflow", risk: "high", integrations: ["make", "n8n"] },
  delete_knowledge: { label: "Delete business information", risk: "high", integrations: [] },
  change_setting: { label: "Change critical business setting", risk: "critical", integrations: [] },
  schedule_calendar_event: { label: "Create calendar event", risk: "medium", integrations: ["google-calendar"] },
  workflow_checkpoint: { label: "Workflow approval checkpoint", risk: "medium", integrations: [] },
};

/** Lower-risk internal actions; auto-execution is configurable in Settings → Approval rules. */
export const INTERNAL_ACTIONS: Record<string, { label: string; risk: RiskLevel; description: string }> = {
  save_memory: { label: "Save to memory", risk: "low", description: "Store an (unverified) note in the knowledge base" },
  delegate_task: { label: "Delegate task to another agent", risk: "low", description: "Create a sub-task for a permitted agent" },
  create_project: { label: "Create project", risk: "low", description: "Create a new project record" },
  record_transaction: { label: "Record transaction", risk: "medium", description: "Add an income/expense bookkeeping entry" },
};

export function isConsequential(action: string) {
  return action in CONSEQUENTIAL_ACTIONS;
}

export function actionLabel(action: string) {
  return CONSEQUENTIAL_ACTIONS[action]?.label ?? INTERNAL_ACTIONS[action]?.label ?? action;
}

export function actionRisk(action: string): RiskLevel {
  return CONSEQUENTIAL_ACTIONS[action]?.risk ?? INTERNAL_ACTIONS[action]?.risk ?? "high";
}
