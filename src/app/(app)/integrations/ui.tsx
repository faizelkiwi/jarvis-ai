"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
      {i.authType === "oauth" && i.implementation === "live" && (
        <div className="space-y-2 rounded-lg border border-line p-3">
          <div className="text-xs text-muted">Authorised redirect URI (paste this into Google Cloud):</div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-bg-2/60 px-2 py-1 text-xs">{typeof window !== "undefined" ? `${window.location.origin}/api/integrations/${i.slug}/callback` : ""}</code>
            <Button size="sm" type="button" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/api/integrations/${i.slug}/callback`); toast("Copied"); }}>Copy</Button>
          </div>
          {i.config.connectedAccount ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ok">✓ Connected to {i.config.connectedAccount}</span>
              <Button size="sm" variant="danger" type="button" onClick={async () => { if (!confirm("Disconnect Google? JARVIS will lose access until you reconnect.")) return; await api(`/api/integrations/${i.slug}/connect`, { method: "DELETE" }); toast("Disconnected"); onDone(); }}>Disconnect</Button>
            </div>
          ) : (
            <a
              href={i.configuredSecrets.includes("clientSecret") && i.config.clientId ? `/api/integrations/${i.slug}/connect` : undefined}
              onClick={(e) => { if (!(i.configuredSecrets.includes("clientSecret") && i.config.clientId)) { e.preventDefault(); toast("Save the client ID and secret first", "error"); } }}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-[#1f1f1f] shadow"
            >
              <svg viewBox="0 0 48 48" className="size-4" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              Connect with Google
            </a>
          )}
        </div>
      )}
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
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("connected")) {
      toast(`${q.get("connected") === "gmail" ? "Gmail" : q.get("connected")} connected`);
      setOpen(q.get("connected"));
    }
    if (q.get("oauth_error")) {
      const e = q.get("oauth_error")!;
      toast(
        e === "access_denied" ? "Google access was not granted." : e === "state_mismatch" ? "The sign-in link expired. Please try Connect with Google again." : e === "no_refresh_token" ? "Google didn't return offline access. Remove JARVIS at myaccount.google.com/permissions and connect again." : `Google sign-in failed: ${e}`,
        "error",
      );
    }
    if (q.get("connected") || q.get("oauth_error")) window.history.replaceState(null, "", "/integrations");
  }, []);
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
