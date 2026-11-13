import { getDb } from "./server/db/client";
import { startWorkerLoop } from "./server/jobs/worker";

export async function startNode() {
  if (process.env.JARVIS_INPROCESS_WORKER === "false") return;
  await getDb();
  startWorkerLoop();
}
