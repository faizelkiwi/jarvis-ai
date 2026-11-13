"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Ban, Play, Plus, RotateCcw } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Markdown } from "@/components/markdown";
import { Badge, Button, EmptyState, ErrorText, Field, Input, Modal, PageHeader, Select, StatusBadge, Textarea, Ago } from "@/components/ui";
import { api, toast } from "@/lib/api";

type Task = {
  id: string; title: string; description: string; status: string; priority: string; dueDate: string | null; kind: string;
  agentId: string | null; projectId: string | null; commandId: string | null; dependsOn: string[]; output: string | null; error: string | null;
  attempts: number; createdBy: string; createdAt: string; startedAt: string | null; completedAt: string | null; input: Record<string, unknown>;
};
type Row = { task: Task; agentName: string | null; agentSlug: string | null };
type Opt = { id: string; name: string; active?: boolean };
type Log = { id: number; level: string; message: string; data: unknown; createdAt: string };
type Detail = { task: Task; agentName: string | null; logs: Log[]; approvals: { id: string; title: string; status: string }[]; subtasks: Task[] };

const STATUSES = ["pending", "assigned", "running", "awaiting_approval", "completed", "failed", "cancelled"];
const PRI_TONE: Record<string, "neutral" | "info" | "warn" | "bad"> = { low: "neutral", medium: "info", high: "warn", critical: "bad" };

function NewTask({ agents, projects, tasks, onDone }: { agents: Opt[]; projects: Opt[]; tasks: Row[]; onDone: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/api/tasks", {
        body: {
          title: f.get("title"),
          description: f.get("description"),
          agentId: f.get("agentId") || null,
          projectId: f.get("projectId") || null,
          priority: f.get("priority"),
          dueDate: f.get("dueDate") || null,
          dependsOn: f.getAll("dependsOn").filter(Boolean),
          autoRun: f.get("autoRun") === "on",
        },
      });
      toast("Task created");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Title"><Input name="title" required maxLength={300} /></Field>
      <Field label="Instructions"><Textarea name="description" maxLength={20000} placeholder="What should the agent deliver?" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Agent" hint="Leave empty for a manual task you track yourself.">
          <Select name="agentId" defaultValue="">
            <option value="">— Manual task —</option>
            {agents.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Project">
          <Select name="projectId" defaultValue="">
            <option value="">— None —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Priority">
          <Select name="priority" defaultValue="medium">{["low", "medium", "high", "critical"].map((p) => <option key={p}>{p}</option>)}</Select>
        </Field>
        <Field label="Due date"><Input name="dueDate" type="date" /></Field>
      </div>
      <Field label="Depends on (runs after these complete)">
        <Select name="dependsOn" multiple className="!h-28">
          {tasks.filter((t) => !["failed", "cancelled"].includes(t.task.status)).slice(0, 60).map((t) => <option key={t.task.id} value={t.task.id}>{t.task.title}</option>)}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoRun" defaultChecked className="accent-[var(--accent)]" /> Start automatically when ready</label>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="primary" loading={busy}>Create task</Button>
    </form>
  );
}

function TaskDetail({ id, canEdit, onChanged }: { id: string; canEdit: boolean; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await api<Detail>(`/api/tasks/${id}`);
        if (stop) return;
        setD(r);
        if (["running", "assigned", "pending"].includes(r.task.status)) t = setTimeout(load, 2500);
      } catch (e) {
        toast((e as Error).message, "error");
      }
    };
    load();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [id]);
  async function act(action: "cancel" | "retry" | "run") {
    setBusy(action);
    try {
      await api(`/api/tasks/${id}/action`, { body: { action } });
      toast(action === "cancel" ? "Task cancelled" : action === "retry" ? "Task re-queued" : "Task started");
      setD(await api<Detail>(`/api/tasks/${id}`));
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  }
  if (!d) return <div className="h-40 animate-pulse rounded-lg bg-accent-soft" />;
  const t = d.task;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusBadge status={t.status} />
        <Badge tone={PRI_TONE[t.priority]}>{t.priority}</Badge>
        <span className="text-muted">{d.agentName ?? (t.kind === "checkpoint" ? "Approval checkpoint" : "Manual")}</span>
        <span className="text-muted">· created <Ago d={t.createdAt} /> by {t.createdBy.startsWith("user") ? "you" : t.createdBy}</span>
        {t.attempts > 0 && <span className="text-muted">· {t.attempts} attempt(s)</span>}
      </div>
      {t.description && <p className="whitespace-pre-wrap text-sm text-muted">{t.description}</p>}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {t.status === "assigned" && t.input.autoRun === false && <Button size="sm" variant="primary" onClick={() => act("run")} loading={busy === "run"}><Play className="size-3.5" />Run now</Button>}
          {!["completed", "failed", "cancelled"].includes(t.status) && <Button size="sm" variant="danger" onClick={() => act("cancel")} loading={busy === "cancel"}><Ban className="size-3.5" />Cancel</Button>}
          {["failed", "cancelled"].includes(t.status) && t.agentId && <Button size="sm" onClick={() => act("retry")} loading={busy === "retry"}><RotateCcw className="size-3.5" />Retry</Button>}
          {t.commandId && <Link href={`/command?id=${t.commandId}`} className="text-xs text-accent self-center">Open instruction →</Link>}
        </div>
      )}
      {t.error && <ErrorText>{t.error}</ErrorText>}
      {d.approvals.length > 0 && (
        <div className="rounded-lg border border-line p-3">
          <h4 className="panel-title mb-2">Approval requests</h4>
          <ul className="space-y-1 text-sm">{d.approvals.map((a) => <li key={a.id} className="flex items-center gap-2"><StatusBadge status={a.status} /><Link className="hover:text-accent truncate" href={`/approvals?id=${a.id}`}>{a.title}</Link></li>)}</ul>
        </div>
      )}
      {d.subtasks.length > 0 && (
        <div className="rounded-lg border border-line p-3">
          <h4 className="panel-title mb-2">Delegated sub-tasks</h4>
          <ul className="space-y-1 text-sm">{d.subtasks.map((s) => <li key={s.id} className="flex items-center gap-2"><StatusBadge status={s.status} /><Link className="hover:text-accent truncate" href={`/tasks?id=${s.id}`}>{s.title}</Link></li>)}</ul>
        </div>
      )}
      {t.output && (
        <div className="rounded-lg border border-line p-3">
          <h4 className="panel-title mb-2">Output</h4>
          <Markdown>{t.output}</Markdown>
        </div>
      )}
      <div className="rounded-lg border border-line p-3">
        <h4 className="panel-title mb-2">Execution log</h4>
        {d.logs.length === 0 ? <p className="text-sm text-muted">No log entries yet.</p> : (
          <ol className="space-y-1 font-mono text-[12px]">
            {d.logs.map((l) => (
              <li key={l.id} className="flex gap-2">
                <span className="shrink-0 text-muted tabular-nums">{new Date(l.createdAt).toLocaleTimeString("en-ZA", { hour12: false })}</span>
                <span className={clsx("shrink-0 w-10 uppercase", l.level === "error" && "text-bad", l.level === "warn" && "text-warn", l.level === "tool" && "text-accent", l.level === "llm" && "text-accent-2")}>{l.level}</span>
                <span className="min-w-0 break-words">{l.message}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export function TasksUI({ rows, agents, projects, openId, openNew, initialStatus, canEdit }: { rows: Row[]; agents: Opt[]; projects: Opt[]; openId: string | null; openNew: boolean; initialStatus: string; canEdit: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [agent, setAgent] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(openId);
  const [creating, setCreating] = useState(openNew);
  const filtered = useMemo(
    () => rows.filter((r) => (!status || r.task.status === status) && (!agent || r.task.agentId === agent) && (!q || r.task.title.toLowerCase().includes(q.toLowerCase()))),
    [rows, status, agent, q],
  );
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.task.status === s).length])), [rows]);
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name;
  const close = () => {
    setSelected(null);
    router.replace("/tasks");
  };
  return (
    <div>
      <AutoRefresh ms={8000} />
      <PageHeader title="Tasks" subtitle="Every unit of work — delegated by JARVIS, created by agents, or added by you." actions={canEdit && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" />New task</Button>} />
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button onClick={() => setStatus("")} className={clsx("rounded-lg border px-2.5 py-1 text-xs", !status ? "border-line-strong bg-accent-soft text-accent" : "border-line text-muted")}>All ({rows.length})</button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={clsx("rounded-lg border px-2.5 py-1 text-xs capitalize", status === s ? "border-line-strong bg-accent-soft text-accent" : "border-line text-muted")}>
            {s.replace("_", " ")} ({counts[s]})
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} className="!w-full sm:!w-64" />
        <Select value={agent} onChange={(e) => setAgent(e.target.value)} className="!w-full sm:!w-56" aria-label="Filter by agent">
          <option value="">All agents</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </div>
      <div className="panel overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState title="No tasks match">Give JARVIS an instruction or create a task.</EmptyState>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {filtered.map(({ task, agentName }) => (
              <li key={task.id}>
                <button onClick={() => setSelected(task.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-accent-soft">
                  <span className="min-w-0 flex-1 basis-60">
                    <span className="block truncate text-sm font-medium">{task.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {agentName ?? (task.kind === "checkpoint" ? "Approval checkpoint" : "Manual")}
                      {projectName(task.projectId) && ` · ${projectName(task.projectId)}`}
                      {task.dependsOn.length > 0 && ` · depends on ${task.dependsOn.length}`}
                    </span>
                  </span>
                  <Badge tone={PRI_TONE[task.priority]}>{task.priority}</Badge>
                  {task.dueDate && <span className={clsx("text-xs tabular-nums", task.dueDate < new Date().toISOString().slice(0, 10) && !["completed", "cancelled"].includes(task.status) ? "text-bad" : "text-muted")}>due {task.dueDate}</span>}
                  <span className="w-16 text-right text-xs text-muted"><Ago d={task.createdAt} /></span>
                  <StatusBadge status={task.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title="New task">
        <NewTask agents={agents} projects={projects} tasks={rows} onDone={() => { setCreating(false); router.refresh(); }} />
      </Modal>
      <Modal open={!!selected} onClose={close} title={rows.find((r) => r.task.id === selected)?.task.title ?? "Task"} wide>
        {selected && <TaskDetail id={selected} canEdit={canEdit} onChanged={() => router.refresh()} />}
      </Modal>
    </div>
  );
}
