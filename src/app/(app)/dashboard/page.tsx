import Link from "next/link";
import { AlertTriangle, Bot, CheckCircle2, Clock3, Layers, ShieldCheck, Workflow, XCircle, Zap } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { CommandInput } from "@/components/command-console";
import { QuickCommands } from "@/components/quick-commands";
import { AgentIcon } from "@/components/agent-icon";
import { Badge, Card, Dot, EmptyState, StatusBadge } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { requireUser } from "@/server/http";
import { dashboardData } from "@/server/queries";
import { getSetting } from "@/server/settings/service";
import { actionLabel } from "@/server/approvals/catalog";

function greeting() {
  const h = new Date().toLocaleString("en-ZA", { hour: "numeric", hour12: false, timeZone: "Africa/Johannesburg" });
  const n = Number(h);
  return n < 12 ? "Good morning" : n < 18 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const user = await requireUser();
  const [d, voice, profile] = await Promise.all([dashboardData(), getSetting("voice.settings"), getSetting("business.profile")]);
  const c = d.counts;
  const briefing: string[] = [];
  if (c.pendingApprovals) briefing.push(`${c.pendingApprovals} action${c.pendingApprovals > 1 ? "s" : ""} awaiting your approval.`);
  if (c.running) briefing.push(`${c.running} task${c.running > 1 ? "s are" : " is"} running now.`);
  if (c.queued) briefing.push(`${c.queued} task${c.queued > 1 ? "s" : ""} queued.`);
  if (c.completed24) briefing.push(`${c.completed24} task${c.completed24 > 1 ? "s" : ""} completed in the last 24 hours.`);
  if (c.failed) briefing.push(`${c.failed} failed task${c.failed > 1 ? "s" : ""} need review.`);
  if (d.overdue.length) briefing.push(`${d.overdue.length} overdue task${d.overdue.length > 1 ? "s" : ""}.`);
  if (!briefing.length) briefing.push("All quiet. No pending approvals, running tasks or failures.");

  const core = [
    { label: "AI Core", value: d.ai.demo ? "Demo mode" : d.ai.ready ? "Active" : "Not configured", ok: d.ai.ready && !d.ai.demo, href: "/integrations" },
    { label: "Agents", value: `${c.activeAgents}/${c.totalAgents} active`, ok: c.activeAgents > 0, href: "/agents" },
    { label: "Approvals", value: `${c.pendingApprovals} pending`, ok: c.pendingApprovals === 0, href: "/approvals" },
    { label: "Automations", value: `${c.activeWorkflows} workflows`, ok: true, href: "/workflows" },
    { label: "Model", value: d.ai.model, ok: d.ai.ready, href: "/settings?tab=ai" },
  ];

  return (
    <div className="space-y-4">
      <AutoRefresh ms={8000} />
      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <Card title="AI Core Overview">
          <ul className="space-y-1.5">
            {core.map((x) => (
              <li key={x.label}>
                <Link href={x.href} className="flex items-center gap-3 rounded-lg border border-line bg-bg-2/40 px-3 py-2 hover:border-line-strong">
                  <Dot tone={x.ok ? "ok" : "warn"} />
                  <span className="text-sm">{x.label}</span>
                  <span className={`ml-auto text-xs truncate max-w-[55%] ${x.ok ? "text-ok" : "text-warn"}`}>{x.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <section className="panel relative overflow-hidden p-5 flex flex-col items-center order-first xl:order-none">
          <div className="grid w-full items-center gap-6 md:grid-cols-[minmax(0,200px)_1fr]">
            <div className="orb mx-auto !max-w-[130px] md:!max-w-[200px] grid place-items-center" aria-hidden>
              <div className="text-center">
                <div className="font-display text-sm md:text-xl font-bold tracking-[0.35em] text-accent drop-shadow-[0_0_12px_rgba(34,211,238,0.7)]">JARVIS</div>
                <div className="text-[9px] tracking-[0.3em] text-muted uppercase">AI Core</div>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted">{greeting()},</p>
              <h1 className="text-xl sm:text-2xl font-semibold">{user.name.split(" ")[0]}.</h1>
              <p className="mt-1 text-sm text-muted">Here is what is happening across {profile.name}.</p>
              <ul className="mt-3 space-y-1 text-sm">
                {briefing.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-accent" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-5 w-full">
            <CommandInput voice={voice} compact />
          </div>
        </section>

        <Card title="Live Intelligence Feed" action={<Link href="/notifications" className="text-xs text-accent">View all</Link>}>
          {d.notifications.length === 0 ? (
            <EmptyState title="No notifications yet" />
          ) : (
            <ul className="space-y-2">
              {d.notifications.map((n) => (
                <li key={n.id} className="rounded-lg border border-line bg-bg-2/40 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <Dot tone={n.level === "error" ? "bad" : n.level === "warning" ? "warn" : "ok"} />
                    <div className="min-w-0 flex-1">
                      {n.link ? (
                        <Link href={n.link} className="text-sm leading-snug line-clamp-2 hover:text-accent">{n.title}</Link>
                      ) : (
                        <p className="text-sm leading-snug line-clamp-2">{n.title}</p>
                      )}
                      <p className="text-[11px] text-muted">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {[
          { label: "Active agents", v: c.activeAgents, icon: Bot, tone: "text-accent" },
          { label: "Running", v: c.running, icon: Zap, tone: "text-accent" },
          { label: "Queued", v: c.queued, icon: Clock3, tone: "text-muted" },
          { label: "Pending approvals", v: c.pendingApprovals, icon: ShieldCheck, tone: c.pendingApprovals ? "text-warn" : "text-muted" },
          { label: "Completed", v: c.completed, icon: CheckCircle2, tone: "text-ok" },
          { label: "Failed", v: c.failed, icon: XCircle, tone: c.failed ? "text-bad" : "text-muted" },
          { label: "Automations", v: c.activeWorkflows, icon: Workflow, tone: "text-accent-2" },
          { label: "Projects", v: c.activeProjects, icon: Layers, tone: "text-accent-2" },
        ].map((s) => (
          <div key={s.label} className="panel flex items-center gap-3 px-3 py-3">
            <s.icon className={`size-5 shrink-0 ${s.tone}`} />
            <div className="min-w-0">
              <div className="text-xl font-semibold tabular-nums leading-none">{s.v}</div>
              <div className="mt-1 truncate text-[11px] text-muted">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_280px]">
        <Card title="Active Agents" action={<Link href="/agents" className="text-xs text-accent">View all</Link>}>
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {d.agents.map((a) => (
              <Link key={a.id} href={`/agents/${a.id}`} className="flex items-center gap-3 rounded-lg border border-line bg-bg-2/40 px-3 py-2 hover:border-line-strong min-w-0">
                <AgentIcon icon={a.icon} color={a.color} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.name}</div>
                  <div className="truncate text-[11px] text-muted">
                    {!a.active ? "Inactive" : a.currentTask ? `Working: ${a.currentTask.title}` : a.queued ? `${a.queued} queued` : "Standby"}
                  </div>
                </div>
                <Dot tone={!a.active ? "muted" : a.currentTask ? "ok" : "muted"} />
              </Link>
            ))}
          </div>
        </Card>

        <Card title="Awaiting Your Approval" action={<Link href="/approvals" className="text-xs text-accent">Open queue</Link>}>
          {d.pendingApprovals.length === 0 ? (
            <EmptyState icon={<ShieldCheck className="size-6" />} title="Nothing awaiting approval" />
          ) : (
            <ul className="space-y-2">
              {d.pendingApprovals.map((a) => (
                <li key={a.id}>
                  <Link href={`/approvals?id=${a.id}`} className="block rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 hover:border-warn/60">
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      <Badge tone={a.riskLevel === "critical" || a.riskLevel === "high" ? "bad" : "warn"}>{a.riskLevel}</Badge>
                      {actionLabel(a.action)} · {a.agentName ?? "Workflow"}
                    </div>
                    <p className="mt-1 text-sm line-clamp-2">{a.title}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {d.overdue.length > 0 && (
            <div className="mt-3 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 text-bad text-xs font-medium"><AlertTriangle className="size-3.5" /> Overdue</div>
              <ul className="mt-1 space-y-0.5">
                {d.overdue.slice(0, 4).map((t) => (
                  <li key={t.id}><Link className="hover:text-accent" href={`/tasks?id=${t.id}`}>{t.title}</Link> <span className="text-xs text-muted">due {t.dueDate}</span></li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Quick Commands">
          <QuickCommands
            items={[
              { label: "Prepare today's business briefing", instruction: "Prepare my daily business briefing: priorities, items needing attention, pending approvals, progress on projects and recommended next steps." },
              { label: "Weekly performance report", instruction: "Prepare my weekly business performance report using recorded tasks, projects and financial records. Clearly separate measured data from estimates." },
              { label: "New task", href: "/tasks?new=1" },
              { label: "Run a workflow", href: "/workflows" },
              { label: "Upload knowledge", href: "/knowledge" },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Mission Timeline" action={<Link href="/command" className="text-xs text-accent">All instructions</Link>}>
          {d.recentCommands.length === 0 ? (
            <EmptyState title="No instructions yet">Type an instruction above or use voice.</EmptyState>
          ) : (
            <ol className="relative space-y-3 border-l border-line pl-4">
              {d.recentCommands.map((cmd) => (
                <li key={cmd.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-accent bg-bg" />
                  <Link href={`/command?id=${cmd.id}`} className="block hover:text-accent">
                    <div className="flex items-center gap-2 text-[11px] text-muted">{timeAgo(cmd.createdAt)} <StatusBadge status={cmd.status} /></div>
                    <p className="text-sm line-clamp-2">{cmd.input}</p>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card title="Recent Activity">
          <ul className="space-y-1.5 text-sm max-h-72 overflow-y-auto scroll-thin">
            {d.recentActivity.map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="w-14 shrink-0 text-[11px] text-muted tabular-nums">{timeAgo(e.ts)}</span>
                <span className="min-w-0 truncate"><span className="text-muted">{e.actorType}</span> · {e.action.replace(/[._]/g, " ")}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Current Projects" action={<Link href="/projects" className="text-xs text-accent">Projects</Link>}>
          {d.projects.length === 0 ? (
            <EmptyState title="No active projects"><Link className="text-accent" href="/projects">Create a project</Link></EmptyState>
          ) : (
            <ul className="space-y-2">
              {d.projects.map((p) => (
                <li key={p.id} className="rounded-lg border border-line bg-bg-2/40 px-3 py-2">
                  <div className="flex items-center gap-2"><span className="text-sm font-medium truncate flex-1">{p.name}</span><StatusBadge status={p.status} /></div>
                  {p.dueDate && <p className="text-[11px] text-muted">Due {p.dueDate}</p>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center justify-between rounded-lg border border-line px-3 py-2 text-xs">
            <span className="text-muted">AI usage (30 days)</span>
            <span className="tabular-nums">{d.usage30.tokens.toLocaleString()} tokens · ${d.usage30.costUsd.toFixed(2)} est.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
