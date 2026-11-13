import { desc } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { transactions } from "@/server/db/schema";
import { analyticsData } from "@/server/queries";
import { getSetting } from "@/server/settings/service";
import { requireUser } from "@/server/http";
import { AnalyticsUI } from "./ui";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requireUser();
  const days = [7, 30, 90, 365].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  const db = await getDb();
  const [data, tx, profile] = await Promise.all([analyticsData(days), db.select().from(transactions).orderBy(desc(transactions.date)).limit(500), getSetting("business.profile")]);
  return <AnalyticsUI data={JSON.parse(JSON.stringify(data))} transactions={JSON.parse(JSON.stringify(tx))} currency={profile.currency} canEdit={user.role !== "viewer"} canDelete={["owner", "admin"].includes(user.role)} />;
}
