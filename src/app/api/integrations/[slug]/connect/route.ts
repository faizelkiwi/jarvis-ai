import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { integrations } from "@/server/db/schema";
import { audit } from "@/server/audit/log";
import { getIntegrationSecrets } from "@/server/integrations/service";
import { authUrl, clearTokenCache, clientCredentials, GOOGLE_SCOPES, patchSecrets } from "@/server/google/oauth";
import { randomToken } from "@/server/security/crypto";
import { notFound, route } from "@/server/http";

/** Starts the Google OAuth consent flow (browser navigation). */
export const GET = route<{ slug: string }>({ role: "admin", limit: [20, 600] }, async ({ req, params }) => {
  if (!(params.slug in GOOGLE_SCOPES)) notFound("Integration");
  const c = await clientCredentials(params.slug);
  if (!c) return NextResponse.redirect(new URL(`/integrations?oauth_error=${encodeURIComponent("Save the Google OAuth client ID and secret first (on Gmail or here).")}`, req.nextUrl.origin));
  const state = randomToken(24);
  const res = NextResponse.redirect(authUrl(params.slug, c.clientId, req.nextUrl.origin, state));
  res.cookies.set(`jarvis_oauth_${params.slug}`, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return res;
});

/** Disconnects: revokes the Google grant and deletes the stored refresh token. */
export const DELETE = route<{ slug: string }>({ role: "admin" }, async ({ params, user }) => {
  if (!(params.slug in GOOGLE_SCOPES)) notFound("Integration");
  const s = await getIntegrationSecrets(params.slug);
  if (s.refreshToken)
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(s.refreshToken)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => {});
  await patchSecrets(params.slug, { refreshToken: null });
  clearTokenCache(params.slug);
  const db = await getDb();
  const [row] = await db.select().from(integrations).where(eq(integrations.slug, params.slug));
  const config = { ...(row?.config ?? {}) };
  delete config.connectedAccount;
  await db.update(integrations).set({ config, status: "configured", lastError: null }).where(eq(integrations.slug, params.slug));
  await audit({ actorType: "user", actorId: user.id, action: "integration.disconnected", entityType: "integration", entityId: params.slug });
  return { ok: true };
});
