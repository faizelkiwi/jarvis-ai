import path from "node:path";
import fs from "node:fs";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * Both drivers expose the same Drizzle query API; we type against node-postgres.
 */
export type Db = NodePgDatabase<typeof schema>;

type DbState = { db: Db; close: () => Promise<void>; driver: "postgres" | "pglite" };

const g = globalThis as unknown as { __jarvisDb?: Promise<DbState> };

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

async function init(): Promise<DbState> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
      ssl: process.env.DATABASE_SSL === "false" ? undefined : url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
    const db = drizzle(pool, { schema });
    if (process.env.JARVIS_AUTO_MIGRATE === "true") {
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    }
    return { db, close: () => pool.end(), driver: "postgres" };
  }

  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set. Add your Supabase connection string in the hosting environment variables and redeploy.");
  }
  // Embedded Postgres (PGlite) — local development & tests.
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = process.env.JARVIS_PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (!dir.startsWith("memory://")) fs.mkdirSync(dir, { recursive: true });
  const client = await PGlite.create(dir, { extensions: { vector } });
  const db = drizzle(client, { schema }) as unknown as Db;
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, close: () => client.close(), driver: "pglite" };
}

export async function getDb(): Promise<Db> {
  if (!g.__jarvisDb) {
    g.__jarvisDb = init().then(async (state) => {
      const { ensureSeed } = await import("./seed");
      await ensureSeed(state.db);
      return state;
    });
    g.__jarvisDb.catch(() => {
      g.__jarvisDb = undefined;
    });
  }
  return (await g.__jarvisDb).db;
}

export async function getDbDriver(): Promise<"postgres" | "pglite"> {
  await getDb();
  return (await g.__jarvisDb!).driver;
}

export async function closeDb(): Promise<void> {
  if (g.__jarvisDb) {
    const s = await g.__jarvisDb;
    g.__jarvisDb = undefined;
    await s.close();
  }
}
