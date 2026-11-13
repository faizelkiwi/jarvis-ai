import { NextResponse, type NextRequest } from "next/server";
import { processJobs } from "@/server/jobs/worker";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Serverless job processing (e.g. Vercel Cron). Requires `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const processed = await processJobs(10, 2);
  return NextResponse.json({ processed });
}
