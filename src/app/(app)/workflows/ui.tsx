"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Bot, Pencil, Play, Plug, Plus, ShieldCheck, Trash2, Workflow as WfIcon } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, Button, EmptyState, ErrorText, Field, Input, Modal, PageHeader, Select, StatusBadge, Textarea, Ago } from "@/components/ui";
import { api, toast } from "@/lib/api";

type Step =
  | { id: string; type: "agent"; agentSlug: string; instruction: string }
  | { id: string; type: "approval"; title: string; instruction?: string }
  | { id: string; type: "integration"; action: string; instruction: string; params?: Record<string, string> };
type Wf = { id: string; name: string; description: string; steps: Step[]; active: boolean; runs: { id: string; status: string; createdAt: string; input: string }[] };
type AgentOpt = { slug: string; name: string; active: boolean };
type Act = { value: string; label: string };

const uid = () => Math.random().toString(36).slice(2, 9);

const TEMPLATE: Omit<Wf, "id" | "runs"> = {
  name: "Content publishing pipeline",
  description: "Research → Marketing angle → Content draft → your approval → publish → performance review.",
  active: true,
  steps: [
    { id: uid(), type: "agent", agentSlug: "research", instruction: "Research the topic and audience. List the 5 most promising content angles with sources." },
    { id: uid(), type: "agent", agentSlug: "marketing", instruction: "Choose the strongest angle and define the hook, audience, offer and call to action." },
    { id: uid(), type: "agent", agentSlug: "content", instruction: "Write the final Facebook post (max 120 words) plus 3 hashtag options. Output only the post." },
    { id: uid(), type: "integration", action: "publish_social_post", instruction: "Publish the approved post", params: { platform: "facebook" } },
    { id: uid(), type: "agent", agentSlug: "social-media", instruction: "Prepare a checklist for monitoring engagement on the published post over the next 7 days." },
  ],
};

function StepChip({ s, agents, actions }: { s: Step; agents: AgentOpt[]; actions: Act[] }) {
  const label = s.type === "agent" ? agents.find((a) => a.slug === s.agentSlug)?.name ?? s.agentSlug : s.type === "approval" ? s.title : actions.find((a) => a.value === s.action)?.label ?? s.action;
  const Icon = s.type === "agent" ? Bot : s.type === "approval" ? ShieldCheck : Plug;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs", s.type === "agent" ? "border-line-strong bg-accent-soft" : "border-warn/40 bg-warn/10 text-warn")}>
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

function Builder({ initial, agents, actions, onSaved }: { initial: Partial<Wf>; agents: AgentOpt[]; actions: Act[]; onSaved: () => void }) {
  const [name, setName] = useState(initial.name ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [active, setActive] = useState(initial.active ?? true);
  const [steps, setSteps] = useState<Step[]>(initial.steps ?? []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (i: number, s: Step) => setSteps((x) => x.map((y, j) => (j === i ? s : y)));
  const move = (i: number, d: -1 | 1) => setSteps((x) => {
    const y = [...x];
    [y[i], y[i + d]] = [y[i + d], y[i]];
    return y;
  });
  const add = (type: Step["type"]) =>
    setSteps((x) => [
      ...x,
      type === "agent"
        ? { id: uid(), type, agentSlug: agents.find((a) => a.active)?.slug ?? "", instruction: "" }
        : type === "approval"
          ? { id: uid(), type, title: "Review before continuing" }
          : { id: uid(), type, action: actions[0]?.value ?? "", instruction: "", params: {} },
    ]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { name, description, active, steps };
      if (initial.id) await api(`/api/workflows/${initial.id}`, { method: "PUT", body });
      else await api("/api/workflows", { body });
      toast("Workflow saved");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></Field>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[var(--accent)]" />Active</label>
      </div>
      <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-14" /></Field>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <Fragment key={s.id}>
            <div className="rounded-lg border border-line p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{i + 1}</span>
                <Select value={s.type} onChange={(e) => {
                  const t = e.target.value as Step["type"];
                  update(i, t === "agent" ? { id: s.id, type: t, agentSlug: agents[0]?.slug ?? "", instruction: "" } : t === "approval" ? { id: s.id, type: t, title: "Review before continuing" } : { id: s.id, type: t, action: actions[0].value, instruction: "", params: {} });
                }} className="!h-8 !w-44 text-xs" aria-label="Step type">
                  <option value="agent">Agent step</option>
                  <option value="approval">Approval checkpoint</option>
                  <option value="integration">External action (approval)</option>
                </Select>
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} aria-label="Remove step"><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
              {s.type === "agent" && (
                <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
                  <Select value={s.agentSlug} onChange={(e) => update(i, { ...s, agentSlug: e.target.value })} aria-label="Agent">
                    {agents.map((a) => <option key={a.slug} value={a.slug}>{a.name}{a.active ? "" : " (inactive)"}</option>)}
                  </Select>
                  <Textarea value={s.instruction} onChange={(e) => update(i, { ...s, instruction: e.target.value })} placeholder="Instruction for this agent. It receives the previous step's output." className="min-h-16" />
                </div>
              )}
              {s.type === "approval" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input value={s.title} onChange={(e) => update(i, { ...s, title: e.target.value })} placeholder="Checkpoint title" />
                  <Input value={s.instruction ?? ""} onChange={(e) => update(i, { ...s, instruction: e.target.value })} placeholder="What should you check? (optional)" />
                </div>
              )}
              {s.type === "integration" && (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select value={s.action} onChange={(e) => update(i, { ...s, action: e.target.value })} aria-label="Action">{actions.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</Select>
                    <Input value={s.instruction} onChange={(e) => update(i, { ...s, instruction: e.target.value })} placeholder="Description shown in the approval request" />
                  </div>
                  <Input
                    value={Object.entries(s.params ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")}
                    onChange={(e) => update(i, { ...s, params: Object.fromEntries(e.target.value.split(",").map((p) => p.split("=").map((x) => x.trim())).filter((p) => p[0] && p[1] !== undefined)) })}
                    placeholder="Fixed parameters, e.g. platform=facebook  or  to=client@example.com, subject=Update"
                  />
                  <p className="text-[11px] text-muted">The previous step&apos;s output is passed as <code>content</code>. This step always waits for your approval before executing.</p>
                </div>
              )}
            </div>
            {i < steps.length - 1 && <ArrowDown className="mx-auto size-4 text-muted" />}
          </Fragment>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => add("agent")}><Bot className="size-3.5" />Add agent step</Button>
        <Button size="sm" onClick={() => add("approval")}><ShieldCheck className="size-3.5" />Add approval checkpoint</Button>
        <Button size="sm" onClick={() => add("integration")}><Plug className="size-3.5" />Add external action</Button>
      </div>
      <ErrorText>{error}</ErrorText>
      <Button variant="primary" onClick={save} loading={busy} disabled={!name || !steps.length}>Save workflow</Button>
    </div>
  );
}

export function WorkflowsUI({ workflows, agents, actions, canEdit, canRun }: { workflows: Wf[]; agents: AgentOpt[]; actions: Act[]; canEdit: boolean; canRun: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<Wf> | null>(null);
  const [running, setRunning] = useState<Wf | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!running) return;
    setBusy(true);
    try {
      await api(`/api/workflows/${running.id}/run`, { body: { input } });
      toast("Workflow started — steps appear in Tasks as they run");
      setRunning(null);
      setInput("");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function remove(w: Wf) {
    if (!confirm(`Delete workflow "${w.name}"?`)) return;
    try {
      await api(`/api/workflows/${w.id}`, { method: "DELETE" });
      toast("Workflow deleted");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }
  return (
    <div>
      <AutoRefresh ms={10000} />
      <PageHeader
        title="Workflows"
        subtitle="Chain agents, approval checkpoints and external actions. Each step runs as a real task; external actions always wait for approval."
        actions={canEdit && (
          <>
            <Button onClick={() => setEditing({ ...TEMPLATE, steps: TEMPLATE.steps.map((s) => ({ ...s, id: uid() })) })}>Use template</Button>
            <Button variant="primary" onClick={() => setEditing({ steps: [] })}><Plus className="size-4" />New workflow</Button>
          </>
        )}
      />
      {workflows.length === 0 ? (
        <div className="panel"><EmptyState icon={<WfIcon className="size-8" />} title="No workflows yet">Start from the content pipeline template or build your own.</EmptyState></div>
      ) : (
        <div className="space-y-3">
          {workflows.map((w) => (
            <div key={w.id} className="panel p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{w.name} {!w.active && <Badge>inactive</Badge>}</h3>
                  {w.description && <p className="text-sm text-muted">{w.description}</p>}
                </div>
                {canRun && <Button size="sm" variant="primary" disabled={!w.active} onClick={() => setRunning(w)}><Play className="size-3.5" />Run</Button>}
                {canEdit && <Button size="sm" onClick={() => setEditing(w)}><Pencil className="size-3.5" />Edit</Button>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => remove(w)} aria-label="Delete workflow"><Trash2 className="size-3.5" /></Button>}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {w.steps.map((s, i) => (
                  <Fragment key={s.id}>
                    <StepChip s={s} agents={agents} actions={actions} />
                    {i < w.steps.length - 1 && <ArrowRight className="size-3.5 text-muted" />}
                  </Fragment>
                ))}
              </div>
              {w.runs.length > 0 && (
                <div className="mt-3 border-t border-line pt-2">
                  <p className="mb-1 text-[11px] uppercase tracking-wider text-muted">Recent runs</p>
                  <ul className="flex flex-wrap gap-2">
                    {w.runs.map((r) => <li key={r.id} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs"><StatusBadge status={r.status} /><Ago d={r.createdAt} /></li>)}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit workflow" : "New workflow"} wide>
        {editing && <Builder initial={editing} agents={agents} actions={actions} onSaved={() => { setEditing(null); router.refresh(); }} />}
      </Modal>
      <Modal open={!!running} onClose={() => setRunning(null)} title={`Run: ${running?.name ?? ""}`}>
        <div className="space-y-3">
          <Field label="Input for this run (optional)" hint="Topic, product or brief passed to the first step.">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} maxLength={10000} />
          </Field>
          <Button variant="primary" onClick={run} loading={busy}><Play className="size-4" />Start workflow</Button>
        </div>
      </Modal>
    </div>
  );
}
