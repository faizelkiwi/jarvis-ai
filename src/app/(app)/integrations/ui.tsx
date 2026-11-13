"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, KeyRound, Plug, Trash2, Zap } from "lucide-react";
import { Badge, Button, ErrorText, Field, Input, Modal, PageHeader, StatusBadge, Ago } from "@/components/ui";
import { api, toast } from "@/lib/api";

type FieldDef = { key: string; label: string; secret: boolean; placeholder?: string; help?: string };
type I = {
  slug: string; name: string; category: string; description: string; implementation: "live" | "planned"; authType: string; fields: FieldDef[];
  actions: string[]; docsUrl: string; note?: string; enabled: boolean; status: string; lastCheckedAt: string | null; lastError: string | null;
  config: Record<string, string>; configuredSecrets: string[]; envManaged: boolean; envVar?: string;
};

function Configure({ i, onDone }: { i: I; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(i.fields.filter((f) => !f.secret).map((f) => [f.key, i.config[f.key] ?? ""])));
  const [enabled, setEnabled] = useState(i.enabled || i.category === "AI Providers" || i.category === "Voice");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState("");
  async function save() {
    setBusy("save");
    setError("");
    try {
      await api(`/api/integrations/${i.slug}`, { method: "PUT", body: { enabled, values } });
      toast(`${i.name} saved`);
      setValues((v) => Object.fromEntries(Object.entries(v).filter(([k]) => !i.fields.find((f) => f.key === k)?.secret)));
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function test() {
    setBusy("test");
    try {
      setResult(await api(`/api/integrations/${i.slug}/test`, { body: {} }));
      onDone();
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setBusy("");
    }
  }
  async function remove() {
    if (!confirm(`Remove stored credentials for ${i.name}?`)) return;
    await api(`/api/integrations/${i.slug}`, { method: "DELETE" });
    toast("Credentials removed");
    onDone();
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{i.description}</p>
      {i.implementation === "planned" && (
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
          This connector&apos;s OAuth flow and API calls are not implemented yet. You can store credentials securely now; actions that need it will report “not implemented” honestly instead of pretending to succeed.
        </p>
      )}
      {i.note && <p className="text-xs text-muted">{i.note}</p>}
      {i.envManaged && <p className="rounded-lg border border-line px-3 py-2 text-xs">The API key is supplied by the <code>{i.envVar}</code> environment variable, which takes precedence over a key saved here.</p>}
      {i.fields.map((f) => (
        <Field key={f.key} label={f.label} hint={f.help}>
          <Input
            type={f.secret ? "password" : "text"}
            autoComplete="off"
            value={values[f.key] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            placeholder={f.secret && i.configuredSecrets.includes(f.key) ? "•••••••• stored — enter a new value to replace" : f.placeholder}
          />
        </Field>
      ))}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--accent)]" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Enabled (allow approved actions to use this integration)</label>
      <p className="flex items-center gap-1.5 text-[11px] text-muted"><KeyRound className="size-3" />Secrets are encrypted with AES-256-GCM on the server and are never sent back to the browser or shown to agents.</p>
      {result && <p className={`rounded-lg border px-3 py-2 text-sm ${result.ok ? "border-ok/30 bg-ok/10 text-ok" : "border-bad/30 bg-bad/10 text-bad"}`}>{result.message}</p>}
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={save} loading={busy === "save"}>Save</Button>
        <Button onClick={test} loading={busy === "test"}><Zap className="size-4" />Test connection</Button>
        {i.configuredSecrets.length > 0 && <Button variant="danger" onClick={remove}><Trash2 className="size-4" />Remove credentials</Button>}
        <a href={i.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-center text-xs text-accent">Setup guide <ExternalLink className="size-3" /></a>
      </div>
    </div>
  );
}

export function IntegrationsUI({ items, canEdit }: { items: I[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const cats = [...new Set(items.map((i) => i.category))];
  const current = items.find((i) => i.slug === open);
  return (
    <div>
      <PageHeader title="Integrations" subtitle="Connect AI providers and business services through official APIs. Status reflects real connection checks — nothing is simulated." />
      <div className="space-y-6">
        {cats.map((c) => (
          <section key={c}>
            <h2 className="panel-title mb-2">{c}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.filter((i) => i.category === c).map((i) => (
                <div key={i.slug} className="panel flex flex-col p-4">
                  <div className="flex items-start gap-2">
                    <Plug className="mt-0.5 size-4 text-accent" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium">{i.name}</h3>
                      <p className="text-xs text-muted line-clamp-2">{i.description}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={i.status} />
                    <Badge tone={i.implementation === "live" ? "accent" : "neutral"}>{i.implementation === "live" ? "connector ready" : "planned"}</Badge>
                    {i.status !== "not_configured" && !i.enabled && i.category !== "AI Providers" && i.category !== "Voice" && <Badge tone="warn">disabled</Badge>}
                    {i.actions.length > 0 && <Badge tone="warn">approval-gated actions</Badge>}
                  </div>
                  {i.lastError && <p className="mt-2 text-xs text-bad line-clamp-2">{i.lastError}</p>}
                  {i.lastCheckedAt && <p className="mt-1 text-[11px] text-muted">Checked <Ago d={i.lastCheckedAt} /></p>}
                  <div className="mt-auto pt-3">
                    <Button size="sm" onClick={() => setOpen(i.slug)} disabled={!canEdit}>{i.status === "not_configured" ? "Configure" : "Manage"}</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {!canEdit && <p className="mt-4 text-xs text-muted">Only owners and admins can configure integrations.</p>}
      <Modal open={!!current} onClose={() => setOpen(null)} title={current?.name ?? ""}>
        {current && <Configure key={current.slug + current.status + current.configuredSecrets.join()} i={current} onDone={() => router.refresh()} />}
      </Modal>
    </div>
  );
}
