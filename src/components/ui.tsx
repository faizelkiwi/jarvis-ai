"use client";

import clsx from "clsx";
import { Loader2, X } from "lucide-react";
import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export function Card({ title, action, children, className, bodyClassName }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={clsx("panel flex flex-col min-w-0", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
          {title && <h2 className="panel-title">{title}</h2>}
          {action}
        </header>
      )}
      <div className={clsx("px-4 pb-4 min-w-0", !title && !action && "pt-4", bodyClassName)}>{children}</div>
    </section>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "success"; size?: "sm" | "md"; loading?: boolean };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-accent text-[#03121c] hover:brightness-110 shadow-[0_0_18px_rgba(34,211,238,0.35)]",
        variant === "secondary" && "border border-line-strong bg-accent-soft text-fg hover:bg-panel-hover",
        variant === "ghost" && "text-muted hover:text-fg hover:bg-accent-soft",
        variant === "danger" && "border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20",
        variant === "success" && "border border-ok/40 bg-ok/10 text-ok hover:bg-ok/20",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
});

const field = "w-full rounded-lg border border-line bg-bg-2/60 px-3 text-sm text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={clsx(field, "h-10", className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={clsx(field, "py-2 min-h-24", className)} {...p} />;
});
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(field, "h-10", className)} {...p}>
      {children}
    </select>
  );
}
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block space-y-1.5", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted/80">{hint}</span>}
    </label>
  );
}

const TONES = {
  neutral: "bg-accent-soft text-muted border-line",
  info: "bg-accent-2/12 text-accent-2 border-accent-2/30",
  accent: "bg-accent/12 text-accent border-accent/30",
  ok: "bg-ok/12 text-ok border-ok/30",
  warn: "bg-warn/12 text-warn border-warn/30",
  bad: "bg-bad/12 text-bad border-bad/30",
};
export type Tone = keyof typeof TONES;
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", TONES[tone], className)}>{children}</span>;
}

export const STATUS_TONE: Record<string, Tone> = {
  pending: "neutral",
  assigned: "info",
  running: "accent",
  awaiting_approval: "warn",
  completed: "ok",
  executed: "ok",
  approved: "ok",
  connected: "ok",
  configured: "info",
  failed: "bad",
  execution_failed: "bad",
  error: "bad",
  rejected: "bad",
  cancelled: "neutral",
  changes_requested: "warn",
  not_configured: "neutral",
  planning: "info",
  active: "ok",
  on_hold: "warn",
  archived: "neutral",
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"}>
      {status === "running" && <span className="size-1.5 rounded-full bg-accent animate-pulse" />}
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export function Dot({ tone = "ok" }: { tone?: "ok" | "warn" | "bad" | "muted" }) {
  return <span className={clsx("inline-block size-2 rounded-full", tone === "ok" && "bg-ok shadow-[0_0_8px_var(--ok)]", tone === "warn" && "bg-warn", tone === "bad" && "bg-bad", tone === "muted" && "bg-muted/50")} />;
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      {icon && <div className="text-muted/70">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="text-xs text-muted max-w-sm">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-lg sm:text-xl font-semibold tracking-wider uppercase">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "bad" | "accent" }) {
  return (
    <div className="panel px-4 py-3 min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted truncate">{label}</div>
      <div className={clsx("mt-1 text-2xl font-semibold tabular-nums", tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "bad" && "text-bad", tone === "accent" && "text-accent")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted truncate">{hint}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={clsx("panel !bg-panel-solid w-full max-h-[92vh] overflow-y-auto scroll-thin rounded-b-none sm:rounded-b-[14px]", wide ? "sm:max-w-3xl" : "sm:max-w-lg")} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel-solid px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{children}</p>;
}

import { timeAgo as timeAgoFn } from "@/lib/format";
export { timeAgoFn as timeAgo };

/** Relative time that tolerates the server/client clock gap during hydration. */
export function Ago({ d }: { d: string | Date | null | undefined }) {
  return <span suppressHydrationWarning>{timeAgoFn(d)}</span>;
}
