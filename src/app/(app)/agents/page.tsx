import Link from "next/link";
import { sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/server/db/client";
import { agents, tasks } from "@/server/db/schema";
import { requireUser } from "@/server/http";
import { AgentIcon } from "@/components/agent-icon";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, Dot, PageHeader } from "@/components/ui";
import { AgentToggle } from "./toggle";

export default async function AgentsPage() {
  const user = await requireUser();
  const db = await getDb();
  const rows = await db.select().from(agents).orderBy(agents.name);
  const stats = await db
    .select({
      agentId: tasks.agentId,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')::int`,
      running: sql<number>`count(*) filter (where ${tasks.status} = 'running')::int`,
      queued: sql<number>`count(*) filter (where ${tasks.status} = 'assigned')::int`,
      current: sql<string | null>`max(${tasks.title}) filter (where ${tasks.status} = 'running')`,
    })
    .from(tasks)
    .groupBy(tasks.agentId);
  const canEdit = ["owner", "admin"].includes(user.role);
  return (
    <div>
      <AutoRefresh ms={10000} />
      <PageHeader
        title="AI Agents"
        subtitle="Specialised agents working under JARVIS. Configure their instructions, models, permissions and collaboration."
        actions={canEdit && <Link href="/agents/new" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-[#03121c]"><Plus className="size-4" />New agent</Link>}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((a) => {
          const s = stats.find((x) => x.agentId === a.id);
          const approvalTools = a.permissions.filter((p) => ["publish_social_post", "send_email", "send_customer_message", "send_telegram_message", "make_payment", "launch_ad_campaign", "trigger_external_workflow", "delete_knowledge", "schedule_calendar_event"].includes(p)).length;
          return (
            <div key={a.id} className="panel p-4 flex flex-col">
              <div className="flex items-start gap-3">
                <AgentIcon icon={a.icon} color={a.color} size="lg" />
                <div className="min-w-0 flex-1">
                  <Link href={`/agents/${a.id}`} className="block truncate font-semibold hover:text-accent">{a.name}</Link>
                  <p className="text-xs text-muted truncate">{a.title}</p>
                </div>
                <AgentToggle id={a.id} active={a.active} disabled={!canEdit} />
              </div>
              <p className="mt-3 text-sm text-muted line-clamp-2">{a.description}</p>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <Dot tone={!a.active ? "muted" : s?.running ? "ok" : "muted"} />
                <span className="truncate">{!a.active ? "Inactive" : s?.current ? `Working: ${s.current}` : s?.queued ? `${s.queued} queued` : "Standby"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="ok">{s?.completed ?? 0} done</Badge>
                {(s?.failed ?? 0) > 0 && <Badge tone="bad">{s?.failed} failed</Badge>}
                <Badge>{a.permissions.length} tools</Badge>
                {approvalTools > 0 && <Badge tone="warn">{approvalTools} approval-gated</Badge>}
                <Badge tone="info">{a.model ?? "default model"}</Badge>
              </div>
              <Link href={`/agents/${a.id}`} className="mt-auto pt-3 text-xs text-accent">Manage →</Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
