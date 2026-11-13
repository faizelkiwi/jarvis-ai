import { asc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { approvals, taskLogs, tasks, agents } from "@/server/db/schema";
import { updateTask, updateTaskInput } from "@/server/tasks/service";
import { json, notFound, route } from "@/server/http";

export const GET = route<{ id: string }>({}, async ({ params }) => {
  const db = await getDb();
  const [row] = await db.select({ task: tasks, agentName: agents.name }).from(tasks).leftJoin(agents, eq(agents.id, tasks.agentId)).where(eq(tasks.id, params.id));
  if (!row) notFound("Task");
  const logs = await db.select().from(taskLogs).where(eq(taskLogs.taskId, params.id)).orderBy(asc(taskLogs.id));
  const appr = await db.select().from(approvals).where(eq(approvals.taskId, params.id));
  const subtasks = await db.select().from(tasks).where(eq(tasks.parentTaskId, params.id));
  return { ...row, logs, approvals: appr, subtasks };
});

export const PATCH = route<{ id: string }>({ role: "operator" }, async ({ req, params, user }) => ({
  task: (await updateTask(params.id, updateTaskInput.parse(await json(req)), user.id)) ?? notFound("Task"),
}));
