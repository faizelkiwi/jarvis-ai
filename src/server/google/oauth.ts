import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { credentials, integrations } from "../db/schema";
import { decryptSecret, encryptSecret } from "../security/crypto";
import { getIntegrationSecrets, getIntegrationConfig } from "../integrations/service";

export const GOOGLE_SCOPES: Record<string, string[]> = {
  gmail: ["openid", "email", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"],
};

export class GoogleNotConnectedError extends Error {
  constructor(slug: string) {
    super(`${slug === "gmail" ? "Gmail" : "Google"} is not connected. Open Integrations → ${slug === "gmail" ? "Gmail" : slug} and click "Connect with Google".`);
  }
}

export function redirectUri(origin: string, slug: string) {
  return `${origin}/api/integrations/${slug}/callback`;
}

export function authUrl(slug: string, clientId: string, origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin, slug),
    response_type: "code",
    scope: GOOGLE_SCOPES[slug].join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/** Merges secret values into the encrypted credential record for an integration. */
export async function patchSecrets(slug: string, patch: Record<string, string | null>) {
  const db = await getDb();
  const [row] = await db.select().from(credentials).where(eq(credentials.provider, slug));
  let current: Record<string, string> = {};
  if (row) {
    try {
      current = JSON.parse(decryptSecret(row.encryptedValue));
    } catch {
      current = {};
    }
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete current[k];
    else current[k] = v;
  }
  const enc = encryptSecret(JSON.stringify(current));
  await db
    .insert(credentials)
    .values({ provider: slug, encryptedValue: enc })
    .onConflictDoUpdate({ target: credentials.provider, set: { encryptedValue: enc, updatedAt: new Date() } });
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw Object.assign(new Error(`Google token error: ${data.error_description ?? data.error ?? `HTTP ${res.status}`}`), { code: data.error });
  return data;
}

export async function exchangeCode(slug: string, code: string, origin: string) {
  const s = await getIntegrationSecrets(slug);
  const cfg = await getIntegrationConfig(slug);
  const clientId = cfg?.config?.clientId;
  if (!clientId || !s.clientSecret) throw new Error("OAuth client ID/secret are missing");
  return tokenRequest({ code, client_id: clientId, client_secret: s.clientSecret, redirect_uri: redirectUri(origin, slug), grant_type: "authorization_code" });
}

const cache = new Map<string, { token: string; exp: number }>();

/** A valid access token for the integration, refreshed when needed. */
export async function accessToken(slug: string): Promise<string> {
  const hit = cache.get(slug);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const s = await getIntegrationSecrets(slug);
  const cfg = await getIntegrationConfig(slug);
  if (!s.refreshToken || !s.clientSecret || !cfg?.config?.clientId) throw new GoogleNotConnectedError(slug);
  try {
    const t = await tokenRequest({ refresh_token: s.refreshToken, client_id: cfg.config.clientId, client_secret: s.clientSecret, grant_type: "refresh_token" });
    cache.set(slug, { token: t.access_token!, exp: Date.now() + (t.expires_in ?? 3600) * 1000 });
    return t.access_token!;
  } catch (e) {
    if ((e as { code?: string }).code === "invalid_grant") {
      // Revoked or expired (e.g. app left in "Testing" mode for 7 days): require reconnecting.
      await patchSecrets(slug, { refreshToken: null });
      const db = await getDb();
      await db.update(integrations).set({ status: "error", lastError: "Google access expired or was revoked — click Connect with Google again." }).where(eq(integrations.slug, slug));
      throw new GoogleNotConnectedError(slug);
    }
    throw e;
  }
}

export function clearTokenCache(slug: string) {
  cache.delete(slug);
}
