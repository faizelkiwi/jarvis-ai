import { sql } from "drizzle-orm";
import type { Db } from "./client";
import { agents, integrations } from "./schema";
import { DEFAULT_AGENTS, buildAgentSystemPrompt } from "../agents/definitions";
import { INTEGRATIONS } from "../integrations/registry";

/** Idempotent first-run seed: default agents and integration rows. No business data is invented. */
export async function ensureSeed(db: Db) {
  const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from agents`)).rows;
  if (Number(n) === 0) {
    await db.insert(agents).values(
      DEFAULT_AGENTS.map((d) => ({
        slug: d.slug,
        name: d.name,
        title: d.title,
        description: d.description,
        responsibilities: d.responsibilities,
        systemPrompt: buildAgentSystemPrompt(d),
        permissions: d.permissions,
        canDelegateTo: d.canDelegateTo,
        color: d.color,
        icon: d.icon,
        isSystem: true,
      })),
    );
  }
  await db
    .insert(integrations)
    .values(INTEGRATIONS.map((i) => ({ slug: i.slug })))
    .onConflictDoNothing();
}
