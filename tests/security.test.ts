import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { audit, verifyAuditChain } from "@/server/audit/log";
import { decryptSecret, encryptSecret, redactSecrets } from "@/server/security/crypto";
import { rateLimit } from "@/server/security/rate-limit";
import {
  AuthError,
  createSession,
  destroySession,
  getSessionUser,
  hasRole,
  registerUser,
  verifyLogin,
} from "@/server/auth/service";
import { setSetting } from "@/server/settings/service";
import { listIntegrationStatus, saveIntegration, getIntegrationSecrets } from "@/server/integrations/service";

describe("authentication", () => {
  it("first user becomes owner; registration then closes", async () => {
    const owner = await registerUser({ name: "Owner", email: "owner@test.local", password: "Sup3rSecretPw" });
    expect(owner.role).toBe("owner");
    await expect(registerUser({ name: "X", email: "x@test.local", password: "Sup3rSecretPw" })).rejects.toThrow(/closed/);
    await setSetting("auth.settings", { allowRegistration: true });
    const viewer = await registerUser({ name: "V", email: "v@test.local", password: "Sup3rSecretPw" });
    expect(viewer.role).toBe("viewer");
  });

  it("rejects weak passwords", async () => {
    await expect(registerUser({ name: "W", email: "w@test.local", password: "short" })).rejects.toThrow();
  });

  it("logs in, creates and destroys sessions", async () => {
    const u = await verifyLogin({ email: "owner@test.local", password: "Sup3rSecretPw" }, {});
    const { token } = await createSession(u.id, {});
    expect((await getSessionUser(token))?.email).toBe("owner@test.local");
    expect(await getSessionUser("forged-token")).toBeNull();
    await destroySession(token);
    expect(await getSessionUser(token)).toBeNull();
  });

  it("locks the account after repeated failures", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(verifyLogin({ email: "v@test.local", password: "wrong" }, {})).rejects.toBeInstanceOf(AuthError);
    }
    await expect(verifyLogin({ email: "v@test.local", password: "Sup3rSecretPw" }, {})).rejects.toThrow(/locked/);
  });

  it("enforces the role hierarchy", () => {
    expect(hasRole({ role: "owner" }, "admin")).toBe(true);
    expect(hasRole({ role: "viewer" }, "operator")).toBe(false);
    expect(hasRole({ role: "operator" }, "operator")).toBe(true);
  });
});

describe("secrets", () => {
  it("encrypts with AES-GCM and detects tampering", () => {
    const blob = encryptSecret("sk-ant-secret-value");
    expect(blob).not.toContain("secret-value");
    expect(decryptSecret(blob)).toBe("sk-ant-secret-value");
    const parts = blob.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("redacts credentials from text", () => {
    expect(redactSecrets("key sk-ant-api03-abcdefghijklmnop")).toContain("[REDACTED_KEY]");
  });

  it("never exposes integration secrets in status listings", async () => {
    const owner = (await getDb()).select;
    expect(owner).toBeDefined();
    await saveIntegration("telegram", { enabled: true, values: { botToken: "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", defaultChatId: "42" } }, "00000000-0000-0000-0000-000000000000");
    const list = await listIntegrationStatus();
    const tg = list.find((i) => i.slug === "telegram")!;
    expect(tg.status).toBe("configured");
    expect(JSON.stringify(list)).not.toContain("AAAAAAAAAAAAAAAA");
    expect(tg.configuredSecrets).toEqual(["botToken"]);
    expect((await getIntegrationSecrets("telegram")).botToken).toMatch(/^123456789:/);
  });
});

describe("audit log", () => {
  it("is hash-chained and verifiable", async () => {
    await audit({ actorType: "system", action: "test.one" });
    await audit({ actorType: "system", action: "test.two", details: { b: 2, a: 1 } });
    const v = await verifyAuditChain();
    expect(v.ok).toBe(true);
    expect(v.checked).toBeGreaterThan(1);
  });

  it("cannot be updated or deleted (database trigger)", async () => {
    const db = await getDb();
    const cause = (p: Promise<unknown>) => p.then(() => "no error", (e) => String(e?.cause?.message ?? e?.message));
    expect(await cause(db.execute(sql`update audit_log set action = 'tampered'`))).toMatch(/append-only/);
    expect(await cause(db.execute(sql`delete from audit_log`))).toMatch(/append-only/);
  });
});

describe("rate limiting", () => {
  it("blocks requests over the limit within a window", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit("test:key", 3, 60));
    expect(results).toEqual([true, true, true, false]);
  });
});
