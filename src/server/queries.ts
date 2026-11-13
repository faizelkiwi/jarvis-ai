/** Read models for pages and APIs (dashboard, analytics, health). Real data only. */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, getDbDriver } from "./db/client";
import {
  agents,
  aiUsage,
  approvals,
  auditLog,
  commands,
  jobs,
  knowledgeDocuments,
  notifications,
  projects,
  tasks,
  transactions,
  workflowRuns,
  workflows,
} from "./db/schema";
import { getRuntimeValue, getSetting } from "./settings/service";
import { listIntegrationStatus } from "./integrations/service";
import { isDemoMode } from "./ai";

export async function dashboardData() {
  const db = await getDb();
  const since24 = new Date(Date.now() - 86400_000);
  const [taskCounts, agentRows, pendingApprovals, recentCommands, recentActivity, projectRows, notes, wfActive, runningTasks, usage30] = await Promise.all([
    db.select({ status: tasks.status, n: sql<number>`count(*)::int` }).from(tasks).groupBy(tasks.status),
    db.select().from(agents).orderBy(agents.name),
    db
      .select({ id: approvals.id, title: approvals.title, action: approvals.action, riskLevel: approvals.riskLevel, createdAt: approvals.createdAt, agentName: agents.name })
      .from(approvals)
      .leftJoin(agents, eq(agents.id, approvals.agentId))
      .where(eq(approvals.status, "pending"))
      .orderBy(desc(approvals.createdAt))
      .limit(6),
    db.select().from(commands).orderBy(desc(commands.createdAt)).limit(5),
    db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(12),
    db.select().from(projects).where(inArray(projects.status, ["planning", "active"])).orderBy(desc(projects.updatedAt)).limit(6),
    db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(6),
    db.select({ n: sql<number>`count(*)::int` }).from(workflows).where(eq(workflows.active, true)),
    db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status, agentId: tasks.agentId, startedAt: tasks.startedAt })
      .from(tasks)
      .where(inArray(tasks.status, ["running", "assigned", "awaiting_approval"]))
      .orderBy(desc(tasks.createdAt))
      .limit(20),
    db
      .select({ cost: sql<string>`coalesce(sum(${aiUsage.costUsd}),0)`, tokens: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}),0)::int` })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, new Date(Date.now() - 30 * 86400_000))),
  ]);
  const count = (s: string) => taskCounts.find((t) => t.status === s)?.n ?? 0;
  const [completed24] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.status, "completed"), gte(tasks.completedAt, since24)));
  const overdue = await db
    .select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(sql`${tasks.dueDate} < current_date`, sql`${tasks.status} not in ('completed','cancelled','failed')`))
    .limit(10);
  const ai = await getSetting("ai.defaults");
  const anthropicReady = (await listIntegrationStatus()).find((i) => i.slug === ai.provider)?.status !== "not_configured";
  return {
    counts: {
      running: count("running"),
      queued: count("assigned") + count("pending"),
      awaitingApproval: count("awaiting_approval"),
      completed: count("completed"),
      failed: count("failed"),
      cancelled: count("cancelled"),
      completed24: completed24.n,
      pendingApprovals: pendingApprovals.length,
      activeAgents: agentRows.filter((a) => a.active).length,
      totalAgents: agentRows.length,
      activeWorkflows: wfActive[0].n,
      activeProjects: projectRows.length,
    },
    agents: agentRows.map((a) => ({
      ...a,
      currentTask: runningTasks.find((t) => t.agentId === a.id && t.status === "running") ?? null,
      queued: runningTasks.filter((t) => t.agentId === a.id && t.status === "assigned").length,
    })),
    pendingApprovals,
    recentCommands,
    recentActivity,
    projects: projectRows,
    notifications: notes,
    overdue,
    usage30: { costUsd: Number(usage30[0].cost), tokens: usage30[0].tokens },
    ai: { provider: ai.provider, model: ai.model, ready: anthropicReady || isDemoMode(), demo: isDemoMode() },
  };
}

export async function analyticsData(days = 30) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000);
  const sinceDate = since.toISOString().slice(0, 10);
  const [byStatus, byAgent, daily, runs, usageByDay, usageByAgent, tx, approvalsByStatus] = await Promise.all([
    db.select({ status: tasks.status, n: sql<number>`count(*)::int` }).from(tasks).where(gte(tasks.createdAt, since)).groupBy(tasks.status),
    db
      .select({
        agent: agents.name,
        completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')::int`,
        total: sql<number>`count(*)::int`,
        avgSeconds: sql<number>`coalesce(avg(extract(epoch from (${tasks.completedAt} - ${tasks.startedAt}))) filter (where ${tasks.status} = 'completed'), 0)::float`,
      })
      .from(tasks)
      .innerJoin(agents, eq(agents.id, tasks.agentId))
      .where(gte(tasks.createdAt, since))
      .groupBy(agents.name),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${tasks.createdAt}), 'YYYY-MM-DD')`,
        created: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')::int`,
      })
      .from(tasks)
      .where(gte(tasks.createdAt, since))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db.select({ status: workflowRuns.status, n: sql<number>`count(*)::int` }).from(workflowRuns).where(gte(workflowRuns.createdAt, since)).groupBy(workflowRuns.status),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${aiUsage.createdAt}), 'YYYY-MM-DD')`,
        cost: sql<number>`sum(${aiUsage.costUsd})::float`,
        tokens: sql<number>`sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens})::int`,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, since))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ agent: sql<string>`coalesce(${agents.name}, 'JARVIS orchestrator')`, cost: sql<number>`sum(${aiUsage.costUsd})::float`, tokens: sql<number>`sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens})::int` })
      .from(aiUsage)
      .leftJoin(agents, eq(agents.id, aiUsage.agentId))
      .where(gte(aiUsage.createdAt, since))
      .groupBy(sql`1`),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${transactions.date}::timestamp), 'YYYY-MM')`,
        type: transactions.type,
        currency: transactions.currency,
        total: sql<number>`sum(${transactions.amount})::float`,
      })
      .from(transactions)
      .where(gte(transactions.date, new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10)))
      .groupBy(sql`1`, transactions.type, transactions.currency)
      .orderBy(sql`1`),
    db.select({ status: approvals.status, n: sql<number>`count(*)::int` }).from(approvals).where(gte(approvals.createdAt, since)).groupBy(approvals.status),
  ]);
  const expensesByCategory = await db
    .select({ category: transactions.category, total: sql<number>`sum(${transactions.amount})::float` })
    .from(transactions)
    .where(and(eq(transactions.type, "expense"), gte(transactions.date, sinceDate)))
    .groupBy(transactions.category);
  return { days, byStatus, byAgent, daily, runs, usageByDay, usageByAgent, tx, approvalsByStatus, expensesByCategory };
}

export async function healthData() {
  const db = await getDb();
  const started = Date.now();
  let dbOk = true;
  let dbError: string | null = null;
  try {
    await db.execute(sql`select 1`);
  } catch (e) {
    dbOk = false;
    dbError = (e as Error).message;
  }
  const dbLatencyMs = Date.now() - started;
  const heartbeat = await getRuntimeValue<{ at: string; worker: string }>("worker.heartbeat");
  const workerAgeSec = heartbeat ? Math.round((Date.now() - Date.parse(heartbeat.at)) / 1000) : null;
  const [jobStats, failedJobs, usage, integrationsList, docs] = await Promise.all([
    db.select({ status: jobs.status, n: sql<number>`count(*)::int` }).from(jobs).groupBy(jobs.status),
    db.select().from(jobs).where(eq(jobs.status, "failed")).orderBy(desc(jobs.finishedAt)).limit(10),
    db
      .select({
        tokensToday: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}) filter (where ${aiUsage.createdAt} > now() - interval '1 day'),0)::int`,
        costToday: sql<number>`coalesce(sum(${aiUsage.costUsd}) filter (where ${aiUsage.createdAt} > now() - interval '1 day'),0)::float`,
        tokensMonth: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}) filter (where ${aiUsage.createdAt} > date_trunc('month', now())),0)::int`,
        costMonth: sql<number>`coalesce(sum(${aiUsage.costUsd}) filter (where ${aiUsage.createdAt} > date_trunc('month', now())),0)::float`,
      })
      .from(aiUsage),
    listIntegrationStatus(),
    db.select({ n: sql<number>`count(*)::int` }).from(knowledgeDocuments),
  ]);
  const ai = await getSetting("ai.defaults");
  return {
    database: { ok: dbOk, error: dbError, latencyMs: dbLatencyMs, driver: await getDbDriver() },
    worker: { lastHeartbeat: heartbeat?.at ?? null, worker: heartbeat?.worker ?? null, healthy: workerAgeSec !== null && workerAgeSec < 120, ageSeconds: workerAgeSec },
    jobs: jobStats,
    failedJobs,
    usage: usage[0],
    budget: { monthlyBudgetUsd: ai.monthlyBudgetUsd },
    ai: { provider: ai.provider, model: ai.model, demoMode: isDemoMode() },
    integrations: integrationsList.map((i) => ({ slug: i.slug, name: i.name, status: i.status, implementation: i.implementation, lastError: i.lastError, category: i.category })),
    knowledgeDocuments: docs[0].n,
  };
}
