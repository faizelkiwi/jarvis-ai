"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, toast } from "@/lib/api";

export function AgentToggle({ id, active, disabled }: { id: string; active: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(active);
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={on ? "Deactivate agent" : "Activate agent"}
      disabled={disabled}
      onClick={async () => {
        setOn(!on);
        try {
          await api(`/api/agents/${id}`, { method: "PATCH", body: { active: !on } });
          toast(!on ? "Agent activated" : "Agent deactivated");
          router.refresh();
        } catch (e) {
          setOn(on);
          toast((e as Error).message, "error");
        }
      }}
      className={clsx("relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50", on ? "border-accent bg-accent/30" : "border-line bg-bg-2")}
    >
      <span className={clsx("absolute top-0.5 size-4.5 rounded-full transition-all", on ? "left-[22px] bg-accent" : "left-0.5 bg-muted")} />
    </button>
  );
}
