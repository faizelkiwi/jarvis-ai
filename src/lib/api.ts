"use client";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(url: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body || init.form ? "POST" : "GET"),
    headers: init.form ? undefined : { "content-type": "application/json" },
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth")) window.location.href = "/login";
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

type ToastKind = "ok" | "error" | "info";
export function toast(message: string, kind: ToastKind = "ok") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("jarvis-toast", { detail: { message, kind } }));
}
