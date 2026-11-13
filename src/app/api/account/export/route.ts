import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLog, commands, users } from "@/server/db/schema";
import { audit } from "@/server/audit/log";
import { route } from "@/server/http";

/** POPIA s23 / GDPR art. 15: data subject access — the signed-in user's personal data. */
export const GET = route({ role: "viewer" }, async ({ user }) => {
  const db = await getDb();
  const [profile] = await db.select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.id, user.id));
  const myCommands = await db.select().from(commands).where(eq(commands.userId, user.id));
  const myAudit = await db.select().from(auditLog).where(eq(auditLog.actorId, user.id));
  await audit({ actorType: "user", actorId: user.id, action: "account.data_exported" });
  return new NextResponse(JSON.stringify({ profile, commands: myCommands, activity: myAudit }, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="jarvis-my-data.json"` },
  });
});
