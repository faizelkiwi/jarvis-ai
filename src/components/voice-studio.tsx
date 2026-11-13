"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload } from "lucide-react";
import { Badge, Button, ErrorText, Field, Input, Select } from "@/components/ui";
import { api, toast } from "@/lib/api";
import { useVoice, type VoiceSettings } from "@/components/voice";

type V = { id: string; name: string; category: string; accent: string | null; gender: string | null; description: string | null };

const SCRIPT =
  "Good morning. This is my voice, recorded for my personal assistant. I'm reading this passage clearly and at a natural pace, the way I normally speak. Today we'll review the business priorities, check the approvals waiting for me, and plan the content for the week ahead. When the numbers come in, I'd like a short summary first and the details afterwards. Thank you, that will be all for now.";

/** Premium voice picker + "create my voice" (record or upload) for ElevenLabs. */
export function VoiceStudio({ settings, onVoiceChosen }: { settings: VoiceSettings & { elevenVoiceId?: string; elevenVoiceName?: string }; onVoiceChosen: (id: string, name: string) => void }) {
  const [voices, setVoices] = useState<V[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not_connected" | "error">("loading");
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState("My voice");
  const [busy, setBusy] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const v = useVoice({ ...settings, engine: "elevenlabs" }, () => {});

  useEffect(() => {
    api<{ voices: V[] }>("/api/voice/voices")
      .then((r) => {
        setVoices(r.voices);
        setState("ready");
      })
      .catch((e) => {
        setState(/not connected/i.test(e.message) ? "not_connected" : "error");
        setError(e.message);
      });
  }, []);

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 96000 } : undefined);
      const parts: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && parts.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(parts, { type: mr.mimeType || "audio/webm" });
        const ext = (mr.mimeType || "").includes("mp4") ? "m4a" : "webm";
        setFiles((f) => [...f, new File([blob], `recording-${f.length + 1}.${ext}`, { type: blob.type })].slice(0, 5));
      };
      mr.start(1000);
      rec.current = mr;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast("Microphone access was blocked. Allow it in your browser settings.", "error");
    }
  }
  function stopRec() {
    rec.current?.stop();
    setRecording(false);
    if (timer.current) clearInterval(timer.current);
  }
  async function createVoice() {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("consent", consent ? "yes" : "no");
      files.forEach((f) => form.append("files", f));
      const r = await api<{ voiceId: string; name: string }>("/api/voice/clone", { form });
      toast(`"${r.name}" created — JARVIS now speaks with this voice`);
      onVoiceChosen(r.voiceId, r.name);
      setFiles([]);
      setVoices((x) => (x ? [{ id: r.voiceId, name: r.name, category: "cloned", accent: null, gender: null, description: null }, ...x] : x));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <p className="text-sm text-muted">Checking premium voice…</p>;
  if (state === "not_connected")
    return (
      <div className="rounded-lg border border-line p-3 text-sm">
        <p className="font-medium">Premium voices are not connected</p>
        <p className="mt-1 text-muted">
          JARVIS is using the best British male voice built into this device. For a lifelike butler voice — or your own cloned voice — connect ElevenLabs in{" "}
          <a href="/integrations" className="text-accent underline">Integrations</a>.
        </p>
      </div>
    );
  const british = (voices ?? []).filter((x) => /brit|english/i.test(x.accent ?? "") && /male/i.test(x.gender ?? "") && !/female/i.test(x.gender ?? ""));
  const mine = (voices ?? []).filter((x) => x.category === "cloned" || x.category === "generated" || x.category === "professional");
  const totalMb = files.reduce((n, f) => n + f.size, 0) / 1024 / 1024;
  return (
    <div className="space-y-4">
      <ErrorText>{state === "error" ? error : ""}</ErrorText>
      {voices && (
        <Field label="JARVIS voice (ElevenLabs)" hint={<>Current: <b>{settings.elevenVoiceName}</b></>}>
          <div className="flex gap-2">
            <Select value={settings.elevenVoiceId} onChange={(e) => { const x = voices.find((y) => y.id === e.target.value); if (x) onVoiceChosen(x.id, x.name); }}>
              {mine.length > 0 && <optgroup label="Your voices">{mine.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>}
              {british.length > 0 && <optgroup label="British male">{british.map((x) => <option key={x.id} value={x.id}>{x.name}{x.description ? ` — ${x.description}` : ""}</option>)}</optgroup>}
              <optgroup label="All voices">{voices.map((x) => <option key={x.id} value={x.id}>{x.name}{x.accent ? ` (${x.accent}${x.gender ? `, ${x.gender}` : ""})` : ""}</option>)}</optgroup>
              {!voices.some((x) => x.id === settings.elevenVoiceId) && <option value={settings.elevenVoiceId}>{settings.elevenVoiceName}</option>}
            </Select>
            <Button type="button" onClick={() => v.speak("Good morning. I have reviewed your priorities for today, and everything is in order. Shall I begin with the approvals?", true)} loading={v.speaking}>Test</Button>
          </div>
        </Field>
      )}

      <div className="rounded-lg border border-line p-3 space-y-3">
        <div className="flex items-center gap-2"><h4 className="text-sm font-semibold">Create your own voice</h4><Badge tone="warn">ElevenLabs Starter plan or higher</Badge></div>
        <p className="text-xs text-muted">Record or upload 1–3 minutes of clear speech in a quiet room. Read the passage below naturally. Max 4 MB in total.</p>
        <p className="rounded-md border border-line bg-bg-2/50 p-2 text-xs italic">{SCRIPT}</p>
        <div className="flex flex-wrap items-center gap-2">
          {!recording ? (
            <Button type="button" onClick={startRec} disabled={files.length >= 5}><Mic className="size-4" />Record</Button>
          ) : (
            <Button type="button" variant="danger" onClick={stopRec}><Square className="size-4" />Stop ({Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")})</Button>
          )}
          <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-accent-soft px-4 text-sm">
            <Upload className="size-4" />Upload audio
            <input type="file" accept="audio/*,.mp3,.wav,.m4a" multiple className="hidden" onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])].slice(0, 5))} />
          </label>
        </div>
        {files.length > 0 && (
          <ul className="space-y-1 text-xs">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <audio controls src={URL.createObjectURL(f)} className="h-8 max-w-[220px]" />
                <span className="truncate">{f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <button type="button" className="text-bad" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>remove</button>
              </li>
            ))}
            <li className={totalMb > 4 ? "text-bad" : "text-muted"}>Total {totalMb.toFixed(1)} MB of 4 MB</li>
          </ul>
        )}
        <Field label="Voice name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
          This is my own voice, or I have the speaker&apos;s explicit permission to clone it. I understand the recordings are sent to ElevenLabs.
        </label>
        <ErrorText>{state === "ready" ? error : ""}</ErrorText>
        <Button type="button" variant="primary" onClick={createVoice} loading={busy} disabled={!files.length || !consent || totalMb > 4 || recording}>Create my voice</Button>
      </div>
    </div>
  );
}
