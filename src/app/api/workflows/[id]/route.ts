import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { workflows } from "@/server/db/schema";
import { audit } from "@/server/audit/log";
import { saveWorkflow } from "@/server/workflows/service";
import { json, notFound, route } from "@/server/http";

export const PUT = route<{ id: string }>({ role: "admin" }, async ({ req, params, user }) => ({ workflow: await saveWorkflow(await json(req), user.id, params.id) }));
export const DELETE = route<{ id: string }>({ role: "admin" }, async ({ params, user }) => {
  const db = await getDb();
  const [row] = await db.delete(workflows).where(eq(workflows.id, params.id)).returning();
  if (!row) notFound("Workflow");
  await audit({ actorType: "user", actorId: user.id, action: "workflow.deleted", entityType: "workflow", entityId: params.id, details: { name: row.name } });
  return { ok: true };
});
