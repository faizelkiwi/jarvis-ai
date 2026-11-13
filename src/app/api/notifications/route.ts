import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { json, route } from "@/server/http";

export const GET = route({}, async () => {
  const db = await getDb();
  const rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(100);
  return { notifications: rows, unread: rows.filter((r) => !r.read).length };
});

export const POST = route({ role: "viewer" }, async ({ req }) => {
  const v = z.object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional() }).parse(await json(req));
  const db = await getDb();
  if (v.all) await db.update(notifications).set({ read: true }).where(eq(notifications.read, false));
  else if (v.ids?.length) await db.update(notifications).set({ read: true }).where(inArray(notifications.id, v.ids));
  return { ok: true };
});
