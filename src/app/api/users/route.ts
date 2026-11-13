import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { route } from "@/server/http";

export const GET = route({ role: "admin" }, async () => {
  const db = await getDb();
  return {
    users: await db.select({ id: users.id, email: users.email, name: users.name, role: users.role, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt }).from(users),
  };
});
