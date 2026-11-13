import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { jobs } from "../db/schema";

export type JobType = "plan_command" | "run_task" | "synthesize_command" | "maintenance";

export async function enqueue(type: JobType, payload: Record<string, unknown>, opts: { runAt?: Date; maxAttempts?: number } = {}) {
  const db = await getDb();
  const [job] = await db
    .insert(jobs)
    .values({ type, payload, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 3 })
    .returning();
  return job;
}

export async function hasOpenJob(type: JobType, key: string, value: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, type), sql`${jobs.payload}->>${key} = ${value}`, sql`${jobs.status} in ('queued','running')`))
    .limit(1);
  return rows.length > 0;
}

/** Atomically claims ready jobs. SKIP LOCKED lets multiple workers run safely. */
export async function claimJobs(workerId: string, limit: number) {
  const db = await getDb();
  // Recover jobs whose worker died mid-run.
  await db
    .update(jobs)
    .set({ status: "queued", lockedAt: null, lockedBy: null })
    .where(and(eq(jobs.status, "running"), lt(jobs.lockedAt, new Date(Date.now() - 20 * 60_000))));
  const res = await db.execute<{ id: string }>(sql`
    update jobs set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1
    where id in (
      select id from jobs where status = 'queued' and run_at <= now()
      order by run_at asc limit ${limit} for update skip locked
    )
    returning id`);
  if (!res.rows.length) return [];
  return db
    .select()
    .from(jobs)
    .where(sql`${jobs.id} in (${sql.join(res.rows.map((r) => sql`${r.id}`), sql`, `)})`);
}

export async function completeJob(id: string) {
  const db = await getDb();
  await db.update(jobs).set({ status: "done", finishedAt: new Date(), lockedBy: null }).where(eq(jobs.id, id));
}

export async function failJob(id: string, error: string, retryable: boolean) {
  const db = await getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return;
  if (retryable && job.attempts < job.maxAttempts) {
    const backoff = Math.min(15 * 60_000, 2 ** job.attempts * 15_000);
    await db
      .update(jobs)
      .set({ status: "queued", lastError: error.slice(0, 2000), runAt: new Date(Date.now() + backoff), lockedBy: null, lockedAt: null })
      .where(eq(jobs.id, id));
  } else {
    await db.update(jobs).set({ status: "failed", lastError: error.slice(0, 2000), finishedAt: new Date(), lockedBy: null }).where(eq(jobs.id, id));
  }
}
