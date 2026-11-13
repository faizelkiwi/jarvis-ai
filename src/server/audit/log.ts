import { asc, desc, sql } from "drizzle-orm";
import { getDb, type Db } from "../db/client";
import { auditLog } from "../db/schema";
import { sha256 } from "../security/crypto";

export type AuditEntry = {
  actorType: "user" | "agent" | "system";
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
};

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`;
}

function entryHash(prevHash: string, ts: string, e: AuditEntry) {
  return sha256(
    canonical({
      prevHash,
      ts,
      actorType: e.actorType,
      actorId: e.actorId ?? null,
      action: e.action,
      entityType: e.entityType ?? null,
      entityId: e.entityId ?? null,
      details: e.details ?? null,
    }),
  );
}

/**
 * Appends a hash-chained entry. An advisory transaction lock serialises writers so
 * the chain stays linear even with multiple workers.
 */
export async function audit(entry: AuditEntry, dbOverride?: Db) {
  const db = dbOverride ?? (await getDb());
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(724001)`);
    const [last] = await tx.select({ hash: auditLog.hash }).from(auditLog).orderBy(desc(auditLog.id)).limit(1);
    const prevHash = last?.hash ?? "GENESIS";
    const ts = new Date();
    const hash = entryHash(prevHash, ts.toISOString(), entry);
    await tx.insert(auditLog).values({
      ts,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      details: entry.details ?? null,
      prevHash,
      hash,
    });
  });
}

/** Recomputes the full chain. Returns the id of the first broken entry, if any. */
export async function verifyAuditChain(): Promise<{ ok: boolean; checked: number; brokenAt?: number }> {
  const db = await getDb();
  const rows = await db.select().from(auditLog).orderBy(asc(auditLog.id));
  let prev = "GENESIS";
  for (const r of rows) {
    const expected = entryHash(prev, r.ts.toISOString(), {
      actorType: r.actorType,
      actorId: r.actorId,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      details: r.details as Record<string, unknown> | null,
    });
    if (r.prevHash !== prev || r.hash !== expected) return { ok: false, checked: rows.length, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, checked: rows.length };
}
