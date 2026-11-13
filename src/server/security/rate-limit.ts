import { sql } from "drizzle-orm";
import { getDb } from "../db/client";

/**
 * Fixed-window rate limiter stored in Postgres so it holds across serverless instances.
 * Returns true when the request is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = await getDb();
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const res = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, ${windowStart}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`);
  if (Math.random() < 0.02) {
    await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
  }
  return Number(res.rows[0]?.count ?? 0) <= limit;
}
