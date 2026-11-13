import { audit } from "@/server/audit/log";
import { settingSchemas, type SettingKey } from "@/server/settings/defaults";
import { getSetting, setSetting } from "@/server/settings/service";
import { INTERNAL_ACTIONS } from "@/server/approvals/catalog";
import { HttpError, json, notFound, route } from "@/server/http";

const ADMIN_KEYS: SettingKey[] = ["ai.defaults", "approvals.rules", "auth.settings", "memory.settings", "backup.settings"];

function key(k: string): SettingKey {
  if (!(k in settingSchemas)) notFound("Setting");
  return k as SettingKey;
}

export const GET = route<{ key: string }>({}, async ({ params }) => ({ value: await getSetting(key(params.key)) }));

export const PUT = route<{ key: string }>({ role: "operator" }, async ({ req, params, user }) => {
  const k = key(params.key);
  if (ADMIN_KEYS.includes(k) && !["owner", "admin"].includes(user.role)) throw new HttpError(403, "Only owners and admins can change this setting");
  const body = await json<Record<string, unknown>>(req);
  if (k === "approvals.rules") {
    // Only internal low-risk actions may be configured for automatic execution.
    const auto = (body.autoApprove ?? {}) as Record<string, unknown>;
    for (const a of Object.keys(auto)) if (!(a in INTERNAL_ACTIONS)) throw new HttpError(400, `"${a}" always requires human approval and cannot be automated`);
  }
  const before = await getSetting(k);
  const value = await setSetting(k, body, user.id);
  await audit({ actorType: "user", actorId: user.id, action: "settings.updated", entityType: "setting", entityId: k, details: { before, after: value } });
  return { value };
});
