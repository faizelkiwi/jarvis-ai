"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquare, Mic } from "lucide-react";
import { CommandInput, CommandView, EXAMPLES } from "@/components/command-console";
import { EmptyState, PageHeader, StatusBadge, Ago } from "@/components/ui";
import { voiceRepliesEnabled, type VoiceSettings } from "@/components/voice";

type H = { id: string; input: string; status: string; channel: string; createdAt: string };

export function CommandCentre({ history, voice, initialId, autoSpeak }: { history: H[]; voice: VoiceSettings; initialId: string | null; autoSpeak: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState(initialId);
  const [speak, setSpeak] = useState(autoSpeak);
  return (
    <div>
      <PageHeader title="JARVIS Command" subtitle="Give instructions in plain language — by text or voice. JARVIS selects and coordinates the right agents." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4 min-w-0">
          <CommandInput
            voice={voice}
            onSubmitted={(id, channel) => {
              setSelected(id);
              setSpeak(channel === "voice" || voiceRepliesEnabled());
              router.replace(`/command?id=${id}`);
              router.refresh();
            }}
          />
          {!selected && (
            <div className="panel p-4">
              <p className="panel-title mb-3">Try an instruction</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {EXAMPLES.map((e) => (
                  <p key={e} className="rounded-lg border border-line px-3 py-2 text-sm text-muted">“JARVIS, {e.charAt(0).toLowerCase() + e.slice(1)}”</p>
                ))}
              </div>
            </div>
          )}
          {selected && <CommandView key={selected} id={selected} voice={voice} autoSpeak={speak} />}
        </div>
        <aside className="panel p-3 h-fit lg:sticky lg:top-20">
          <h2 className="panel-title px-1 mb-2">Conversation history</h2>
          {history.length === 0 ? (
            <EmptyState title="No instructions yet" />
          ) : (
            <ul className="space-y-1 max-h-[65vh] overflow-y-auto scroll-thin">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => {
                      setSelected(h.id);
                      setSpeak(false);
                      router.replace(`/command?id=${h.id}`);
                    }}
                    className={clsx("w-full rounded-lg px-2 py-2 text-left hover:bg-accent-soft", selected === h.id && "bg-accent-soft border border-line-strong")}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      {h.channel === "voice" ? <Mic className="size-3" /> : <MessageSquare className="size-3" />}
                      <Ago d={h.createdAt} />
                      <span className="ml-auto"><StatusBadge status={h.status} /></span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm">{h.input}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
