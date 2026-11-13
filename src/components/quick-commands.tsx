"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { api, toast } from "@/lib/api";

export function QuickCommands({ items }: { items: { label: string; instruction?: string; href?: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <ul className="space-y-1.5">
      {items.map((q) => (
        <li key={q.label}>
          <button
            disabled={!!busy}
            onClick={async () => {
              if (q.href) return router.push(q.href);
              setBusy(q.label);
              try {
                const { command } = await api<{ command: { id: string } }>("/api/commands", { body: { text: q.instruction, channel: "text" } });
                router.push(`/command?id=${command.id}`);
              } catch (e) {
                toast((e as Error).message, "error");
                setBusy(null);
              }
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-line bg-bg-2/40 px-3 py-2 text-left text-sm hover:border-line-strong hover:bg-accent-soft disabled:opacity-60"
          >
            <span className="flex-1 truncate">{busy === q.label ? "Sending to JARVIS…" : q.label}</span>
            <ChevronRight className="size-4 text-muted" />
          </button>
        </li>
      ))}
    </ul>
  );
}
