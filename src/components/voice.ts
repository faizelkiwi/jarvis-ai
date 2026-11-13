"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceSettings = { enabled: boolean; speakResponses: boolean; voiceName: string; rate: number; pitch: number; language: string };

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
    (markdown: string, force = false) => {
      if (!("speechSynthesis" in window) || (!settings.speakResponses && !force)) return;
      const text = markdown
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[#*_>`|-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      // Keep it short enough to listen to; stop at a sentence boundary.
      let spoken = text.slice(0, 900);
      if (text.length > 900) spoken = spoken.slice(0, Math.max(spoken.lastIndexOf(". "), 400) + 1) + " The full answer is on screen.";
      if (!spoken) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(spoken);
      u.rate = settings.rate;
      u.pitch = settings.pitch;
      u.lang = settings.language;
      const voice = window.speechSynthesis.getVoices().find((v) => v.name === settings.voiceName);
      if (voice) u.voice = voice;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [settings],
  );
  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return { supported, listening, speaking, interim, error, start, stop, speak, stopSpeaking };
}
