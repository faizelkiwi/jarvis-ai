import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { integrations } from "@/server/db/schema";
import { audit } from "@/server/audit/log";
import { currentUser } from "@/server/http";
import { hasRole } from "@/server/auth/service";
import { accountEmail, clearTokenCache, exchangeCode, GOOGLE_SCOPES, patchSecrets } from "@/server/google/oauth";

/** Google redirects here after consent. Verifies state, stores the refresh token encrypted. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/integrations?${q}`, req.nextUrl.origin));
    res.cookies.delete(`jarvis_oauth_${slug}`);
    return res;
  };
  if (!(slug in GOOGLE_SCOPES)) return back("oauth_error=unknown_integration");
  const user = await currentUser();
  if (!user || !hasRole(user, "admin")) return back("oauth_error=not_authorised");
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(`oauth_error=${encodeURIComponent(p.get("error")!)}`);
  const state = req.cookies.get(`jarvis_oauth_${slug}`)?.value;
  if (!state || state !== p.get("state")) return back("oauth_error=state_mismatch");
  const code = p.get("code");
  if (!code) return back("oauth_error=missing_code");
  try {
    const t = await exchangeCode(slug, code, req.nextUrl.origin);
    if (!t.refresh_token) return back("oauth_error=no_refresh_token");
    await patchSecrets(slug, { refreshToken: t.refresh_token });
    clearTokenCache(slug);
    const account = await accountEmail(t.access_token!);
    const db = await getDb();
    const [row] = await db.select().from(integrations).where(eq(integrations.slug, slug));
    await db
      .update(integrations)
      .set({ enabled: true, status: "connected", lastError: null, lastCheckedAt: new Date(), config: { ...(row?.config ?? {}), connectedAccount: account } })
      .where(eq(integrations.slug, slug));
    await audit({ actorType: "user", actorId: user.id, action: "integration.connected", entityType: "integration", entityId: slug, details: { account } });
    return back(`connected=${slug}`);
  } catch (e) {
    return back(`oauth_error=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
  }
}
