import bcrypt from "bcryptjs";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { sessions, users, type UserRole } from "../db/schema";
import { audit } from "../audit/log";
import { getSetting } from "../settings/service";
import { randomToken, sha256 } from "../security/crypto";

export const SESSION_COOKIE = "jarvis_session";
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200)
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), "Use upper- and lower-case letters and a number");

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= bcrypt.hash("timing-equaliser", 12));

export type SessionUser = { id: string; email: string; name: string; role: UserRole };

export class AuthError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function userCount() {
  const db = await getDb();
  const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from users`)).rows;
  return Number(n);
}

export async function registerUser(input: z.infer<typeof registerSchema>) {
  const v = registerSchema.parse(input);
  const db = await getDb();
  const first = (await userCount()) === 0;
  if (!first) {
    const s = await getSetting("auth.settings");
    if (!s.allowRegistration) throw new AuthError("Registration is closed. Ask the owner to enable it or create your account.", 403);
  }
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, v.email));
  if (exists) throw new AuthError("An account with this email already exists", 409);
  const passwordHash = await bcrypt.hash(v.password, 12);
  const [user] = await db
    .insert(users)
    .values({ name: v.name, email: v.email, passwordHash, role: first ? "owner" : "viewer" })
    .returning();
  await audit({ actorType: "user", actorId: user.id, action: "user.registered", entityType: "user", entityId: user.id, details: { role: user.role } });
  return { id: user.id, email: user.email, name: user.name, role: user.role } satisfies SessionUser;
}

export async function verifyLogin(input: z.infer<typeof loginSchema>, meta: { ip?: string | null }) {
  const v = loginSchema.parse(input);
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, v.email));
  // Constant-ish work even for unknown users.
  const hash = user?.passwordHash ?? (await dummyHash());
  const ok = await bcrypt.compare(v.password, hash);
  if (!user) throw new AuthError("Invalid email or password", 401);
  if (user.lockedUntil && user.lockedUntil > new Date())
    throw new AuthError(`Account temporarily locked after repeated failed logins. Try again after ${user.lockedUntil.toISOString().slice(11, 16)} UTC.`, 423);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await db
      .update(users)
      .set({ failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
      .where(eq(users.id, user.id));
    await audit({ actorType: "system", action: "auth.login_failed", entityType: "user", entityId: user.id, details: { ip: meta.ip ?? null, failed } });
    throw new AuthError("Invalid email or password", 401);
  }
  await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await audit({ actorType: "user", actorId: user.id, action: "auth.login", entityType: "user", entityId: user.id, details: { ip: meta.ip ?? null } });
  return { id: user.id, email: user.email, name: user.name, role: user.role } satisfies SessionUser;
}

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const s = await getSetting("auth.settings");
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + s.sessionDays * 86400_000);
  const db = await getDb();
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null });
  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, expiresAt: sessions.expiresAt, sid: sessions.id })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export async function destroySession(token: string) {
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function destroyAllSessions(userId: string) {
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function changePassword(userId: string, current: string, next: string) {
  passwordSchema.parse(next);
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !(await bcrypt.compare(current, u.passwordHash))) throw new AuthError("Current password is incorrect", 401);
  await db.update(users).set({ passwordHash: await bcrypt.hash(next, 12) }).where(eq(users.id, userId));
  await destroyAllSessions(userId);
  await audit({ actorType: "user", actorId: userId, action: "auth.password_changed", entityType: "user", entityId: userId });
}

/** Role hierarchy: owner > admin > operator > viewer. */
const RANK: Record<UserRole, number> = { viewer: 0, operator: 1, admin: 2, owner: 3 };
export function hasRole(user: Pick<SessionUser, "role">, min: UserRole) {
  return RANK[user.role] >= RANK[min];
}
