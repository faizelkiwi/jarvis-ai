import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { agents, aiUsage, projectAgents, taskLogs, tasks } from "../db/schema";
import { audit } from "../audit/log";
import { EFFORTS, PROVIDERS } from "../settings/defaults";
import { TOOLS } from "./tools";

export const agentInput = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Slug: 2–40 lowercase letters, digits or dashes"),
  name: z.string().trim().min(1).max(100),
  title: z.string().trim().max(100).default("Specialist"),
  description: z.string().trim().min(1).max(1000),
  responsibilities: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  systemPrompt: z.string().trim().min(10).max(20_000),
  provider: z.enum(PROVIDERS).nullable().optional(),
  model: z.string().trim().max(100).nullable().optional(),
  effort: z.enum(EFFORTS).nullable().optional(),
  active: z.boolean().default(true),
  permissions: z.array(z.string()).max(50).default([]).refine((p) => p.every((x) => x in TOOLS), "Unknown tool in permissions"),
  canDelegateTo: z.array(z.string()).max(50).default([]),
  knowledgeScopes: z.array(z.string().max(100)).max(50).default(["*"]),
  color: z.string().max(20).default("cyan"),
  icon: z.string().max(30).default("bot"),
  projectIds: z.array(z.string().uuid()).max(100).optional(),
});

export async function createAgent(input: z.input<typeof agentInput>, userId: string) {
  const v = agentInput.parse(input);
  const db = await getDb();
  const { projectIds, ...rest } = v;
  const [row] = await db.insert(agents).values({ ...rest, model: rest.model || null }).returning();
  if (projectIds?.length) await db.insert(projectAgents).values(projectIds.map((p) => ({ projectId: p, agentId: row.id }))).onConflictDoNothing();
  await audit({ actorType: "user", actorId: userId, action: "agent.created", entityType: "agent", entityId: row.id, details: { slug: row.slug } });
  return row;
}

export async function updateAgent(id: string, input: Partial<z.input<typeof agentInput>>, userId: string) {
  const v = agentInput.partial().parse(input);
  const db = await getDb();
  const { projectIds, ...rest } = v;
  const [before] = await db.select().from(agents).where(eq(agents.id, id));
  if (!before) return null;
  const [row] = await db.update(agents).set({ ...rest, ...(rest.model !== undefined ? { model: rest.model || null } : {}), updatedAt: new Date() }).where(eq(agents.id, id)).returning();
  if (projectIds) {
    await db.delete(projectAgents).where(eq(projectAgents.agentId, id));
    if (projectIds.length) await db.insert(projectAgents).values(projectIds.map((p) => ({ projectId: p, agentId: id }))).onConflictDoNothing();
  }
  const changed = Object.keys(rest).filter((k) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((rest as Record<string, unknown>)[k]));
  await audit({
    actorType: "user",
    actorId: userId,
    action: "agent.updated",
    entityType: "agent",
    entityId: id,
    details: { changed, ...(changed.includes("permissions") ? { permissionsBefore: before.permissions, permissionsAfter: row.permissions } : {}) },
  });
  return row;
}

export async function deleteAgent(id: string, userId: string) {
  const db = await getDb();
  const [row] = await db.delete(agents).where(eq(agents.id, id)).returning();
  if (row) await audit({ actorType: "user", actorId: userId, action: "agent.deleted", entityType: "agent", entityId: id, details: { slug: row.slug } });
  return row ?? null;
}

export async function agentDetail(id: string) {
  const db = await getDb();
  const [agent] = await db.select().from(agents).where(eq(agents.id, id));
  if (!agent) return null;
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')::int`,
      running: sql<number>`count(*) filter (where ${tasks.status} = 'running')::int`,
      avgSeconds: sql<number>`coalesce(avg(extract(epoch from (${tasks.completedAt} - ${tasks.startedAt}))) filter (where ${tasks.status} = 'completed'),0)::float`,
    })
    .from(tasks)
    .where(eq(tasks.agentId, id));
  const [usage] = await db
    .select({ tokens: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}),0)::int`, cost: sql<number>`coalesce(sum(${aiUsage.costUsd}),0)::float` })
    .from(aiUsage)
    .where(eq(aiUsage.agentId, id));
  const history = await db.select().from(tasks).where(eq(tasks.agentId, id)).orderBy(desc(tasks.createdAt)).limit(25);
  const logs = await db.select().from(taskLogs).where(eq(taskLogs.agentId, id)).orderBy(desc(taskLogs.id)).limit(60);
  const projectsAssigned = await db.select({ projectId: projectAgents.projectId }).from(projectAgents).where(eq(projectAgents.agentId, id));
  const current = history.find((t) => t.status === "running") ?? null;
  return { agent, stats, usage, history, logs, current, projectIds: projectsAssigned.map((p) => p.projectId) };
}

export async function agentIsBusy(id: string) {
  const db = await getDb();
  const r = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.agentId, id), eq(tasks.status, "running"))).limit(1);
  return r.length > 0;
}
