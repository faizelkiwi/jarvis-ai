import { audit } from "@/server/audit/log";
import { HttpError, route } from "@/server/http";
import { setSetting } from "@/server/settings/service";
import { cloneVoice, VoiceNotConfiguredError } from "@/server/voice/elevenlabs";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TOTAL = 4 * 1024 * 1024; // hosting request limit is ~4.5 MB

/** Creates a personal voice from the owner's recordings and makes it JARVIS's voice. */
export const POST = route({ role: "admin", limit: [5, 3600] }, async ({ req, user }) => {
  const form = await req.formData();
  if (form.get("consent") !== "yes") throw new HttpError(400, "Please confirm the recording is your own voice (or that you have the speaker's permission).");
  const name = String(form.get("name") || `${user.name}'s voice`).slice(0, 80);
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new HttpError(400, "Add at least one recording.");
  if (files.length > 5) throw new HttpError(400, "Use at most 5 recordings.");
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL) throw new HttpError(413, "Recordings are too large (max 4 MB total). Use 1–3 minutes of audio, or compress to MP3.");
  for (const f of files) if (!/^(audio|video)\//.test(f.type) && !/\.(mp3|wav|m4a|webm|ogg|aac|mp4)$/i.test(f.name)) throw new HttpError(415, `"${f.name}" is not an audio file.`);
  try {
    const { id } = await cloneVoice(name, files);
    await setSetting("voice.settings", { engine: "elevenlabs", elevenVoiceId: id, elevenVoiceName: name }, user.id);
    await audit({ actorType: "user", actorId: user.id, action: "voice.cloned", entityType: "voice", entityId: id, details: { name, files: files.length } });
    return { voiceId: id, name };
  } catch (e) {
    if (e instanceof VoiceNotConfiguredError) throw new HttpError(409, e.message);
    throw new HttpError(502, (e as Error).message);
  }
});
