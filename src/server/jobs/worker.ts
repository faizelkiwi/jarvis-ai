import os from "node:os";
import { lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { sessions } from "../db/schema";
import { claimJobs, completeJob, enqueue, failJob } from "./queue";
import { setRuntimeValue, getRuntimeValue } from "../settings/service";
import { purgeExpiredKnowledge } from "../knowledge/service";
import { ProviderError } from "../ai/types";
import { TaskRunError } from "../agents/runner";

const WORKER_ID = `${os.hostname()}:${process.pid}`;

async function handle(job: { id: string; type: string; payload: Record<string, unknown> }) {
  switch (job.type) {
    case "plan_command": {
      const { planCommand } = await import("../agents/orchestrator");
      return planCommand(String(job.payload.commandId));
    }
    case "synthesize_command": {
      const { synthesizeCommand } = await import("../agents/orchestrator");
      return synthesizeCommand(String(job.payload.commandId));
    }
    case "run_task": {
      const { runTask } = await import("../agents/runner");
      return runTask(String(job.payload.taskId));
    }
    case "maintenance": {
      await purgeExpiredKnowledge();
      const db = await getDb();
      await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
      return;
    }
    default:
      throw new Error(`Unknown job type ${job.type}`);
  }
}

/** Processes up to `max` ready jobs. Used by the background loop and the cron endpoint. */
export async function processJobs(max = 4, concurrency = 2): Promise<number> {
  let processed = 0;
  while (processed < max) {
    const batch = await claimJobs(WORKER_ID, Math.min(concurrency, max - processed));
    if (!batch.length) break;
    await Promise.all(
      batch.map(async (job) => {
        try {
          await handle(job);
          await completeJob(job.id);
        } catch (e) {
          const retryable = (e instanceof ProviderError && e.retryable) || (e instanceof TaskRunError && e.retryable);
          await failJob(job.id, (e as Error).message, retryable);
          if (!retryable) console.error(`[jarvis-worker] job ${job.type} ${job.id} failed:`, (e as Error).message);
        }
      }),
    );
    processed += batch.length;
  }
  await setRuntimeValue("worker.heartbeat", { at: new Date().toISOString(), worker: WORKER_ID });
  return processed;
}

/** Drain helper for tests: keep processing until the queue is idle. */
export async function drainJobs(maxRounds = 50) {
  let total = 0;
  for (let i = 0; i < maxRounds; i++) {
    const n = await processJobs(20, 4);
    total += n;
    if (!n) break;
  }
  return total;
}

const g = globalThis as unknown as { __jarvisWorker?: boolean };

export function startWorkerLoop(intervalMs = 2000) {
  if (g.__jarvisWorker) return;
  g.__jarvisWorker = true;
  let lastMaintenance = 0;
  const tick = async () => {
    try {
      if (Date.now() - lastMaintenance > 60 * 60_000) {
        lastMaintenance = Date.now();
        const last = await getRuntimeValue<{ at: string }>("maintenance.last");
        if (!last || Date.now() - Date.parse(last.at) > 60 * 60_000) {
          await enqueue("maintenance", {});
          await setRuntimeValue("maintenance.last", { at: new Date().toISOString() });
        }
      }
      await processJobs(8, 2);
    } catch (e) {
      console.error("[jarvis-worker] tick error:", (e as Error).message);
    } finally {
      setTimeout(tick, intervalMs);
    }
  };
  console.log(`[jarvis-worker] started (${WORKER_ID})`);
  setTimeout(tick, 500);
}
