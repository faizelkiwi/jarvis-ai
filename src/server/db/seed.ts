import { eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { agents, integrations, settings } from "./schema";
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

  // v2: grant the new inbox tools to the Personal Assistant and Customer Service agents (once, additive only).
  const [ver] = await db.select().from(settings).where(eq(settings.key, "runtime.seed.version"));
  if (Number((ver?.value as { v?: number })?.v ?? 1) < 2) {
    for (const slug of ["personal-assistant", "customer-service"]) {
      const [a] = await db.select().from(agents).where(eq(agents.slug, slug));
      if (a) {
        const perms = [...new Set([...a.permissions, "search_email", "read_email"])];
        await db.update(agents).set({ permissions: perms }).where(eq(agents.id, a.id));
      }
    }
    await db
      .insert(settings)
      .values({ key: "runtime.seed.version", value: { v: 2 } })
      .onConflictDoUpdate({ target: settings.key, set: { value: { v: 2 } } });
  }
}
