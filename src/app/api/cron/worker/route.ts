import { after, NextResponse, type NextRequest } from "next/server";
import { processJobs } from "@/server/jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Serverless job processing, called every minute by an external scheduler (e.g. cron-job.org)
 * with `Authorization: Bearer $CRON_SECRET`. Responds immediately (schedulers time out after
 * ~30 s) and processes jobs after the response, within the function's max duration.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  after(async () => {
    try {
      await processJobs(10, 2);
    } catch (e) {
      console.error("[cron-worker]", (e as Error).message);
    }
  });
  return NextResponse.json({ ok: true, started: new Date().toISOString() });
}
