import { desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { transactions } from "@/server/db/schema";
import { audit } from "@/server/audit/log";
import { json, route } from "@/server/http";

export const GET = route({}, async () => {
  const db = await getDb();
  return { transactions: await db.select().from(transactions).orderBy(desc(transactions.date), desc(transactions.createdAt)).limit(500) };
});

export const POST = route({ role: "operator" }, async ({ req, user }) => {
  const v = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      description: z.string().trim().min(1).max(500),
      amount: z.number().positive().max(1e12),
      currency: z.string().length(3).default("ZAR"),
      type: z.enum(["income", "expense"]),
      category: z.string().trim().max(100).default("uncategorised"),
    })
    .parse(await json(req));
  const db = await getDb();
  const [row] = await db.insert(transactions).values({ ...v, amount: v.amount.toFixed(2), currency: v.currency.toUpperCase(), source: "manual" }).returning();
  await audit({ actorType: "user", actorId: user.id, action: "transaction.recorded", entityType: "transaction", entityId: row.id, details: { type: v.type, amount: v.amount } });
  return { transaction: row };
});
