import { desc } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { commands } from "@/server/db/schema";
import { requireUser } from "@/server/http";
import { getSetting } from "@/server/settings/service";
import { CommandCentre } from "./ui";

export default async function CommandPage({ searchParams }: { searchParams: Promise<{ id?: string; voice?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const db = await getDb();
  const history = await db
    .select({ id: commands.id, input: commands.input, status: commands.status, channel: commands.channel, createdAt: commands.createdAt })
    .from(commands)
    .orderBy(desc(commands.createdAt))
    .limit(40);
  const voice = await getSetting("voice.settings");
  return <CommandCentre history={JSON.parse(JSON.stringify(history))} voice={voice} initialId={sp.id ?? history[0]?.id ?? null} autoSpeak={sp.voice === "1"} />;
}
