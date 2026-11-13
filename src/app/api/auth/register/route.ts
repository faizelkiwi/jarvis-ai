import { NextResponse } from "next/server";
import { createSession, registerSchema, registerUser, SESSION_COOKIE } from "@/server/auth/service";
import { clientIp, json, route } from "@/server/http";

export const POST = route({ public: true, limit: [10, 3600] }, async ({ req }) => {
  const user = await registerUser(registerSchema.parse(await json(req)));
  const { token, expiresAt } = await createSession(user.id, { ip: await clientIp(), userAgent: req.headers.get("user-agent") });
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires: expiresAt, path: "/" });
  return res;
});
