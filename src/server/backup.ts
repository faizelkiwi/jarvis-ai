import * as schema from "./db/schema";
import { getDb } from "./db/client";
import { setSetting } from "./settings/service";

/**
 * Full logical export of business data (JSON). Secrets and password hashes are
 * excluded by design; restore credentials from your own secure store.
 */
export async function exportAll() {
  const db = await getDb();
  const [users, agents, projects, projectAgents, commands, tasks, approvals, auditLog, knowledgeDocuments, workflows, workflowRuns, transactions, settings, integrations, notifications] =
    await Promise.all([
      db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role, createdAt: schema.users.createdAt }).from(schema.users),
      db.select().from(schema.agents),
      db.select().from(schema.projects),
      db.select().from(schema.projectAgents),
      db.select().from(schema.commands),
      db.select().from(schema.tasks),
      db.select().from(schema.approvals),
      db.select().from(schema.auditLog),
      db.select().from(schema.knowledgeDocuments),
      db.select().from(schema.workflows),
      db.select().from(schema.workflowRuns),
      db.select().from(schema.transactions),
      db.select().from(schema.settings),
      db.select({ slug: schema.integrations.slug, enabled: schema.integrations.enabled, config: schema.integrations.config }).from(schema.integrations),
      db.select().from(schema.notifications),
    ]);
  await setSetting("backup.settings", { lastBackupAt: new Date().toISOString() });
  return {
    format: "jarvis-backup-v1",
    exportedAt: new Date().toISOString(),
    note: "Excludes encrypted credentials and password hashes.",
    data: { users, agents, projects, projectAgents, commands, tasks, approvals, auditLog, knowledgeDocuments, workflows, workflowRuns, transactions, settings, integrations, notifications },
  };
}
