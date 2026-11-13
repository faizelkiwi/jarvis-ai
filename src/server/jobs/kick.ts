import { after } from "next/server";

/**
 * On serverless hosting (Vercel) there is no always-on worker. After any request that
 * creates or is waiting on work, keep the function alive briefly (after the response is
 * sent) to process queued jobs. Safe to call often: jobs are claimed with SKIP LOCKED.
 */
export function kickWorker() {
  if (!(process.env.VERCEL || process.env.JARVIS_INPROCESS_WORKER === "false")) return;
  after(async () => {
    try {
      const { processJobs } = await import("./worker");
      await processJobs(12, 2);
    } catch (e) {
      console.error("[kick-worker]", (e as Error).message);
    }
  });
}
