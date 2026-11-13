/** Applies database migrations to DATABASE_URL (Supabase/Postgres). */
import path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: url, ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  await migrate(drizzle(pool), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  console.log("Migrations applied.");
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
