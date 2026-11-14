import { describe, it, expect, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { approvals, integrations } from "@/server/db/schema";
import { saveIntegration, getIntegrationSecrets } from "@/server/integrations/service";
import { patchSecrets, authUrl, accessToken, clearTokenCache, GoogleNotConnectedError } from "@/server/google/oauth";
import { buildMime } from "@/server/google/gmail";
import { decideApproval, requestApproval } from "@/server/approvals/service";
import { makeUser } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  clearTokenCache("gmail");
});

const UID = "00000000-0000-0000-0000-000000000000";

describe("Gmail integration", () => {
  it("builds a safe MIME message (no header injection, UTF-8 subject)", () => {
    const mime = buildMime({ from: "me@x.com", to: "a@b.com\r\nBcc: evil@x.com", subject: "Héllo\nX-Injected: 1", body: "Body" });
    expect(mime).not.toMatch(/\r\nBcc:/);
    expect(mime).not.toMatch(/\r\nX-Injected/);
    expect(mime).toContain("Subject: =?UTF-8?B?");
  });

  it("requests offline access with the minimum Gmail scopes", () => {
    const u = new URL(authUrl("gmail", "cid.apps.googleusercontent.com", "https://app.example", "st"));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.example/api/integrations/gmail/callback");
    expect(u.searchParams.get("scope")).toContain("gmail.send");
    expect(u.searchParams.get("scope")).not.toContain("mail.google.com");
  });

  it("is not connected until a refresh token exists", async () => {
    await saveIntegration("gmail", { enabled: true, values: { clientId: "cid", clientSecret: "sec" } }, UID);
    await expect(accessToken("gmail")).rejects.toBeInstanceOf(GoogleNotConnectedError);
  });

  it("sends approved email through Gmail when connected — and only after approval", async () => {
    await patchSecrets("gmail", { refreshToken: "rt" });
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "at", expires_in: 3600 });
      if (url.endsWith("/profile")) return Response.json({ emailAddress: "owner@gmail.com" });
      if (url.endsWith("/messages/send")) return Response.json({ id: "m1", threadId: "t1" });
      return new Response("not found", { status: 404 });
    });
    const a = await requestApproval({ action: "send_email", title: "Email", agentId: null, taskId: null, reason: "r", expectedOutcome: "o", risks: "k", payload: { to: "client@example.com", subject: "Hi", body: "Hello" } });
    expect(calls.some((c) => c.includes("/messages/send"))).toBe(false); // nothing sent while pending
    const owner = await makeUser("owner");
    const r = await decideApproval(a.id, "approve", owner);
    expect(r.status).toBe("executed");
    expect(r.result?.message).toContain("owner@gmail.com");
    expect(calls.some((c) => c.startsWith("POST") && c.includes("/messages/send"))).toBe(true);
  });

  it("revoked access clears the token and asks to reconnect", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, { status: 400 }));
    await expect(accessToken("gmail")).rejects.toBeInstanceOf(GoogleNotConnectedError);
    expect((await getIntegrationSecrets("gmail")).refreshToken).toBeUndefined();
    const db = await getDb();
    const [row] = await db.select().from(integrations).where(eq(integrations.slug, "gmail"));
    expect(row.status).toBe("error");
    expect((await db.select().from(approvals)).length).toBeGreaterThan(0);
  });
});
