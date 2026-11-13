import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { approvals, commands } from "@/server/db/schema";
import { listTasks } from "@/server/tasks/service";
import { notFound, route } from "@/server/http";

export const GET = route<{ id: string }>({}, async ({ params }) => {
  const db = await getDb();
  const [command] = await db.select().from(commands).where(eq(commands.id, params.id));
  if (!command) notFound("Command");
  const t = await listTasks({ commandId: params.id });
  const ids = t.map((x) => x.task.id);
  const appr = ids.length ? (await db.select().from(approvals)).filter((a) => a.taskId && ids.includes(a.taskId)) : [];
  return { command, tasks: t, approvals: appr };
});
