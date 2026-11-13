import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { USER_ROLES, users } from "@/server/db/schema";
import { audit } from "@/server/audit/log";
import { destroyAllSessions } from "@/server/auth/service";
import { HttpError, json, notFound, route } from "@/server/http";

export const PATCH = route<{ id: string }>({ role: "owner" }, async ({ req, params, user }) => {
  const v = z.object({ role: z.enum(USER_ROLES) }).parse(await json(req));
  if (params.id === user.id) throw new HttpError(400, "You cannot change your own role");
  const db = await getDb();
  const [row] = await db.update(users).set({ role: v.role }).where(eq(users.id, params.id)).returning({ id: users.id, role: users.role });
  if (!row) notFound("User");
  await destroyAllSessions(params.id);
  await audit({ actorType: "user", actorId: user.id, action: "user.role_changed", entityType: "user", entityId: params.id, details: { role: v.role } });
  return { user: row };
});

export const DELETE = route<{ id: string }>({ role: "owner" }, async ({ params, user }) => {
  if (params.id === user.id) throw new HttpError(400, "You cannot delete your own account here");
  const db = await getDb();
  const [row] = await db.delete(users).where(eq(users.id, params.id)).returning({ id: users.id, email: users.email });
  if (!row) notFound("User");
  await audit({ actorType: "user", actorId: user.id, action: "user.deleted", entityType: "user", entityId: params.id });
  return { ok: true };
});
