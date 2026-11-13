import { desc, lt } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";
import { verifyAuditChain } from "@/server/audit/log";
import { route } from "@/server/http";

export const GET = route({ role: "admin" }, async ({ req }) => {
  const db = await getDb();
  const before = Number(req.nextUrl.searchParams.get("before") ?? 0);
  const rows = await db.select().from(auditLog).where(before ? lt(auditLog.id, before) : undefined).orderBy(desc(auditLog.id)).limit(100);
  const verify = req.nextUrl.searchParams.get("verify") === "1" ? await verifyAuditChain() : null;
  return { entries: rows, verify };
});
