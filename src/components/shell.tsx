"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AudioLines,
  Bell,
  BookOpen,
  Bot,
  ChartColumn,
  CheckSquare,
  ChevronsLeft,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plug,
  Settings,
  ShieldCheck,
  Sun,
  Terminal,
  Workflow,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/voice", label: "Talk to JARVIS", icon: AudioLines },
  { href: "/command", label: "JARVIS Command", icon: Terminal },
  { href: "/agents", label: "AI Agents", icon: Bot },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, badge: "approvals" as const },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/analytics", label: "Analytics", icon: ChartColumn },
  { href: "/notifications", label: "Notifications", icon: Bell, badge: "notifications" as const },
  { href: "/settings", label: "Settings", icon: Settings },
];
const MOBILE = ["/dashboard", "/command", "/voice", "/approvals"];

type Counts = { approvals: number; notifications: number };
type User = { name: string; email: string; role: string };

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <div className="h-9" />;
  return (
    <div className="text-center leading-tight">
      <div className="text-[10px] text-muted">{now.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      <div className="font-display text-base sm:text-lg tracking-widest text-accent tabular-nums">{now.toLocaleTimeString("en-ZA", { hour12: false })}</div>
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string>("dark");
  useEffect(() => setTheme(document.documentElement.dataset.theme ?? "dark"), []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("jarvis-theme", next);
    } catch {}
    setTheme(next);
  };
  return (
    <button onClick={toggle} className="rounded-lg p-2 text-muted hover:text-fg hover:bg-accent-soft" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function Shell({ user, counts: initial, demo, aiReady, children }: { user: User; counts: Counts; demo: boolean; aiReady: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [counts, setCounts] = useState(initial);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("jarvis-sidebar") === "collapsed");
    } catch {}
  }, []);
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => setCounts(initial), [initial]);
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const [a, n] = await Promise.all([api<{ approvals: unknown[] }>("/api/approvals?status=pending"), api<{ unread: number }>("/api/notifications")]);
        setCounts({ approvals: a.approvals.length, notifications: n.unread });
      } catch {}
    }, 15000);
    return () => clearInterval(t);
  }, []);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("jarvis-sidebar", c ? "expanded" : "collapsed");
      } catch {}
      return !c;
    });
  };
  const logout = async () => {
    await api("/api/auth/logout", { body: {} });
    router.replace("/login");
    router.refresh();
  };

  const navList = (compact: boolean) => (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.map((n) => {
        const active = pathname === n.href || pathname.startsWith(n.href + "/");
        const badge = n.badge ? counts[n.badge] : 0;
        return (
          <Link
            key={n.href}
            href={n.href}
            title={compact ? n.label : undefined}
            className={clsx(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-accent-soft text-accent border border-line-strong" : "text-muted hover:text-fg hover:bg-accent-soft border border-transparent",
              compact && "justify-center px-0",
            )}
          >
            <n.icon className="size-4 shrink-0" />
            {!compact && <span className="truncate">{n.label}</span>}
            {badge > 0 && (
              <span className={clsx("rounded-full bg-accent px-1.5 text-[10px] font-semibold text-[#03121c] tabular-nums", compact ? "absolute -top-1 right-1" : "ml-auto")}>{badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className={clsx("hidden lg:flex sticky top-0 h-dvh shrink-0 flex-col border-r border-line bg-bg/70 backdrop-blur p-3 transition-[width]", collapsed ? "w-[68px]" : "w-60")}>
        <div className={clsx("mb-5 flex items-center gap-2 px-1", collapsed && "justify-center")}>
          <div className="size-8 shrink-0 rounded-full border border-accent/60 grid place-items-center shadow-[0_0_14px_rgba(34,211,238,0.4)]">
            <div className="size-3 rounded-full bg-accent" />
          </div>
          {!collapsed && (
            <div>
              <div className="font-display text-sm font-bold tracking-[0.3em] text-accent">JARVIS</div>
              <div className="text-[9px] tracking-[0.25em] text-muted uppercase">Command Center</div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto scroll-thin">{navList(collapsed)}</div>
        <button onClick={toggleCollapse} className="mt-2 flex items-center justify-center gap-2 rounded-lg py-2 text-xs text-muted hover:text-fg hover:bg-accent-soft" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <ChevronsLeft className={clsx("size-4 transition-transform", collapsed && "rotate-180")} />
          {!collapsed && "Collapse"}
        </button>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60" onClick={() => setDrawer(false)}>
          <aside className="h-full w-72 max-w-[85vw] bg-panel-solid border-r border-line p-3 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display font-bold tracking-[0.3em] text-accent">JARVIS</span>
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="p-2 text-muted">
                <X className="size-5" />
              </button>
            </div>
            {navList(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
            <button className="lg:hidden p-2 -ml-1 text-muted" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2 rounded-lg border border-line px-2.5 py-1 text-[11px] uppercase tracking-wider">
              <span className={clsx("size-1.5 rounded-full", aiReady ? "bg-ok shadow-[0_0_8px_var(--ok)]" : "bg-warn")} />
              <span className="text-muted">System status</span>
              <span className={aiReady ? "text-ok" : "text-warn"}>{demo ? "Demo" : aiReady ? "Optimal" : "AI not configured"}</span>
            </div>
            <div className="flex-1 flex justify-center">
              <Clock />
            </div>
            <ThemeToggle />
            <Link href="/notifications" className="relative rounded-lg p-2 text-muted hover:text-fg hover:bg-accent-soft" aria-label="Notifications">
              <Bell className="size-4" />
              {counts.notifications > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-accent" />}
            </Link>
            <div className="hidden sm:block text-right leading-tight pl-1">
              <div className="text-xs font-medium truncate max-w-32">{user.name}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted">{user.role}</div>
            </div>
            <button onClick={logout} className="rounded-lg p-2 text-muted hover:text-fg hover:bg-accent-soft" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
          {demo && (
            <div className="border-t border-warn/30 bg-warn/10 px-4 py-1.5 text-center text-xs text-warn">
              DEMO MODE — agent responses are placeholders; no real AI is called. Set JARVIS_DEMO_MODE=false and configure Anthropic for live operation.
            </div>
          )}
          {!demo && !aiReady && (
            <div className="border-t border-warn/30 bg-warn/10 px-4 py-1.5 text-center text-xs text-warn">
              No AI provider is configured. <Link href="/integrations" className="underline">Add your Anthropic API key</Link> to activate JARVIS.
            </div>
          )}
        </header>
        <main className="flex-1 min-w-0 px-3 py-4 sm:px-5 sm:py-6 pb-24 lg:pb-8">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t border-line bg-bg/95 backdrop-blur pb-[env(safe-area-inset-bottom)]" aria-label="Quick">
        {NAV.filter((n) => MOBILE.includes(n.href)).map((n) => {
          const active = pathname.startsWith(n.href);
          const badge = n.badge ? counts[n.badge] : 0;
          return (
            <Link key={n.href} href={n.href} className={clsx("relative flex flex-col items-center gap-0.5 py-2 text-[10px]", active ? "text-accent" : "text-muted")}>
              <n.icon className="size-5" />
              {n.href === "/voice" ? "Talk" : n.label.replace("JARVIS ", "")}
              {badge > 0 && <span className="absolute top-1 right-[25%] rounded-full bg-accent px-1 text-[9px] font-bold text-[#03121c]">{badge}</span>}
            </Link>
          );
        })}
        <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] text-muted">
          <Menu className="size-5" />
          More
        </button>
      </nav>
    </div>
  );
}
