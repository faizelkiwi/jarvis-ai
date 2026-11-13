import { eq, sql } from "drizzle-orm";
import { Shell } from "@/components/shell";
import { getDb } from "@/server/db/client";
import { approvals, notifications } from "@/server/db/schema";
import { requireUser } from "@/server/http";
import { isDemoMode } from "@/server/ai";
import { getSetting } from "@/server/settings/service";
import { getIntegrationSecrets } from "@/server/integrations/service";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await getDb();
  const [[a], [n]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(approvals).where(eq(approvals.status, "pending")),
    db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(eq(notifications.read, false)),
  ]);
  const ai = await getSetting("ai.defaults");
  const aiReady = isDemoMode() || !!(await getIntegrationSecrets(ai.provider)).apiKey;
  return (
    <Shell user={user} counts={{ approvals: a.n, notifications: n.n }} demo={isDemoMode()} aiReady={aiReady}>
      {children}
    </Shell>
  );
}
