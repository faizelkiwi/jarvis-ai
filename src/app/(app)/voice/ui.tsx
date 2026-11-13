"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2 } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { primeSpeech, useVoice, type VoiceSettings } from "@/components/voice";
import { api } from "@/lib/api";

type Phase = "idle" | "listening" | "thinking" | "speaking" | "error";
type Cmd = { command: { id: string; status: string; response: string | null; error: string | null; plan: { understanding?: string } | null }; tasks: { agentName: string | null }[] };

const LABEL: Record<Phase, string> = {
  idle: "Tap to talk",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Tap to try again",
};

function isIOS() {
  return typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function VoiceMode({ voice, firstName, canCommand }: { voice: VoiceSettings; firstName: string; canCommand: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [commandId, setCommandId] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [ios, setIos] = useState(false);
  const run = useRef(0);
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;

  useEffect(() => {
    setIos(isIOS());
    try {
      setHandsFree(!isIOS() && localStorage.getItem("jarvis-handsfree") !== "off");
    } catch {}
  }, []);

  const startRef = useRef<() => void>(() => {});
  const afterSpeaking = useCallback(() => {
    setPhase("idle");
    // Android/desktop: keep the conversation going. iOS requires a tap to listen.
    if (handsFreeRef.current && !isIOS()) setTimeout(() => startRef.current(), 400);
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const my = ++run.current;
      setHeard(text);
      setReply("");
      setShowText(false);
      setPhase("thinking");
      try {
        const { command } = await api<{ command: { id: string } }>("/api/commands", { body: { text, channel: "voice" } });
        setCommandId(command.id);
        let acknowledged = false;
        let ticking = false;
        const started = Date.now();
        while (my === run.current && Date.now() - started < 4 * 60_000) {
          if (!ticking) {
            ticking = true;
            api("/api/worker/tick", { body: {} })
              .catch(() => {})
              .finally(() => (ticking = false));
          }
          await new Promise((r) => setTimeout(r, 1800));
          const d = await api<Cmd>(`/api/commands/${command.id}`);
          if (my !== run.current) return;
          if (d.command.response) {
            setReply(d.command.response);
            setPhase("speaking");
            v.speak(d.command.response, true, () => my === run.current && afterSpeaking());
            return;
          }
          if (d.command.status === "failed") throw new Error(d.command.error ?? "Something went wrong.");
          if (!acknowledged && d.tasks.length) {
            acknowledged = true;
            const who = [...new Set(d.tasks.map((t) => t.agentName).filter(Boolean))].slice(0, 3).join(", ");
            v.speak(`On it. I've asked ${who} to work on this. I'll tell you when it's ready.`, true);
          }
        }
        if (my === run.current) throw new Error("This is taking longer than expected. The result will appear in JARVIS Command when it's ready.");
      } catch (e) {
        if (my !== run.current) return;
        const msg = (e as Error).message;
        setReply(msg);
        setPhase("error");
        v.speak(`Sorry. ${msg}`, true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [afterSpeaking],
  );

  const v = useVoice(voice, (t) => ask(t));

  const start = useCallback(() => {
    if (!canCommand) return;
    run.current++;
    primeSpeech();
    setHeard("");
    setPhase("listening");
    v.start();
  }, [canCommand, v]);
  startRef.current = start;

  // Recognition ended with nothing heard → back to idle.
  useEffect(() => {
    if (phase === "listening" && !v.listening && !v.interim) {
      const t = setTimeout(() => setPhase((p) => (p === "listening" ? "idle" : p)), 600);
      return () => clearTimeout(t);
    }
  }, [phase, v.listening, v.interim]);

  const tap = () => {
    if (phase === "listening") return v.stop();
    if (phase === "speaking" || phase === "thinking") {
      run.current++;
      v.stopSpeaking();
      setPhase("idle");
      return;
    }
    start();
  };

  const toggleHandsFree = () => {
    const next = !handsFree;
    setHandsFree(next);
    try {
      localStorage.setItem("jarvis-handsfree", next ? "on" : "off");
    } catch {}
  };

  const unsupported = !v.supported.stt || !v.supported.tts;
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-15rem)] max-w-xl flex-col items-center justify-between gap-4 py-2 text-center">
      <div>
        <h1 className="font-display text-lg tracking-[0.3em] text-accent">JARVIS</h1>
        <p className="mt-1 text-sm text-muted">{phase === "idle" && !heard ? `Hello ${firstName}. Tap the core and speak.` : " "}</p>
      </div>

      <button
        onClick={tap}
        disabled={unsupported || !canCommand}
        aria-label={phase === "listening" ? "Stop listening" : phase === "speaking" || phase === "thinking" ? "Stop" : "Talk to JARVIS"}
        className="relative grid w-64 max-w-[75vw] place-items-center rounded-full disabled:opacity-50"
      >
        {(phase === "listening" || phase === "speaking") && (
          <>
            <span className="pulse-ring absolute inset-4 rounded-full border-2 border-accent" />
            <span className="pulse-ring absolute inset-4 rounded-full border border-accent-2" style={{ animationDelay: "0.8s" }} />
          </>
        )}
        <div className={clsx("orb grid place-items-center transition-transform", phase === "thinking" && "animate-pulse", phase === "listening" && "scale-105")}>
          {phase === "listening" ? (
            <Mic className="size-12 text-accent drop-shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
          ) : phase === "speaking" ? (
            <span className="flex h-12 items-center gap-1" aria-hidden>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <span key={i} className="wave-bar h-full w-1.5 rounded bg-accent" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </span>
          ) : phase === "thinking" ? (
            <span className="font-display text-sm tracking-[0.3em] text-accent">· · ·</span>
          ) : (
            <span className="font-display text-xl font-bold tracking-[0.35em] text-accent">JARVIS</span>
          )}
        </div>
      </button>

      <div className="w-full space-y-3 min-h-28">
        <p className={clsx("font-display text-sm uppercase tracking-[0.25em]", phase === "error" ? "text-warn" : "text-accent")}>{LABEL[phase]}</p>
        {(v.interim || heard) && <p className="text-base text-fg/90">“{v.interim || heard}”</p>}
        {v.error && <p className="text-sm text-warn">{v.error}</p>}
        {unsupported && <p className="text-sm text-warn">This browser can&apos;t do voice. Use Chrome on Android or Safari on iPhone.</p>}
        {!canCommand && <p className="text-sm text-muted">Your role is read-only.</p>}
        {reply && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button onClick={() => setShowText((s) => !s)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted">{showText ? "Hide text" : "Show text"}</button>
            {phase !== "speaking" && (
              <button onClick={() => { primeSpeech(); setPhase("speaking"); v.speak(reply, true, afterSpeaking); }} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-muted">
                <Volume2 className="size-3.5" /> Repeat
              </button>
            )}
            {phase === "speaking" && (
              <button onClick={() => { v.stopSpeaking(); setPhase("idle"); }} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-muted">
                <Square className="size-3.5" /> Stop
              </button>
            )}
            {commandId && <Link href={`/command?id=${commandId}`} className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted">Details</Link>}
          </div>
        )}
        {showText && reply && <div className="panel max-h-[40vh] overflow-y-auto p-3 text-left"><Markdown>{reply}</Markdown></div>}
      </div>

      <div className="flex flex-col items-center gap-2 text-xs text-muted">
        {!ios && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={handsFree} onChange={toggleHandsFree} className="accent-[var(--accent)]" />
            Hands-free conversation (listen again after each reply)
          </label>
        )}
        {ios && <p>On iPhone, tap the core each time you want to speak. Make sure the silent switch is off.</p>}
      </div>
    </div>
  );
}
