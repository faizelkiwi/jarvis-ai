import { requireUser } from "@/server/http";
import { getSetting } from "@/server/settings/service";
import { VoiceMode } from "./ui";

export default async function VoicePage() {
  const user = await requireUser();
  const voice = await getSetting("voice.settings");
  return <VoiceMode voice={voice} firstName={user.name.split(" ")[0]} canCommand={user.role !== "viewer"} />;
}
