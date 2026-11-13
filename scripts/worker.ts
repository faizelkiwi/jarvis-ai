/**
 * Standalone background worker for production (run alongside the web app):
 *   DATABASE_URL=... JARVIS_ENCRYPTION_KEY=... npm run worker
 * Requires a shared PostgreSQL database (Supabase); the embedded dev database is single-process.
 */
import { getDb } from "../src/server/db/client";
import { startWorkerLoop } from "../src/server/jobs/worker";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required for the standalone worker. In development the worker runs inside `npm run dev`.");
    process.exit(1);
  }
  await getDb();
  startWorkerLoop(1500);
}
main();
