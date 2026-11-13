import { kickWorker } from "@/server/jobs/kick";
import { createTask, createTaskInput, listTasks, scheduleReadyTasks } from "@/server/tasks/service";
import { json, route } from "@/server/http";

export const GET = route({}, async ({ req }) => {
  const s = req.nextUrl.searchParams;
  return { tasks: await listTasks({ status: s.get("status") ?? undefined, agentId: s.get("agentId") ?? undefined, projectId: s.get("projectId") ?? undefined }) };
});

export const POST = route({ role: "operator", limit: [60, 60] }, async ({ req, user }) => {
  const v = createTaskInput.parse(await json(req));
  const task = await createTask({ ...v, createdBy: `user:${user.id}` });
  await scheduleReadyTasks();
  kickWorker();
  return { task };
});

export const maxDuration = 300;
