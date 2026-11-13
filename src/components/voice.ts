"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceSettings = {
  enabled: boolean;
  speakResponses: boolean;
  voiceName: string;
  rate: number;
  pitch: number;
  language: string;
  engine?: "auto" | "elevenlabs" | "browser";
  elevenVoiceId?: string;
};

// A short silent WAV, generated in code, used to unlock audio playback inside a tap (required on iOS).
function silentWav(): string {
  const samples = 800; // 0.1 s at 8 kHz, 8-bit mono
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const str = (o: number, t: string) => [...t].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  str(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44); // 8-bit silence
  let bin = "";
  bytes.forEach((x) => (bin += String.fromCharCode(x)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}
let sharedAudio: HTMLAudioElement | null = null;
function audioEl() {
  if (typeof window === "undefined") return null;
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.setAttribute("playsinline", "true");
  }
  return sharedAudio;
}
let premiumUnavailable = false;

/** Picks the best British male voice available on this device (butler default). */
export function pickButlerVoice(voices: SpeechSynthesisVoice[], preferredName?: string) {
  if (preferredName) {
    const exact = voices.find((v) => v.name === preferredName);
    if (exact) return exact;
  }
  const gb = voices.filter((v) => /en[-_]GB/i.test(v.lang));
  const male = /daniel|arthur|george|oliver|ryan|thomas|malcolm|harry|james|william|male|gbb|gbd|rjs/i;
  const female = /female|serena|kate|stephanie|martha|fiona|susan|libby|sonia|hazel|emily|amy/i;
  return (
    gb.find((v) => male.test(v.name) && !female.test(v.name)) ??
    voices.find((v) => /google uk english male/i.test(v.name)) ??
    gb.find((v) => !female.test(v.name)) ??
    gb[0] ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

/** Mobile browsers only allow speech that was unlocked by a user tap; call this inside a tap handler. */
export function primeSpeech() {
  try {
    const a = audioEl();
    if (a && a.paused) {
      a.src = silentWav();
      a.play().catch(() => {});
    }
  } catch {}
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.getVoices();
  } catch {}
}

const REPLIES_KEY = "jarvis-voice-replies";
export function voiceRepliesEnabled() {
  try {
    return localStorage.getItem(REPLIES_KEY) !== "off";
  } catch {
    return true;
  }
}
export function setVoiceReplies(on: boolean) {
  try {
    localStorage.setItem(REPLIES_KEY, on ? "on" : "off");
  } catch {}
}

function recognitionCtor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Browser speech-to-text + text-to-speech. Audio is processed by the browser's speech service. */
export function useVoice(settings: VoiceSettings, onFinal: (text: string) => void) {
  const [supported, setSupported] = useState({ stt: false, tts: false });
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recRef = useRef<Rec | null>(null);
  const speakToken = useRef(0);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  useEffect(() => {
    setSupported({ stt: !!recognitionCtor(), tts: typeof window !== "undefined" && "speechSynthesis" in window });
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || !settings.enabled) return;
    window.speechSynthesis?.cancel();
    primeSpeech();
    setError("");
    const rec = new Ctor();
    rec.lang = settings.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else text += r[0].transcript;
      }
      setInterim(finalText + text);
    };
    rec.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone permission denied" : e.error === "no-speech" ? "No speech detected" : `Voice error: ${e.error}`);
    rec.onend = () => {
      setListening(false);
      setInterim("");
      if (finalText.trim()) finalRef.current(finalText.trim());
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [settings.enabled, settings.language]);

  const stop = useCallback(() => recRef.current?.stop(), []);

  const speak = useCallback(
    (markdown: string, force = false, onDone?: () => void) => {
      if (!("speechSynthesis" in window) || (!settings.speakResponses && !force)) {
        onDone?.();
        return;
      }
      const text = markdown
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[#*_>`|~]+/g, " ")
        .replace(/^\s*[-•]\s+/gm, "")
        .replace(/\s+/g, " ")
        .trim();
      // Keep it listenable; stop at a sentence boundary.
      let spoken = text.slice(0, 1000);
      if (text.length > 1000) spoken = spoken.slice(0, Math.max(spoken.lastIndexOf(". "), 400) + 1) + " The full details are on screen.";
      if (!spoken) {
        onDone?.();
        return;
      }
      window.speechSynthesis?.cancel();
      const a = audioEl();
      a?.pause();
      const myToken = ++speakToken.current;
      setSpeaking(true);
      const finish = () => {
        if (myToken !== speakToken.current) return;
        setSpeaking(false);
        onDone?.();
      };

      const browserSpeak = () => {
        if (myToken !== speakToken.current) return;
        if (!("speechSynthesis" in window)) return finish();
        // Mobile browsers cut long utterances off, so speak sentence by sentence.
        const chunks: string[] = [];
        for (const sentence of spoken.match(/[^.!?]+[.!?]*\s*/g) ?? [spoken]) {
          const last = chunks[chunks.length - 1];
          if (last && (last + sentence).length < 220) chunks[chunks.length - 1] = last + sentence;
          else chunks.push(sentence);
        }
        const voice = pickButlerVoice(window.speechSynthesis.getVoices(), settings.voiceName);
        chunks.forEach((c, i) => {
          const u = new SpeechSynthesisUtterance(c.trim());
          u.rate = settings.rate;
          u.pitch = settings.pitch;
          u.lang = voice?.lang ?? "en-GB";
          if (voice) u.voice = voice;
          if (i === chunks.length - 1) {
            u.onend = finish;
            u.onerror = finish;
          }
          window.speechSynthesis.speak(u);
        });
      };

      const usePremium = settings.engine !== "browser" && !premiumUnavailable && a;
      if (!usePremium) return browserSpeak();
      fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ text: spoken }),
      })
        .then(async (res) => {
          if (res.status === 409) {
            premiumUnavailable = true; // not connected: use the device voice from now on
            throw new Error("not configured");
          }
          if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          if (myToken !== speakToken.current) return;
          const url = URL.createObjectURL(blob);
          a.onended = () => {
            URL.revokeObjectURL(url);
            finish();
          };
          a.onerror = () => {
            URL.revokeObjectURL(url);
            browserSpeak();
          };
          a.src = url;
          return a.play().catch(() => browserSpeak());
        })
        .catch((e) => {
          if ((e as Error).message !== "not configured") console.warn("[voice] premium voice failed, using device voice:", (e as Error).message);
          browserSpeak();
        });
    },
    [settings],
  );
  const stopSpeaking = useCallback(() => {
    speakToken.current++;
    audioEl()?.pause();
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return { supported, listening, speaking, interim, error, start, stop, speak, stopSpeaking };
}
