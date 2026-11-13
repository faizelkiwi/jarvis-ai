import { z } from "zod";
import { HttpError, json, route } from "@/server/http";
import { synthesize, VoiceNotConfiguredError } from "@/server/voice/elevenlabs";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Premium text-to-speech. 409 = not configured (client falls back to the device voice). */
export const POST = route({ role: "viewer", limit: [60, 60] }, async ({ req }) => {
  const v = z.object({ text: z.string().trim().min(1).max(2500), voiceId: z.string().max(100).optional() }).parse(await json(req));
  try {
    const audio = await synthesize(v.text, v.voiceId);
    return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof VoiceNotConfiguredError) throw new HttpError(409, e.message);
    throw new HttpError(502, (e as Error).message);
  }
});
