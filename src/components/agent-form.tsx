"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { AGENT_COLORS, AGENT_ICON_NAMES, AgentIcon } from "@/components/agent-icon";
import { Badge, Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { api, toast } from "@/lib/api";

export type AgentData = {
  id?: string; slug: string; name: string; title: string; description: string; responsibilities: string[]; systemPrompt: string;
  provider: string | null; model: string | null; effort: string | null; active: boolean; permissions: string[]; canDelegateTo: string[];
  knowledgeScopes: string[]; color: string; icon: string; isSystem?: boolean;
};
type Tool = { name: string; category: string; description: string };

const CAT_LABEL: Record<string, string> = { read: "Read", internal: "Internal (rule-based)", server: "Web research", consequential: "Requires approval" };

export function AgentForm({ initial, tools, agents, projects, projectIds, canEdit }: { initial: AgentData; tools: Tool[]; agents: { slug: string; name: string }[]; projects: { id: string; name: string }[]; projectIds: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [a, setA] = useState(initial);
  const [proj, setProj] = useState(projectIds);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isNew = !initial.id;
  const set = <K extends keyof AgentData>(k: K, v: AgentData[K]) => setA((x) => ({ ...x, [k]: v }));
  const toggle = (k: "permissions" | "canDelegateTo", v: string) => set(k, a[k].includes(v) ? a[k].filter((x) => x !== v) : [...a[k], v]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { ...a, provider: a.provider || null, model: a.model || null, effort: a.effort || null, projectIds: proj };
      delete (body as Partial<AgentData>).id;
      delete (body as Partial<AgentData>).isSystem;
      if (isNew) {
        const r = await api<{ agent: { id: string } }>("/api/agents", { body });
        toast("Agent created");
        router.push(`/agents/${r.agent.id}`);
      } else {
        await api(`/api/agents/${initial.id}`, { method: "PATCH", body });
        toast("Agent saved");
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm(`Delete ${a.name}? Its task history is kept but unassigned. This cannot be undone.`)) return;
    try {
      await api(`/api/agents/${initial.id}`, { method: "DELETE" });
      toast("Agent deleted");
      router.push("/agents");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const grouped = ["read", "internal", "server", "consequential"].map((c) => ({ c, tools: tools.filter((t) => t.category === c) }));
  return (
    <fieldset disabled={!canEdit} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={a.name} onChange={(e) => set("name", e.target.value)} maxLength={100} /></Field>
        <Field label="Slug (identifier)" hint={isNew ? "lowercase-with-dashes" : "Fixed after creation"}>
          <Input value={a.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} disabled={!isNew} maxLength={40} />
        </Field>
        <Field label="Title"><Input value={a.title} onChange={(e) => set("title", e.target.value)} maxLength={100} /></Field>
        <div className="flex items-end gap-3">
          <Field label="Icon" className="flex-1"><Select value={a.icon} onChange={(e) => set("icon", e.target.value)}>{AGENT_ICON_NAMES.map((i) => <option key={i}>{i}</option>)}</Select></Field>
          <Field label="Colour" className="flex-1"><Select value={a.color} onChange={(e) => set("color", e.target.value)}>{AGENT_COLORS.map((i) => <option key={i}>{i}</option>)}</Select></Field>
          <AgentIcon icon={a.icon} color={a.color} />
        </div>
      </div>
      <Field label="Profile / description"><Textarea value={a.description} onChange={(e) => set("description", e.target.value)} className="min-h-16" maxLength={1000} /></Field>
      <Field label="Responsibilities (one per line)">
        <Textarea value={a.responsibilities.join("\n")} onChange={(e) => set("responsibilities", e.target.value.split("\n").map((s) => s.trimStart()).filter((s, i, arr) => s || i === arr.length - 1))} />
      </Field>
      <Field label="System instructions" hint="JARVIS always appends its operating rules (approval authority, untrusted-content handling, honesty).">
        <Textarea value={a.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} className="min-h-40 font-mono text-xs" maxLength={20000} />
      </Field>

      <div>
        <h3 className="panel-title mb-2">AI model configuration</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Provider"><Select value={a.provider ?? ""} onChange={(e) => set("provider", e.target.value || null)}><option value="">Global default</option><option value="anthropic">Anthropic Claude</option><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option></Select></Field>
          <Field label="Model" hint="Empty = global default"><Input value={a.model ?? ""} onChange={(e) => set("model", e.target.value)} placeholder="e.g. claude-opus-5-5" /></Field>
          <Field label="Effort"><Select value={a.effort ?? ""} onChange={(e) => set("effort", e.target.value || null)}><option value="">Global default</option>{["low", "medium", "high", "xhigh", "max"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
        </div>
      </div>

      <div>
        <h3 className="panel-title mb-2">Permissions (tools)</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {grouped.map(({ c, tools }) => (
            <div key={c} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium">{CAT_LABEL[c]} {c === "consequential" && <Badge tone="warn">human approval</Badge>}</div>
              <div className="space-y-1.5">
                {tools.map((t) => (
                  <label key={t.name} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={a.permissions.includes(t.name)} onChange={() => toggle("permissions", t.name)} className="mt-1 accent-[var(--accent)]" />
                    <span><code className="text-xs">{t.name}</code><span className="block text-xs text-muted">{t.description.replace(/ REQUIRES HUMAN APPROVAL.*$/, "")}</span></span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-line p-3">
          <h3 className="panel-title mb-2">Can delegate to / communicate with</h3>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {agents.filter((x) => x.slug !== a.slug).map((x) => (
              <label key={x.slug} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.canDelegateTo.includes(x.slug)} onChange={() => toggle("canDelegateTo", x.slug)} className="accent-[var(--accent)]" />{x.name}</label>
            ))}
          </div>
          {a.canDelegateTo.length > 0 && !a.permissions.includes("delegate_task") && <p className="mt-2 text-xs text-warn">Enable the delegate_task permission for delegation to work.</p>}
        </div>
        <div className="rounded-lg border border-line p-3 space-y-3">
          <Field label="Knowledge sources (categories, comma-separated; * = all)">
            <Input value={a.knowledgeScopes.join(", ")} onChange={(e) => set("knowledgeScopes", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
          </Field>
          <div>
            <div className="text-xs font-medium text-muted mb-1">Assigned projects</div>
            {projects.length === 0 ? <p className="text-xs text-muted">No projects yet.</p> : projects.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={proj.includes(p.id)} onChange={() => setProj((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))} className="accent-[var(--accent)]" />{p.name}</label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.active} onChange={(e) => set("active", e.target.checked)} className="accent-[var(--accent)]" /> Active (available for delegation)</label>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={save} loading={busy}>{isNew ? "Create agent" : "Save changes"}</Button>
          {!isNew && <Button variant="danger" onClick={remove}><Trash2 className="size-4" />Delete agent</Button>}
        </div>
      )}
      {!canEdit && <p className="text-xs text-muted">Only owners and admins can modify agents.</p>}
    </fieldset>
  );
}
