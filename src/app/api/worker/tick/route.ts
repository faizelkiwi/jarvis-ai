import { runQueuedJobs } from "@/server/jobs/kick";
import { HttpError, route } from "@/server/http";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Processes queued jobs synchronously. The UI calls this while it is waiting for an
 * answer, so work progresses on serverless hosting without any background worker.
 */
export const POST = route({ role: "operator", limit: [120, 60] }, async () => {
  try {
    const processed = await runQueuedJobs(3);
    return { processed };
  } catch (e) {
    throw new HttpError(500, `Worker error: ${(e as Error).message}`);
  }
});
