import { NextResponse } from "next/server";
import { createSession, loginSchema, SESSION_COOKIE, verifyLogin } from "@/server/auth/service";
import { clientIp, json, route } from "@/server/http";

export const POST = route({ public: true, limit: [20, 900] }, async ({ req }) => {
  const ip = await clientIp();
  const user = await verifyLogin(loginSchema.parse(await json(req)), { ip });
  const { token, expiresAt } = await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") });
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires: expiresAt, path: "/" });
  return res;
});
