"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Button, Dot, EmptyState, PageHeader, Ago } from "@/components/ui";
import { api, toast } from "@/lib/api";

type N = { id: string; level: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };

export function NotificationsUI({ rows }: { rows: N[] }) {
  const router = useRouter();
  const mark = async (body: { ids?: string[]; all?: boolean }) => {
    try {
      await api("/api/notifications", { body });
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <div>
      <AutoRefresh ms={15000} />
      <PageHeader title="Notifications" subtitle="Approval requests, completed work and failures." actions={rows.some((r) => !r.read) && <Button onClick={() => mark({ all: true })}><CheckCheck className="size-4" />Mark all read</Button>} />
      <div className="panel overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={<Bell className="size-8" />} title="You're all caught up" /> : (
          <ul className="divide-y divide-[var(--line)]">
            {rows.map((n) => (
              <li key={n.id} className={clsx("flex items-start gap-3 px-4 py-3", !n.read && "bg-accent-soft/50")}>
                <span className="mt-1.5"><Dot tone={n.level === "error" ? "bad" : n.level === "warning" ? "warn" : n.level === "success" ? "ok" : "muted"} /></span>
                <div className="min-w-0 flex-1">
                  {n.link ? <Link href={n.link} onClick={() => !n.read && mark({ ids: [n.id] })} className="font-medium hover:text-accent">{n.title}</Link> : <p className="font-medium">{n.title}</p>}
                  {n.body && <p className="text-sm text-muted line-clamp-2">{n.body}</p>}
                  <p className="text-[11px] text-muted"><Ago d={n.createdAt} /></p>
                </div>
                {!n.read && <Button size="sm" variant="ghost" onClick={() => mark({ ids: [n.id] })}>Mark read</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
