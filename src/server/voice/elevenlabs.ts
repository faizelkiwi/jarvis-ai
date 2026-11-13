import { getIntegrationSecrets } from "../integrations/service";
import { getSetting } from "../settings/service";

const API = "https://api.elevenlabs.io/v1";

export class VoiceNotConfiguredError extends Error {
  constructor() {
    super("Premium voice is not connected. Add an ElevenLabs API key in Integrations.");
  }
}

async function apiKey() {
  const key = (await getIntegrationSecrets("elevenlabs")).apiKey;
  if (!key) throw new VoiceNotConfiguredError();
  return key;
}

async function failure(res: Response, what: string) {
  const body = await res.text().catch(() => "");
  let detail = body.slice(0, 300);
  try {
    const j = JSON.parse(body);
    detail = j?.detail?.message ?? j?.detail?.status ?? (typeof j?.detail === "string" ? j.detail : detail);
  } catch {}
  const hint =
    res.status === 401 ? " (API key rejected)" : res.status === 402 || /quota|credits/i.test(detail) ? " (out of ElevenLabs credits)" : res.status === 403 ? " (your ElevenLabs plan does not include this — voice cloning needs Starter or higher)" : "";
  return new Error(`ElevenLabs ${what} failed: HTTP ${res.status}${hint}${detail ? ` — ${detail}` : ""}`);
}

/** Text → MP3 audio using the configured voice. */
export async function synthesize(text: string, voiceId?: string): Promise<ArrayBuffer> {
  const key = await apiKey();
  const v = await getSetting("voice.settings");
  const id = voiceId || v.elevenVoiceId;
  const res = await fetch(`${API}/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: v.elevenModel || "eleven_turbo_v2_5",
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw await failure(res, "speech");
  return res.arrayBuffer();
}

export type ElevenVoice = { id: string; name: string; category: string; accent: string | null; gender: string | null; description: string | null };

export async function listVoices(): Promise<ElevenVoice[]> {
  const key = await apiKey();
  const res = await fetch(`${API}/voices`, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw await failure(res, "voice list");
  const data = (await res.json()) as { voices: { voice_id: string; name: string; category?: string; labels?: Record<string, string>; description?: string }[] };
  return data.voices.map((x) => ({
    id: x.voice_id,
    name: x.name,
    category: x.category ?? "premade",
    accent: x.labels?.accent ?? null,
    gender: x.labels?.gender ?? null,
    description: x.labels?.description ?? x.description ?? null,
  }));
}

/** Instant voice clone from the owner's own recordings. */
export async function cloneVoice(name: string, files: File[]): Promise<{ id: string }> {
  const key = await apiKey();
  const form = new FormData();
  form.append("name", name);
  form.append("description", "Created from JARVIS by the account owner");
  form.append("remove_background_noise", "true");
  for (const f of files) form.append("files", f, f.name);
  const res = await fetch(`${API}/voices/add`, { method: "POST", headers: { "xi-api-key": key }, body: form, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw await failure(res, "voice cloning");
  const data = (await res.json()) as { voice_id: string };
  return { id: data.voice_id };
}
