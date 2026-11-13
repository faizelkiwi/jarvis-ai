import { HttpError, route } from "@/server/http";
import { listVoices, VoiceNotConfiguredError } from "@/server/voice/elevenlabs";

export const GET = route({ role: "operator" }, async () => {
  try {
    return { voices: await listVoices() };
  } catch (e) {
    if (e instanceof VoiceNotConfiguredError) throw new HttpError(409, e.message);
    throw new HttpError(502, (e as Error).message);
  }
});
