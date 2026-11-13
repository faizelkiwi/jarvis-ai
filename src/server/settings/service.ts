import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { settings } from "../db/schema";
import { DEFAULT_SETTINGS, settingSchemas, type SettingKey, type SettingValue } from "./defaults";

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  const parsed = settingSchemas[key].safeParse({ ...(DEFAULT_SETTINGS[key] as object), ...((row?.value as object) ?? {}) });
  return (parsed.success ? parsed.data : DEFAULT_SETTINGS[key]) as SettingValue<K>;
}

export async function setSetting<K extends SettingKey>(key: K, value: unknown, userId?: string): Promise<SettingValue<K>> {
  const current = await getSetting(key);
  const merged = settingSchemas[key].parse({ ...(current as object), ...(value as object) });
  const db = await getDb();
  await db
    .insert(settings)
    .values({ key, value: merged, updatedBy: userId ?? null })
    .onConflictDoUpdate({ target: settings.key, set: { value: merged, updatedBy: userId ?? null, updatedAt: new Date() } });
  return merged as SettingValue<K>;
}

/** Raw (unvalidated) runtime keys such as worker heartbeat. */
export async function getRuntimeValue<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, `runtime.${key}`));
  return (row?.value as T) ?? null;
}

export async function setRuntimeValue(key: string, value: unknown) {
  const db = await getDb();
  await db
    .insert(settings)
    .values({ key: `runtime.${key}`, value: value as object })
    .onConflictDoUpdate({ target: settings.key, set: { value: value as object, updatedAt: new Date() } });
}
