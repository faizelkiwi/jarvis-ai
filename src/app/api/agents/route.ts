import { getDb } from "@/server/db/client";
import { agents } from "@/server/db/schema";
import { createAgent } from "@/server/agents/service";
import { ASSIGNABLE_TOOLS } from "@/server/agents/tools";
import { json, route } from "@/server/http";

export const GET = route({}, async () => {
  const db = await getDb();
  return { agents: await db.select().from(agents).orderBy(agents.name), tools: ASSIGNABLE_TOOLS };
});

export const POST = route({ role: "admin" }, async ({ req, user }) => ({ agent: await createAgent(await json(req), user.id) }));
