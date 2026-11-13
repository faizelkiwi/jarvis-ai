"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { Badge, Button, StatusBadge, Ago } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { api, toast } from "@/lib/api";
import { primeSpeech, setVoiceReplies, useVoice, voiceRepliesEnabled, type VoiceSettings } from "@/components/voice";

export const EXAMPLES = [
  "Research five profitable digital product opportunities.",
  "Prepare seven days of Instagram content.",
  "Ask the research agent to analyse my competitors.",
  "Create a marketing campaign for my digital products.",
  "Prepare my daily business performance report.",
  "Assign the content creation agent to prepare two YouTube scripts.",
];

export function CommandInput({ voice, onSubmitted, compact }: { voice: VoiceSettings; onSubmitted?: (id: string, channel: "text" | "voice") => void; compact?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [replies, setReplies] = useState(true);
  useEffect(() => setReplies(voiceRepliesEnabled()), []);

  const submit = useCallback(
    async (value: string, channel: "text" | "voice") => {
      const v = value.trim();
      if (v.length < 2 || busy) return;
      if (voiceRepliesEnabled()) primeSpeech();
      setBusy(true);
      try {
        const { command } = await api<{ command: { id: string } }>("/api/commands", { body: { text: v, channel } });
        setText("");
        if (onSubmitted) onSubmitted(command.id, channel);
        else router.push(`/command?id=${command.id}${channel === "voice" || voiceRepliesEnabled() ? "&voice=1" : ""}`);
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setBusy(false);
      }
    },
    [busy, onSubmitted, router],
  );
  const v = useVoice(voice, (t) => submit(t, "voice"));

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text, "text");
        }}
        className="panel flex items-end gap-2 p-2 focus-within:border-line-strong"
      >
        <textarea
          value={v.listening ? v.interim || "Listening…" : text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(text, "text");
            }
          }}
          rows={compact ? 1 : 2}
          maxLength={8000}
          placeholder="Instruct JARVIS… e.g. “Research five profitable digital product opportunities.”"
          aria-label="Instruction for JARVIS"
          className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm placeholder:text-muted/70 focus:outline-none"
          readOnly={v.listening}
        />
        {v.supported.stt && voice.enabled && (
          <button
            type="button"
            onClick={v.listening ? v.stop : v.start}
            className={clsx("relative grid size-10 shrink-0 place-items-center rounded-lg border", v.listening ? "border-accent text-accent" : "border-line text-muted hover:text-fg")}
            aria-label={v.listening ? "Stop listening" : "Speak to JARVIS"}
            title={v.listening ? "Stop listening" : "Speak to JARVIS"}
          >
            {v.listening && <span className="pulse-ring absolute inset-0 rounded-lg border border-accent" />}
            {v.listening ? <Square className="size-4" /> : <Mic className="size-4" />}
          </button>
        )}
        <Button type="submit" variant="primary" className="!size-10 !p-0 shrink-0" loading={busy} aria-label="Send instruction" disabled={text.trim().length < 2}>
          {!busy && <ArrowUp className="size-4" />}
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        {v.supported.tts && (
          <button
            type="button"
            onClick={() => {
              const next = !replies;
              setVoiceReplies(next);
              setReplies(next);
              if (next) primeSpeech();
            }}
            aria-pressed={replies}
            className={clsx("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", replies ? "border-line-strong bg-accent-soft text-accent" : "border-line text-muted")}
          >
            {replies ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            Voice replies {replies ? "on" : "off"}
          </button>
        )}
        {v.error && <p className="text-xs text-warn">{v.error}</p>}
      </div>
      {!v.supported.stt && voice.enabled && <p className="text-[11px] text-muted">Voice input needs a browser with speech recognition (Chrome, Edge, Safari).</p>}
    </div>
  );
}

type CmdTask = { task: { id: string; title: string; status: string; output: string | null; error: string | null; dependsOn: string[] }; agentName: string | null };
type CmdData = {
  command: { id: string; input: string; status: string; response: string | null; error: string | null; channel: string; plan: { understanding?: string } | null; createdAt: string };
  tasks: CmdTask[];
  approvals: { id: string; title: string; status: string }[];
};

export function CommandView({ id, voice, autoSpeak }: { id: string; voice: VoiceSettings; autoSpeak?: boolean }) {
  const [data, setData] = useState<CmdData | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const spoken = useRef<string | null>(null);
  const v = useVoice(voice, () => {});

  const [workerError, setWorkerError] = useState("");
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let ticking = false;
    const tick = async () => {
      // Ask the server to process queued work now (needed on serverless hosting).
      if (ticking) return;
      ticking = true;
      try {
        await api("/api/worker/tick", { body: {} });
        if (!stop) setWorkerError("");
      } catch (e) {
        if (!stop) setWorkerError((e as Error).message);
      } finally {
        ticking = false;
      }
    };
    const load = async () => {
      try {
        const d = await api<CmdData>(`/api/commands/${id}`);
        if (stop) return;
        setData(d);
        setError("");
        if (["planning", "running"].includes(d.command.status) || (!d.command.response && d.command.status !== "failed")) {
          tick();
          timer = setTimeout(load, 2000);
        }
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id]);

  useEffect(() => {
    if (autoSpeak && data?.command.response && spoken.current !== id) {
      spoken.current = id;
      v.speak(data.command.response, true);
    }
  }, [autoSpeak, data?.command.response, id, v]);

  if (error) return <p className="text-sm text-bad">{error}</p>;
  if (!data) return <div className="h-40 animate-pulse panel" />;
  const { command, tasks, approvals } = data;
  const pending = approvals.filter((a) => a.status === "pending");
  const working = ["planning", "running"].includes(command.status) || (!command.response && command.status !== "failed");

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <StatusBadge status={command.status} />
          {command.channel === "voice" && <Badge tone="info">voice</Badge>}
          <span><Ago d={command.createdAt} /></span>
        </div>
        <p className="mt-2 font-medium">{command.input}</p>
        {command.plan?.understanding && <p className="mt-2 text-sm text-muted">JARVIS: {command.plan.understanding}</p>}
      </div>

      {tasks.length > 0 && (
        <div className="panel p-4">
          <h3 className="panel-title mb-3">Delegated to {tasks.length} agent task{tasks.length > 1 ? "s" : ""}</h3>
          <ol className="space-y-2">
            {tasks
              .slice()
              .reverse()
              .map(({ task, agentName }) => (
                <li key={task.id} className="rounded-lg border border-line bg-bg-2/40">
                  <button className="flex w-full items-center gap-3 px-3 py-2 text-left" onClick={() => setOpen((o) => ({ ...o, [task.id]: !o[task.id] }))} aria-expanded={!!open[task.id]}>
                    <span className="text-xs font-semibold text-accent w-36 shrink-0 truncate">{agentName ?? "—"}</span>
                    <span className="flex-1 min-w-0 truncate text-sm">{task.title}</span>
                    {task.dependsOn.length > 0 && <Badge className="hidden sm:inline-flex">after {task.dependsOn.length} step</Badge>}
                    <StatusBadge status={task.status} />
                    <ChevronDown className={clsx("size-4 text-muted transition-transform", open[task.id] && "rotate-180")} />
                  </button>
                  {open[task.id] && (
                    <div className="border-t border-line px-3 py-3">
                      {task.output ? <Markdown>{task.output}</Markdown> : task.error ? <p className="text-sm text-bad">{task.error}</p> : <p className="text-sm text-muted">Working…</p>}
                      <Link href={`/tasks?id=${task.id}`} className="mt-2 inline-block text-xs text-accent">
                        View execution log →
                      </Link>
                    </div>
                  )}
                </li>
              ))}
          </ol>
        </div>
      )}

      {pending.length > 0 && (
        <div className="panel border-warn/40 p-4">
          <h3 className="panel-title !text-warn mb-2">Awaiting your approval</h3>
          <ul className="space-y-1 text-sm">
            {pending.map((a) => (
              <li key={a.id}>
                <Link className="text-accent hover:underline" href={`/approvals?id=${a.id}`}>
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="panel-title">JARVIS response</h3>
          {command.response && v.supported.tts && (
            <Button size="sm" variant="ghost" onClick={() => (v.speaking ? v.stopSpeaking() : v.speak(command.response!, true))} aria-label={v.speaking ? "Stop speaking" : "Read aloud"}>
              {v.speaking ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              {v.speaking ? "Stop" : "Read aloud"}
            </Button>
          )}
        </div>
        {workerError && !command.response && <p className="mb-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{workerError}</p>}
        {command.response ? (
          <Markdown>{command.response}</Markdown>
        ) : command.status === "failed" ? (
          <p className="text-sm text-bad">{command.error ?? "The instruction failed."}</p>
        ) : working ? (
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="flex h-5 items-center gap-0.5" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="wave-bar w-1 h-full rounded bg-accent" style={{ animationDelay: `${i * 0.12}s` }} />
              ))}
            </span>
            {command.status === "planning" ? "JARVIS is thinking…" : "Agents are working…"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
