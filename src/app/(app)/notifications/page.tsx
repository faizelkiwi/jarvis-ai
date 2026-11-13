import { desc } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { requireUser } from "@/server/http";
import { NotificationsUI } from "./ui";

export default async function NotificationsPage() {
  await requireUser();
  const db = await getDb();
  const rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(200);
  return <NotificationsUI rows={JSON.parse(JSON.stringify(rows))} />;
}
