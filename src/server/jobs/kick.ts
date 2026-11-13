import { after } from "next/server";
import { redactSecrets } from "../security/crypto";

async function record(key: string, value: Record<string, unknown>) {
  try {
    const { setRuntimeValue } = await import("../settings/service");
    await setRuntimeValue(key, value);
  } catch {
    /* diagnostics must never break the request */
  }
}

/** Runs queued jobs now, recording the outcome for the status page. Throws on failure. */
export async function runQueuedJobs(max: number) {
  await record("worker.lastKick", { at: new Date().toISOString() });
  try {
    const { processJobs } = await import("./worker");
    return await processJobs(max, 2);
  } catch (e) {
    const message = redactSecrets((e as Error).message ?? String(e)).slice(0, 500);
    await record("worker.lastError", { at: new Date().toISOString(), message });
    console.error("[worker]", message);
    throw new Error(message);
  }
}

/**
 * On serverless hosting (Vercel) there is no always-on worker. After any request that
 * creates or is waiting on work, keep the function alive briefly (after the response is
 * sent) to process queued jobs. Safe to call often: jobs are claimed with SKIP LOCKED.
 */
export function kickWorker() {
  if (!(process.env.VERCEL || process.env.JARVIS_INPROCESS_WORKER === "false")) return;
  after(async () => {
    await runQueuedJobs(12).catch(() => {});
  });
}
