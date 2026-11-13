"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders server data periodically while the tab is visible. */
export function AutoRefresh({ ms = 10000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), ms);
    return () => clearInterval(t);
  }, [ms, router]);
  return null;
}
