import { NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE } from "@/server/auth/service";
import { route } from "@/server/http";

export const POST = route({ public: true }, async ({ req }) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
