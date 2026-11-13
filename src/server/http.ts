import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AuthError, getSessionUser, hasRole, SESSION_COOKIE, type SessionUser } from "./auth/service";
import { ApprovalDecisionError } from "./approvals/service";
import type { UserRole } from "./db/schema";
import { rateLimit } from "./security/rate-limit";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return getSessionUser(store.get(SESSION_COOKIE)?.value);
}

/** For server components: redirect to login when unauthenticated. */
export async function requireUser(min: UserRole = "viewer"): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!hasRole(u, min)) redirect("/dashboard?denied=1");
  return u;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local";
}

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

type Ctx<P> = { req: NextRequest; params: P; user: SessionUser };
type Opts = { role?: UserRole; public?: boolean; limit?: [number, number] };

/**
 * Wraps a route handler with authentication, role checks, CSRF origin checks,
 * rate limiting and consistent, non-leaky error responses.
 */
export function route<P = Record<string, string>>(opts: Opts, handler: (ctx: Ctx<P>) => Promise<unknown>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (mutating && !sameOrigin(req)) throw new HttpError(403, "Cross-origin request blocked");
      const ip = await clientIp();
      if (opts.limit) {
        const [n, win] = opts.limit;
        if (!(await rateLimit(`${req.nextUrl.pathname}:${ip}`, n, win))) throw new HttpError(429, "Too many requests. Please slow down.");
      }
      let user = null as SessionUser | null;
      if (!opts.public) {
        user = await currentUser();
        if (!user) throw new HttpError(401, "Not signed in");
        if (mutating && !hasRole(user, opts.role ?? "operator")) throw new HttpError(403, "Your role does not allow this action");
        if (!mutating && opts.role && !hasRole(user, opts.role)) throw new HttpError(403, "Your role does not allow this");
      }
      const params = (await context.params) ?? ({} as P);
      const result = await handler({ req, params, user: user as SessionUser });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ApprovalDecisionError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError)
        return NextResponse.json(
          { error: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") },
          { status: 400 },
        );
      if (e && typeof e === "object" && "digest" in e) throw e; // Next.js redirects / notFound
      console.error("[api]", req.method, req.nextUrl.pathname, e);
      return NextResponse.json({ error: "Internal error. The incident was logged." }, { status: 500 });
    }
  };
}

export async function json<T = unknown>(req: NextRequest): Promise<T> {
  const text = await req.text();
  if (text.length > 1_000_000) throw new HttpError(413, "Request body too large");
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function notFound(what = "Resource"): never {
  throw new HttpError(404, `${what} not found`);
}
