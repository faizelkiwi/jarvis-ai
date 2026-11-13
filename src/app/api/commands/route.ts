import { desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { commands } from "@/server/db/schema";
import { submitCommand } from "@/server/agents/orchestrator";
import { json, route } from "@/server/http";

export const GET = route({}, async () => {
  const db = await getDb();
  return { commands: await db.select().from(commands).orderBy(desc(commands.createdAt)).limit(50) };
});

export const POST = route({ role: "operator", limit: [30, 60] }, async ({ req, user }) => {
  const v = z
    .object({ text: z.string().trim().min(2).max(8000), channel: z.enum(["text", "voice"]).default("text"), projectId: z.string().uuid().nullable().optional() })
    .parse(await json(req));
  const cmd = await submitCommand({ text: v.text, userId: user.id, channel: v.channel, projectId: v.projectId });
  return { command: cmd };
});
