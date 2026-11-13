import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { transactions } from "@/server/db/schema";
import { audit } from "@/server/audit/log";
import { notFound, route } from "@/server/http";

export const DELETE = route<{ id: string }>({ role: "admin" }, async ({ params, user }) => {
  const db = await getDb();
  const [row] = await db.delete(transactions).where(eq(transactions.id, params.id)).returning();
  if (!row) notFound("Transaction");
  await audit({ actorType: "user", actorId: user.id, action: "transaction.deleted", entityType: "transaction", entityId: params.id, details: { description: row.description, amount: row.amount } });
  return { ok: true };
});
