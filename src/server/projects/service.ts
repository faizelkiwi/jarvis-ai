import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { PROJECT_STATUSES, projectAgents, projects, tasks } from "../db/schema";
import { audit } from "../audit/log";

export const projectInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(""),
  objective: z.string().max(2000).default(""),
  status: z.enum(PROJECT_STATUSES).default("active"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  agentIds: z.array(z.string().uuid()).max(50).optional(),
});

export async function listProjects() {
  const db = await getDb();
  const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
  const stats = await db
    .select({
      projectId: tasks.projectId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < current_date and ${tasks.status} not in ('completed','cancelled','failed'))::int`,
    })
    .from(tasks)
    .groupBy(tasks.projectId);
  const pa = await db.select().from(projectAgents);
  return rows.map((p) => ({ ...p, stats: stats.find((s) => s.projectId === p.id) ?? { total: 0, done: 0, overdue: 0 }, agentIds: pa.filter((x) => x.projectId === p.id).map((x) => x.agentId) }));
}

export async function saveProject(input: z.input<typeof projectInput>, userId: string, id?: string) {
  const v = projectInput.parse(input);
  const db = await getDb();
  const { agentIds, ...rest } = v;
  const [row] = id
    ? await db.update(projects).set({ ...rest, updatedAt: new Date() }).where(eq(projects.id, id)).returning()
    : await db.insert(projects).values({ ...rest, createdBy: userId }).returning();
  if (!row) return null;
  if (agentIds) {
    await db.delete(projectAgents).where(eq(projectAgents.projectId, row.id));
    if (agentIds.length) await db.insert(projectAgents).values(agentIds.map((a) => ({ projectId: row.id, agentId: a }))).onConflictDoNothing();
  }
  await audit({ actorType: "user", actorId: userId, action: id ? "project.updated" : "project.created", entityType: "project", entityId: row.id });
  return row;
}

export async function deleteProject(id: string, userId: string) {
  const db = await getDb();
  const [row] = await db.delete(projects).where(eq(projects.id, id)).returning();
  if (row) await audit({ actorType: "user", actorId: userId, action: "project.deleted", entityType: "project", entityId: id, details: { name: row.name } });
  return row ?? null;
}
