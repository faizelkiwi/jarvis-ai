import { NextResponse } from "next/server";
import { z } from "zod";
import { changePassword, SESSION_COOKIE } from "@/server/auth/service";
import { json, route } from "@/server/http";

export const POST = route({ role: "viewer", limit: [10, 900] }, async ({ req, user }) => {
  const v = z.object({ current: z.string().min(1), next: z.string() }).parse(await json(req));
  await changePassword(user.id, v.current, v.next);
  const res = NextResponse.json({ ok: true, message: "Password changed. Please sign in again." });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
