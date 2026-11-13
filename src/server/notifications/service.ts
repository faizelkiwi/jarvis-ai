import { getDb } from "../db/client";
import { notifications } from "../db/schema";
import { getSetting } from "../settings/service";

type Kind = "approval" | "failure" | "completion" | "system";

export async function notify(
  kind: Kind,
  n: { level?: "info" | "success" | "warning" | "error"; title: string; body?: string; link?: string },
) {
  const prefs = await getSetting("notifications.settings");
  if (kind === "approval" && !prefs.approvalRequests) return;
  if (kind === "failure" && !prefs.taskFailures) return;
  if (kind === "completion" && !prefs.taskCompletions) return;
  const db = await getDb();
  await db.insert(notifications).values({
    level: n.level ?? "info",
    title: n.title.slice(0, 300),
    body: (n.body ?? "").slice(0, 2000),
    link: n.link ?? null,
  });
}
