"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FolderKanban, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button, EmptyState, ErrorText, Field, Input, Modal, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui";
import { api, toast } from "@/lib/api";

type P = { id: string; name: string; description: string; objective: string; status: string; dueDate: string | null; agentIds: string[]; stats: { total: number; done: number; overdue: number } };
type T = { id: string; title: string; status: string; projectId: string | null; agentName: string | null; dueDate: string | null };
const COLUMNS: { key: string; label: string; statuses: string[] }[] = [
  { key: "todo", label: "To do", statuses: ["pending", "assigned"] },
  { key: "doing", label: "In progress", statuses: ["running", "awaiting_approval"] },
  { key: "done", label: "Done", statuses: ["completed"] },
  { key: "stopped", label: "Failed / cancelled", statuses: ["failed", "cancelled"] },
];

function ProjectForm({ initial, agents, onDone }: { initial: Partial<P>; agents: { id: string; name: string }[]; onDone: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<string[]>(initial.agentIds ?? []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const body = { name: f.get("name"), description: f.get("description"), objective: f.get("objective"), status: f.get("status"), dueDate: f.get("dueDate") || null, agentIds: sel };
      if (initial.id) await api(`/api/projects/${initial.id}`, { method: "PATCH", body });
      else await api("/api/projects", { body });
      toast("Project saved");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Name"><Input name="name" defaultValue={initial.name} required maxLength={200} /></Field>
      <Field label="Objective"><Input name="objective" defaultValue={initial.objective} maxLength={2000} placeholder="What does success look like?" /></Field>
      <Field label="Description"><Textarea name="description" defaultValue={initial.description} maxLength={5000} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status"><Select name="status" defaultValue={initial.status ?? "active"}>{["planning", "active", "on_hold", "completed", "archived"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</Select></Field>
        <Field label="Due date"><Input type="date" name="dueDate" defaultValue={initial.dueDate ?? ""} /></Field>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-muted">Assigned agents</div>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {agents.map((a) => <label key={a.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--accent)]" checked={sel.includes(a.id)} onChange={() => setSel((x) => (x.includes(a.id) ? x.filter((y) => y !== a.id) : [...x, a.id]))} />{a.name}</label>)}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="primary" loading={busy}>Save project</Button>
    </form>
  );
}

export function ProjectsUI({ projects, agents, tasks, canEdit, canDelete }: { projects: P[]; agents: { id: string; name: string }[]; tasks: T[]; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<P> | null>(null);
  const [open, setOpen] = useState<string | null>(projects[0]?.id ?? null);
  const [planning, setPlanning] = useState<string | null>(null);
  async function plan(p: P) {
    setPlanning(p.id);
    try {
      const { command } = await api<{ command: { id: string } }>("/api/commands", {
        body: { text: `Ask the project manager to break the project "${p.name}" into concrete tasks with owners, priorities and due dates, and create them. Objective: ${p.objective || "(not set)"}. Description: ${p.description || "(none)"}${p.dueDate ? `. Deadline: ${p.dueDate}` : ""}.`, projectId: p.id },
      });
      router.push(`/command?id=${command.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
      setPlanning(null);
    }
  }
  async function remove(p: P) {
    if (!confirm(`Delete project "${p.name}"? Its tasks are kept but unlinked.`)) return;
    try {
      await api(`/api/projects/${p.id}`, { method: "DELETE" });
      toast("Project deleted");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }
  const current = projects.find((p) => p.id === open);
  const cur = tasks.filter((t) => t.projectId === open);
  return (
    <div>
      <PageHeader title="Projects" subtitle="Objectives, deadlines and the central project board." actions={canEdit && <Button variant="primary" onClick={() => setEditing({})}><Plus className="size-4" />New project</Button>} />
      {projects.length === 0 ? (
        <div className="panel"><EmptyState icon={<FolderKanban className="size-8" />} title="No projects yet">Create a project, then ask JARVIS to plan it into tasks.</EmptyState></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <ul className="space-y-2">
            {projects.map((p) => {
              const pct = p.stats.total ? Math.round((p.stats.done / p.stats.total) * 100) : 0;
              return (
                <li key={p.id}>
                  <button onClick={() => setOpen(p.id)} className={`panel w-full p-3 text-left ${open === p.id ? "!border-line-strong" : ""}`}>
                    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium">{p.name}</span><StatusBadge status={p.status} /></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-2"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
                    <div className="mt-1 flex justify-between text-[11px] text-muted"><span>{p.stats.done}/{p.stats.total} tasks</span>{p.stats.overdue > 0 && <span className="text-bad">{p.stats.overdue} overdue</span>}{p.dueDate && <span>due {p.dueDate}</span>}</div>
                  </button>
                </li>
              );
            })}
          </ul>
          {current && (
            <div className="space-y-3 min-w-0">
              <div className="panel p-4">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold">{current.name}</h2>
                    {current.objective && <p className="text-sm"><span className="text-muted">Objective:</span> {current.objective}</p>}
                    {current.description && <p className="mt-1 text-sm text-muted whitespace-pre-wrap">{current.description}</p>}
                    <p className="mt-1 text-xs text-muted">Agents: {current.agentIds.map((id) => agents.find((a) => a.id === id)?.name).filter(Boolean).join(", ") || "none assigned"}</p>
                  </div>
                  {canEdit && <Button size="sm" variant="primary" loading={planning === current.id} onClick={() => plan(current)}><Sparkles className="size-3.5" />Ask JARVIS to plan</Button>}
                  {canEdit && <Button size="sm" onClick={() => setEditing(current)}><Pencil className="size-3.5" />Edit</Button>}
                  {canDelete && <Button size="sm" variant="ghost" onClick={() => remove(current)} aria-label="Delete project"><Trash2 className="size-3.5" /></Button>}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                {COLUMNS.map((c) => {
                  const items = cur.filter((t) => c.statuses.includes(t.status));
                  return (
                    <div key={c.key} className="panel p-3">
                      <h3 className="panel-title mb-2">{c.label} ({items.length})</h3>
                      <ul className="space-y-2">
                        {items.map((t) => (
                          <li key={t.id}>
                            <Link href={`/tasks?id=${t.id}`} className="block rounded-lg border border-line bg-bg-2/40 px-3 py-2 hover:border-line-strong">
                              <p className="text-sm line-clamp-2">{t.title}</p>
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted"><span className="truncate">{t.agentName ?? "Manual"}</span>{t.dueDate && <span>· {t.dueDate}</span>}<span className="ml-auto"><StatusBadge status={t.status} /></span></div>
                            </Link>
                          </li>
                        ))}
                        {items.length === 0 && <li className="text-xs text-muted">—</li>}
                      </ul>
                    </div>
                  );
                })}
              </div>
              <Link href="/tasks?new=1" className="text-xs text-accent">+ Add a task (choose this project)</Link>
            </div>
          )}
        </div>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit project" : "New project"}>
        {editing && <ProjectForm initial={editing} agents={agents} onDone={() => { setEditing(null); router.refresh(); }} />}
      </Modal>
    </div>
  );
}
