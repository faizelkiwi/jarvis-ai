import { kickWorker } from "@/server/jobs/kick";
import { z } from "zod";
import { cancelTask, retryTask, runTaskNow } from "@/server/tasks/service";
import { HttpError, json, route } from "@/server/http";

export const POST = route<{ id: string }>({ role: "operator" }, async ({ req, params, user }) => {
  const { action } = z.object({ action: z.enum(["cancel", "retry", "run"]) }).parse(await json(req));
  const fn = action === "cancel" ? cancelTask : action === "retry" ? retryTask : runTaskNow;
  const task = await fn(params.id, user.id);
  if (!task) throw new HttpError(409, `Cannot ${action} this task in its current state`);
  kickWorker();
  return { task };
});

export const maxDuration = 300;
