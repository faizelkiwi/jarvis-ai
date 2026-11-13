"use client";

import clsx from "clsx";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

type T = { id: number; message: string; kind: "ok" | "error" | "info" };

export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as Omit<T, "id">;
      const id = Date.now() + Math.random();
      setItems((x) => [...x.slice(-3), { ...d, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), d.kind === "error" ? 7000 : 3500);
    };
    window.addEventListener("jarvis-toast", h);
    return () => window.removeEventListener("jarvis-toast", h);
  }, []);
  return (
    <div className="fixed bottom-20 lg:bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:w-96" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={clsx("panel !bg-panel-solid flex items-start gap-2 px-3 py-2.5 text-sm", t.kind === "error" && "!border-bad/40")}>
          {t.kind === "ok" ? <CheckCircle2 className="size-4 text-ok mt-0.5 shrink-0" /> : t.kind === "error" ? <XCircle className="size-4 text-bad mt-0.5 shrink-0" /> : <Info className="size-4 text-accent mt-0.5 shrink-0" />}
          <span className="min-w-0 break-words">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
