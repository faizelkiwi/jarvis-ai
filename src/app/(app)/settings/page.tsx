import { requireUser } from "@/server/http";
import { getSetting } from "@/server/settings/service";
import { INTERNAL_ACTIONS, CONSEQUENTIAL_ACTIONS } from "@/server/approvals/catalog";
import { healthData } from "@/server/queries";
import { SettingsUI } from "./ui";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const [business, ai, rules, memory, voice, notif, auth, backup, health] = await Promise.all([
    getSetting("business.profile"),
    getSetting("ai.defaults"),
    getSetting("approvals.rules"),
    getSetting("memory.settings"),
    getSetting("voice.settings"),
    getSetting("notifications.settings"),
    getSetting("auth.settings"),
    getSetting("backup.settings"),
    healthData(),
  ]);
  return (
    <SettingsUI
      tab={(await searchParams).tab ?? "business"}
      user={user}
      settings={{ business, ai, rules, memory, voice, notif, auth, backup }}
      internalActions={Object.entries(INTERNAL_ACTIONS).map(([k, v]) => ({ key: k, ...v }))}
      consequential={Object.entries(CONSEQUENTIAL_ACTIONS).map(([k, v]) => ({ key: k, label: v.label, risk: v.risk }))}
      health={JSON.parse(JSON.stringify(health))}
    />
  );
}
