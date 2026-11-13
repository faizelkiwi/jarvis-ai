import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { credentials, integrations } from "../db/schema";
import { decryptSecret, encryptSecret } from "../security/crypto";
import { audit } from "../audit/log";
import { getIntegrationDef, INTEGRATIONS } from "./registry";

/** Secret values for an integration, merged from env (AI providers) and encrypted DB storage. */
export async function getIntegrationSecrets(slug: string): Promise<Record<string, string>> {
  const def = getIntegrationDef(slug);
  if (!def) return {};
  const db = await getDb();
  const [row] = await db.select().from(credentials).where(eq(credentials.provider, slug));
  let secrets: Record<string, string> = {};
  if (row) {
    try {
      secrets = JSON.parse(decryptSecret(row.encryptedValue));
    } catch {
      secrets = {};
    }
  }
  if (def.envVar && process.env[def.envVar]) secrets.apiKey = process.env[def.envVar]!;
  return secrets;
}

export async function getIntegrationConfig(slug: string) {
  const db = await getDb();
  const [row] = await db.select().from(integrations).where(eq(integrations.slug, slug));
  return row ?? null;
}

/** Combined secrets + non-secret config, server-side only. */
export async function resolveIntegration(slug: string) {
  const [secrets, row] = await Promise.all([getIntegrationSecrets(slug), getIntegrationConfig(slug)]);
  return { values: { ...(row?.config ?? {}), ...secrets }, row };
}

export function requiredFieldsPresent(slug: string, values: Record<string, string>) {
  const def = getIntegrationDef(slug);
  if (!def) return false;
  return def.fields.filter((f) => !/optional/i.test(f.label)).every((f) => !!values[f.key]);
}

/** Public, browser-safe status (never includes secret values). */
export async function listIntegrationStatus() {
  const db = await getDb();
  const rows = await db.select().from(integrations);
  const creds = await db.select({ provider: credentials.provider, updatedAt: credentials.updatedAt }).from(credentials);
  return Promise.all(
    INTEGRATIONS.map(async (def) => {
      const row = rows.find((r) => r.slug === def.slug);
      const { values } = await resolveIntegration(def.slug);
      const configuredSecrets = def.fields.filter((f) => f.secret && values[f.key]).map((f) => f.key);
      return {
        ...def,
        enabled: row?.enabled ?? false,
        status: requiredFieldsPresent(def.slug, values) ? (row?.status === "not_configured" ? "configured" : row?.status ?? "configured") : "not_configured",
        lastCheckedAt: row?.lastCheckedAt ?? null,
        lastError: row?.lastError ?? null,
        config: row?.config ?? {},
        configuredSecrets,
        envManaged: !!(def.envVar && process.env[def.envVar]),
        secretUpdatedAt: creds.find((c) => c.provider === def.slug)?.updatedAt ?? null,
      };
    }),
  );
}

export async function saveIntegration(
  slug: string,
  input: { enabled?: boolean; values?: Record<string, string> },
  userId: string,
) {
  const def = getIntegrationDef(slug);
  if (!def) throw new Error("Unknown integration");
  const db = await getDb();
  const values = input.values ?? {};
  const secretPatch: Record<string, string> = {};
  const configPatch: Record<string, string> = {};
  for (const f of def.fields) {
    const v = values[f.key];
    if (v === undefined || v === "") continue; // empty = keep existing
    if (v.length > 8000) throw new Error(`${f.label} is too long`);
    (f.secret ? secretPatch : configPatch)[f.key] = v.trim();
  }

  if (Object.keys(secretPatch).length) {
    const [existing] = await db.select().from(credentials).where(eq(credentials.provider, slug));
    let current: Record<string, string> = {};
    if (existing) {
      try {
        current = JSON.parse(decryptSecret(existing.encryptedValue));
      } catch {
        current = {};
      }
    }
    const enc = encryptSecret(JSON.stringify({ ...current, ...secretPatch }));
    await db
      .insert(credentials)
      .values({ provider: slug, encryptedValue: enc, createdBy: userId })
      .onConflictDoUpdate({ target: credentials.provider, set: { encryptedValue: enc, updatedAt: new Date() } });
  }

  const [row] = await db.select().from(integrations).where(eq(integrations.slug, slug));
  const config = { ...(row?.config ?? {}), ...configPatch };
  const { values: resolved } = await resolveIntegration(slug);
  const merged = { ...resolved, ...config };
  const status = requiredFieldsPresent(slug, merged) ? "configured" : "not_configured";
  await db
    .insert(integrations)
    .values({ slug, enabled: input.enabled ?? row?.enabled ?? false, config, status })
    .onConflictDoUpdate({
      target: integrations.slug,
      set: { enabled: input.enabled ?? row?.enabled ?? false, config, status, updatedAt: new Date(), lastError: null },
    });

  await audit({
    actorType: "user",
    actorId: userId,
    action: "integration.updated",
    entityType: "integration",
    entityId: slug,
    details: { enabled: input.enabled, changedFields: [...Object.keys(secretPatch), ...Object.keys(configPatch)] },
  });
}

export async function removeIntegrationSecrets(slug: string, userId: string) {
  const db = await getDb();
  await db.delete(credentials).where(eq(credentials.provider, slug));
  await db
    .update(integrations)
    .set({ status: "not_configured", enabled: false, updatedAt: new Date() })
    .where(eq(integrations.slug, slug));
  await audit({ actorType: "user", actorId: userId, action: "integration.credentials_removed", entityType: "integration", entityId: slug });
}

export async function recordIntegrationCheck(slug: string, ok: boolean, error?: string) {
  const db = await getDb();
  await db
    .update(integrations)
    .set({ status: ok ? "connected" : "error", lastCheckedAt: new Date(), lastError: ok ? null : (error ?? "Unknown error").slice(0, 500) })
    .where(eq(integrations.slug, slug));
}
