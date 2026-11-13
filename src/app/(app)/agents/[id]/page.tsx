import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db/client";
import { agents, projects } from "@/server/db/schema";
import { agentDetail } from "@/server/agents/service";
import { ASSIGNABLE_TOOLS } from "@/server/agents/tools";
import { requireUser } from "@/server/http";
import { AgentForm } from "@/components/agent-form";
import { AgentIcon } from "@/components/agent-icon";
import { AutoRefresh } from "@/components/auto-refresh";
import { Card, EmptyState, Stat, StatusBadge } from "@/components/ui";
import { timeAgo } from "@/lib/format";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await agentDetail(id);
  if (!d) notFound();
  const db = await getDb();
  const [roster, projs] = await Promise.all([db.select({ slug: agents.slug, name: agents.name }).from(agents), db.select({ id: projects.id, name: projects.name }).from(projects)]);
  const { agent, stats, usage } = d;
  const rate = stats.completed + stats.failed ? Math.round((stats.completed / (stats.completed + stats.failed)) * 100) : null;
  return (
    <div className="space-y-4">
      <AutoRefresh ms={15000} />
      <Link href="/agents" className="text-xs text-accent">← All agents</Link>
      <div className="flex items-center gap-4">
        <AgentIcon icon={agent.icon} color={agent.color} size="lg" />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{agent.name}</h1>
          <p className="text-sm text-muted">{agent.title} · <code className="text-xs">{agent.slug}</code> · {agent.active ? <span className="text-ok">active</span> : <span className="text-muted">inactive</span>}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Tasks total" value={stats.total} />
        <Stat label="Completed" value={stats.completed} tone="ok" />
        <Stat label="Success rate" value={rate === null ? "—" : `${rate}%`} />
        <Stat label="Avg duration" value={stats.avgSeconds ? `${Math.round(stats.avgSeconds)}s` : "—"} />
        <Stat label="AI cost (est.)" value={`$${usage.cost.toFixed(2)}`} hint={`${usage.tokens.toLocaleString()} tokens`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Configuration">
          <AgentForm canEdit={["owner", "admin"].includes(user.role)} tools={ASSIGNABLE_TOOLS} agents={roster} projects={projs} projectIds={d.projectIds} initial={JSON.parse(JSON.stringify(agent))} />
        </Card>
        <div className="space-y-4 min-w-0">
          <Card title="Current task">
            {d.current ? <Link href={`/tasks?id=${d.current.id}`} className="text-sm hover:text-accent">{d.current.title}</Link> : <p className="text-sm text-muted">Standby</p>}
          </Card>
          <Card title="Task history">
            {d.history.length === 0 ? <EmptyState title="No tasks yet" /> : (
              <ul className="space-y-1.5">
                {d.history.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <Link href={`/tasks?id=${t.id}`} className="min-w-0 flex-1 truncate hover:text-accent">{t.title}</Link>
                    <span className="text-[11px] text-muted">{timeAgo(t.createdAt)}</span>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Execution logs">
            {d.logs.length === 0 ? <EmptyState title="No logs yet" /> : (
              <ol className="max-h-96 space-y-1 overflow-y-auto scroll-thin font-mono text-[11px]">
                {d.logs.map((l) => (
                  <li key={l.id} className="flex gap-2"><span className="shrink-0 text-muted">{timeAgo(l.createdAt)}</span><span className="shrink-0 uppercase text-accent w-9">{l.level}</span><span className="min-w-0 break-words">{l.message}</span></li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
