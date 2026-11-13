import { describe, it, expect, afterEach, vi } from "vitest";
import { saveIntegration } from "@/server/integrations/service";
import { synthesize, listVoices, VoiceNotConfiguredError } from "@/server/voice/elevenlabs";
import { getSetting } from "@/server/settings/service";

afterEach(() => vi.unstubAllGlobals());

describe("premium voice (ElevenLabs)", () => {
  it("reports not configured without a key", async () => {
    await expect(synthesize("Hello")).rejects.toBeInstanceOf(VoiceNotConfiguredError);
  });

  it("defaults to a British male butler voice", async () => {
    const v = await getSetting("voice.settings");
    expect(v.elevenVoiceName).toMatch(/British/);
    expect(v.engine).toBe("auto");
  });

  it("sends the configured voice, model and key; returns audio", async () => {
    await saveIntegration("elevenlabs", { enabled: true, values: { apiKey: "sk_test_123" } }, "00000000-0000-0000-0000-000000000000");
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } });
    });
    const audio = await synthesize("Good morning.");
    expect(new Uint8Array(audio)).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls[0].url).toContain("/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb");
    expect((calls[0].init.headers as Record<string, string>)["xi-api-key"]).toBe("sk_test_123");
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ text: "Good morning.", model_id: "eleven_turbo_v2_5" });
  });

  it("explains plan and credit errors in plain language", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ detail: { status: "quota_exceeded", message: "You have 0 credits remaining" } }), { status: 401 }));
    await expect(synthesize("Hi")).rejects.toThrow(/credits/);
  });

  it("lists voices with accent and gender", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ voices: [{ voice_id: "v1", name: "George", category: "premade", labels: { accent: "british", gender: "male" } }] }), { status: 200 }),
    );
    expect(await listVoices()).toEqual([{ id: "v1", name: "George", category: "premade", accent: "british", gender: "male", description: null }]);
  });
});
