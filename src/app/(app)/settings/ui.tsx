"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, Lock, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, Dot, ErrorText, Field, Input, PageHeader, Select, StatusBadge, Textarea, Ago } from "@/components/ui";
import { api, toast } from "@/lib/api";
import { VoiceStudio } from "@/components/voice-studio";
import { pickButlerVoice } from "@/components/voice";

type User = { id: string; name: string; email: string; role: string };
type Settings = Record<string, Record<string, unknown>>;
type Health = {
  database: { ok: boolean; error: string | null; latencyMs: number; driver: string };
  worker: { lastHeartbeat: string | null; worker: string | null; healthy: boolean; ageSeconds: number | null };
  jobs: { status: string; n: number }[];
  failedJobs: { id: string; type: string; lastError: string | null; finishedAt: string | null }[];
  usage: { tokensToday: number; costToday: number; tokensMonth: number; costMonth: number };
  budget: { monthlyBudgetUsd: number };
  ai: { provider: string; model: string; demoMode: boolean };
  integrations: { slug: string; name: string; status: string; implementation: string; lastError: string | null; category: string }[];
  knowledgeDocuments: number;
};

const TABS = [
  ["business", "Business profile"],
  ["ai", "AI & models"],
  ["approvals", "Approval rules"],
  ["memory", "Memory"],
  ["voice", "Voice"],
  ["notifications", "Notifications"],
  ["security", "Security & users"],
  ["data", "Data & backup"],
  ["health", "System health"],
  ["audit", "Audit log"],
] as const;

function useSave(key: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (value: unknown) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/settings/${key}`, { method: "PUT", body: value });
      toast("Settings saved");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { save, busy, error };
}

function Form({ settingKey, initial, children }: { settingKey: string; initial: Record<string, unknown>; children: (v: Record<string, unknown>, set: (k: string, val: unknown) => void) => React.ReactNode }) {
  const [v, setV] = useState(initial);
  const { save, busy, error } = useSave(settingKey);
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(v); }} className="space-y-4">
      {children(v, (k, val) => setV((x) => ({ ...x, [k]: val })))}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="primary" loading={busy}>Save</Button>
    </form>
  );
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (b: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}

function VoicePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [voices, setVoices] = useState<string[]>([]);
  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis?.getVoices().map((v) => `${v.name}`) ?? []);
    load();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", load);
  }, []);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Automatic — British male (butler)</option>
      {voices.map((v) => <option key={v}>{v}</option>)}
    </Select>
  );
}

function Users({ me }: { me: User }) {
  const [users, setUsers] = useState<{ id: string; email: string; name: string; role: string; lastLoginAt: string | null }[] | null>(null);
  const load = () => api<{ users: NonNullable<typeof users> }>("/api/users").then((r) => setUsers(r.users)).catch(() => setUsers([]));
  useEffect(() => { load(); }, []);
  if (!users) return null;
  return (
    <ul className="divide-y divide-[var(--line)]">
      {users.map((u) => (
        <li key={u.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
          <span className="min-w-0 flex-1"><span className="font-medium">{u.name}</span> <span className="text-muted">{u.email}</span><span className="block text-[11px] text-muted">last login <Ago d={u.lastLoginAt} /></span></span>
          {me.role === "owner" && u.id !== me.id ? (
            <Select value={u.role} className="!h-8 !w-32 text-xs" aria-label={`Role for ${u.email}`} onChange={async (e) => {
              try { await api(`/api/users/${u.id}`, { method: "PATCH", body: { role: e.target.value } }); toast("Role updated; user must sign in again"); load(); } catch (er) { toast((er as Error).message, "error"); }
            }}>{["owner", "admin", "operator", "viewer"].map((r) => <option key={r}>{r}</option>)}</Select>
          ) : <Badge>{u.role}</Badge>}
        </li>
      ))}
    </ul>
  );
}

function AuditLog() {
  const [rows, setRows] = useState<{ id: number; ts: string; actorType: string; actorId: string | null; action: string; entityType: string | null; entityId: string | null; details: unknown }[]>([]);
  const [verify, setVerify] = useState<{ ok: boolean; checked: number; brokenAt?: number } | null>(null);
  const [error, setError] = useState("");
  const load = async (before?: number, doVerify = false) => {
    try {
      const r = await api<{ entries: typeof rows; verify: typeof verify }>(`/api/audit?${before ? `before=${before}&` : ""}${doVerify ? "verify=1" : ""}`);
      setRows((x) => (before ? [...x, ...r.entries] : r.entries));
      if (r.verify) setVerify(r.verify);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => { load(); }, []);
  if (error) return <ErrorText>{error}</ErrorText>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => load(undefined, true)}><ShieldCheck className="size-3.5" />Verify integrity</Button>
        {verify && (verify.ok ? <Badge tone="ok">Hash chain intact · {verify.checked} entries</Badge> : <Badge tone="bad">Chain broken at entry {verify.brokenAt}</Badge>)}
        <span className="text-xs text-muted">Append-only: the database rejects any update or deletion.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left uppercase tracking-wider text-muted"><tr><th className="py-1">#</th><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody className="font-mono">
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="py-1 pr-2 text-muted">{r.id}</td>
                <td className="pr-2 whitespace-nowrap">{new Date(r.ts).toLocaleString("en-ZA")}</td>
                <td className="pr-2">{r.actorType}</td>
                <td className="pr-2 text-accent">{r.action}</td>
                <td className="pr-2 whitespace-nowrap">{r.entityType}{r.entityId ? `:${r.entityId.slice(0, 8)}` : ""}</td>
                <td className="max-w-md truncate text-muted" title={JSON.stringify(r.details)}>{r.details ? JSON.stringify(r.details) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length >= 100 && <Button size="sm" variant="ghost" onClick={() => load(rows[rows.length - 1].id)}>Load older</Button>}
    </div>
  );
}

function ChangePassword() {
  const [error, setError] = useState("");
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try {
        await api("/api/auth/password", { body: { current: f.get("current"), next: f.get("next") } });
        toast("Password changed — please sign in again");
        window.location.href = "/login";
      } catch (er) { setError((er as Error).message); }
    }}>
      <Field label="Current password"><Input type="password" name="current" required autoComplete="current-password" /></Field>
      <Field label="New password" hint="10+ characters, upper- and lower-case and a number. Signs out all sessions."><Input type="password" name="next" required autoComplete="new-password" /></Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit"><Lock className="size-4" />Change password</Button>
    </form>
  );
}

export function SettingsUI({ tab: initialTab, user, settings, internalActions, consequential, health }: {
  tab: string; user: User; settings: Settings; internalActions: { key: string; label: string; risk: string; description: string }[];
  consequential: { key: string; label: string; risk: string }[]; health: Health;
}) {
  const [tab, setTab] = useState(initialTab);
  const admin = ["owner", "admin"].includes(user.role);
  const s = settings;
  const budgetPct = health.budget.monthlyBudgetUsd ? Math.min(100, (health.usage.costMonth / health.budget.monthlyBudgetUsd) * 100) : 0;
  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure the business, AI, authority rules, memory, voice, security and data." />
      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col scroll-thin pb-1" aria-label="Settings sections">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); window.history.replaceState(null, "", `/settings?tab=${k}`); }} className={clsx("whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm", tab === k ? "bg-accent-soft text-accent" : "text-muted hover:text-fg")}>
              {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {tab === "business" && (
            <Card title="Business profile">
              <Form settingKey="business.profile" initial={s.business}>
                {(v, set) => (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Business name"><Input value={str(v.name)} onChange={(e) => set("name", e.target.value)} /></Field>
                      <Field label="Tagline"><Input value={str(v.tagline)} onChange={(e) => set("tagline", e.target.value)} /></Field>
                      <Field label="Industry / focus"><Input value={str(v.industry)} onChange={(e) => set("industry", e.target.value)} /></Field>
                      <Field label="Country"><Input value={str(v.country)} onChange={(e) => set("country", e.target.value)} /></Field>
                      <Field label="Currency (ISO)"><Input value={str(v.currency)} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></Field>
                      <Field label="Timezone"><Input value={str(v.timezone)} onChange={(e) => set("timezone", e.target.value)} /></Field>
                    </div>
                    <Field label="Description" hint="Shared with every agent as context."><Textarea value={str(v.description)} onChange={(e) => set("description", e.target.value)} /></Field>
                    <Field label="Business goals" hint="JARVIS and the agents prioritise work against these."><Textarea value={str(v.goals)} onChange={(e) => set("goals", e.target.value)} /></Field>
                  </>
                )}
              </Form>
            </Card>
          )}
          {tab === "ai" && (
            <Card title="AI providers & models">
              {!admin ? <p className="text-sm text-muted">Only owners and admins can change AI settings.</p> : (
                <Form settingKey="ai.defaults" initial={s.ai}>
                  {(v, set) => (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Default provider"><Select value={str(v.provider)} onChange={(e) => set("provider", e.target.value)}><option value="anthropic">Anthropic Claude (primary)</option><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option></Select></Field>
                        <Field label="Default agent model"><Input value={str(v.model)} onChange={(e) => set("model", e.target.value)} /></Field>
                        <Field label="JARVIS orchestrator model"><Input value={str(v.orchestratorModel)} onChange={(e) => set("orchestratorModel", e.target.value)} /></Field>
                        <Field label="Default effort" hint="Higher effort = deeper reasoning, more tokens."><Select value={str(v.effort)} onChange={(e) => set("effort", e.target.value)}>{["low", "medium", "high", "xhigh", "max"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
                        <Field label="Embeddings" hint="Re-index the knowledge base after changing this."><Select value={str(v.embeddingProvider)} onChange={(e) => set("embeddingProvider", e.target.value)}><option value="local">Local (offline, free)</option><option value="openai">OpenAI text-embedding-3-small</option></Select></Field>
                        <Field label="Monthly AI budget (USD)" hint="Shown against estimated spend in System health."><Input type="number" min={0} value={str(v.monthlyBudgetUsd)} onChange={(e) => set("monthlyBudgetUsd", Number(e.target.value))} /></Field>
                      </div>
                      <p className="text-xs text-muted">API keys are managed in Integrations. Per-agent overrides are set on each agent. Claude requests enable server-side refusal fallbacks automatically.</p>
                    </>
                  )}
                </Form>
              )}
            </Card>
          )}
          {tab === "approvals" && (
            <div className="space-y-4">
              <Card title="Always requires your approval">
                <p className="mb-3 text-sm text-muted">These actions are hard-wired to the approval queue. They cannot be automated by any setting or agent.</p>
                <div className="flex flex-wrap gap-1.5">{consequential.map((c) => <Badge key={c.key} tone={c.risk === "critical" || c.risk === "high" ? "bad" : "warn"}>{c.label}</Badge>)}</div>
              </Card>
              <Card title="Lower-risk internal actions">
                {!admin ? <p className="text-sm text-muted">Only owners and admins can change approval rules.</p> : (
                  <Form settingKey="approvals.rules" initial={s.rules}>
                    {(v, set) => {
                      const auto = (v.autoApprove ?? {}) as Record<string, boolean>;
                      return (
                        <div className="space-y-2">
                          {internalActions.map((a) => (
                            <Check key={a.key} label={`Run automatically: ${a.label}`} hint={`${a.description} · ${a.risk} risk. Every execution is still recorded in the approval history and audit log.`} checked={!!auto[a.key]} onChange={(b) => set("autoApprove", { ...auto, [a.key]: b })} />
                          ))}
                        </div>
                      );
                    }}
                  </Form>
                )}
              </Card>
            </div>
          )}
          {tab === "memory" && (
            <Card title="Memory & retrieval">
              <Form settingKey="memory.settings" initial={s.memory}>
                {(v, set) => (
                  <>
                    <Check label="Retrieval-augmented generation (agents search knowledge before each task)" checked={!!v.ragEnabled} onChange={(b) => set("ragEnabled", b)} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Excerpts retrieved per task"><Input type="number" min={1} max={20} value={str(v.maxRetrievedChunks)} onChange={(e) => set("maxRetrievedChunks", Number(e.target.value))} /></Field>
                      <Field label="Temporary memory retention (days)" hint="Temporary notes are purged automatically."><Input type="number" min={1} max={365} value={str(v.temporaryRetentionDays)} onChange={(e) => set("temporaryRetentionDays", Number(e.target.value))} /></Field>
                    </div>
                  </>
                )}
              </Form>
            </Card>
          )}
          {tab === "voice" && (
            <Card title="Voice assistant">
              <Form settingKey="voice.settings" initial={s.voice}>
                {(v, set) => (
                  <>
                    <Check label="Enable voice input" checked={!!v.enabled} onChange={(b) => set("enabled", b)} hint="Uses your browser's speech recognition. Audio is processed by the browser vendor's speech service." />
                    <Check label="Speak JARVIS responses to voice instructions" checked={!!v.speakResponses} onChange={(b) => set("speakResponses", b)} />
                    <Field label="Voice engine" hint="Premium needs ElevenLabs connected in Integrations; otherwise the device's built-in British male voice is used.">
                      <Select value={str(v.engine)} onChange={(e) => set("engine", e.target.value)}>
                        <option value="auto">Automatic — premium when connected (recommended)</option>
                        <option value="elevenlabs">Premium only (ElevenLabs)</option>
                        <option value="browser">Device voice only (free)</option>
                      </Select>
                    </Field>
                    {v.engine !== "browser" && (
                      <VoiceStudio
                        settings={v as unknown as Parameters<typeof VoiceStudio>[0]["settings"]}
                        onVoiceChosen={(id, name) => { set("elevenVoiceId", id); set("elevenVoiceName", name); }}
                      />
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Listening language" hint="The accent JARVIS expects when you speak."><Select value={str(v.language)} onChange={(e) => set("language", e.target.value)}>{["en-ZA", "en-GB", "en-US", "en-AU"].map((l) => <option key={l}>{l}</option>)}</Select></Field>
                      <Field label="Device voice (fallback)"><VoicePicker value={str(v.voiceName)} onChange={(x) => set("voiceName", x)} /></Field>
                      <Field label={`Speaking rate (${str(v.rate)})`}><input type="range" min={0.5} max={2} step={0.05} value={Number(v.rate)} onChange={(e) => set("rate", Number(e.target.value))} className="w-full accent-[var(--accent)]" /></Field>
                      <Field label={`Pitch — device voice (${str(v.pitch)})`}><input type="range" min={0} max={2} step={0.02} value={Number(v.pitch)} onChange={(e) => set("pitch", Number(e.target.value))} className="w-full accent-[var(--accent)]" /></Field>
                    </div>
                    <Button type="button" onClick={() => { const u = new SpeechSynthesisUtterance("Good morning. All systems are operational. Shall I begin with today's priorities?"); u.rate = Number(v.rate); u.pitch = Number(v.pitch); const vc = pickButlerVoice(speechSynthesis.getVoices(), str(v.voiceName)); if (vc) { u.voice = vc; u.lang = vc.lang; } speechSynthesis.speak(u); }}>Test device voice</Button>
                    <p className="text-xs text-muted">Remember to press <b>Save</b> after changing the voice.</p>
                  </>
                )}
              </Form>
            </Card>
          )}
          {tab === "notifications" && (
            <Card title="Notifications">
              <Form settingKey="notifications.settings" initial={s.notif}>
                {(v, set) => (
                  <>
                    <Check label="Approval requests" checked={!!v.approvalRequests} onChange={(b) => set("approvalRequests", b)} />
                    <Check label="Task and execution failures" checked={!!v.taskFailures} onChange={(b) => set("taskFailures", b)} />
                    <Check label="Completed work" checked={!!v.taskCompletions} onChange={(b) => set("taskCompletions", b)} />
                    <p className="text-xs text-muted">Delivery to Telegram/email is planned; in-app notifications are active now.</p>
                  </>
                )}
              </Form>
            </Card>
          )}
          {tab === "security" && (
            <div className="space-y-4">
              <Card title="Your account"><p className="mb-3 text-sm">{user.name} · {user.email} · <Badge>{user.role}</Badge></p><ChangePassword /></Card>
              {admin && (
                <Card title="Access">
                  <Form settingKey="auth.settings" initial={s.auth}>
                    {(v, set) => (
                      <>
                        <Check label="Allow new registrations (new users start as viewers)" checked={!!v.allowRegistration} onChange={(b) => set("allowRegistration", b)} />
                        <Field label="Session length (days)"><Input type="number" min={1} max={30} value={str(v.sessionDays)} onChange={(e) => set("sessionDays", Number(e.target.value))} /></Field>
                      </>
                    )}
                  </Form>
                </Card>
              )}
              {admin && <Card title="Users & roles"><p className="mb-2 text-xs text-muted">Owner: everything · Admin: approvals, agents, integrations, settings · Operator: instruct JARVIS, manage tasks, projects, knowledge · Viewer: read-only.</p><Users me={user} /></Card>}
              <Card title="Protections in place">
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                  <li>bcrypt password hashing, account lock-out after 5 failed attempts, hashed server-side sessions in httpOnly cookies</li>
                  <li>Role-based access control on every API route; cross-origin write requests rejected</li>
                  <li>Database-backed rate limiting on login, registration, commands and uploads</li>
                  <li>AES-256-GCM encrypted credentials, never returned to the browser, redacted from logs and agent output</li>
                  <li>Agents can only use tools you grant; consequential actions are approval-only and executed solely by the approval engine</li>
                  <li>Uploaded files, web pages and retrieved knowledge are passed to models as delimited untrusted data</li>
                  <li>Append-only, hash-chained audit log; strict security headers (CSP, HSTS, frame denial)</li>
                </ul>
              </Card>
            </div>
          )}
          {tab === "data" && (
            <div className="space-y-4">
              {user.role === "owner" && (
                <Card title="Backup">
                  <p className="text-sm text-muted">Download a full JSON export of business data (agents, tasks, approvals, knowledge, audit log, settings). Encrypted credentials and password hashes are excluded.</p>
                  <p className="mt-1 text-xs text-muted">Last backup: {s.backup.lastBackupAt ? new Date(String(s.backup.lastBackupAt)).toLocaleString("en-ZA") : "never"}. In production, also enable Supabase point-in-time recovery.</p>
                  <a href="/api/admin/backup" className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg border border-line-strong bg-accent-soft px-4 text-sm"><Download className="size-4" />Download backup</a>
                </Card>
              )}
              <Card title="Your personal data (POPIA / GDPR)">
                <p className="text-sm text-muted">Export the personal information JARVIS holds about you — profile, instructions and activity — as required for data-subject access requests under POPIA section 23.</p>
                <a href="/api/account/export" className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg border border-line-strong bg-accent-soft px-4 text-sm"><Download className="size-4" />Export my data</a>
              </Card>
            </div>
          )}
          {tab === "health" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="panel p-4"><div className="flex items-center gap-2 text-sm"><Dot tone={health.database.ok ? "ok" : "bad"} />Database</div><p className="mt-1 text-xs text-muted">{health.database.driver === "pglite" ? "Embedded Postgres (dev)" : "PostgreSQL"} · {health.database.latencyMs} ms</p>{health.database.error && <p className="text-xs text-bad">{health.database.error}</p>}</div>
                <div className="panel p-4"><div className="flex items-center gap-2 text-sm"><Dot tone={health.worker.healthy ? "ok" : "bad"} />Background worker</div><p className="mt-1 text-xs text-muted">{health.worker.lastHeartbeat ? <>heartbeat <Ago d={health.worker.lastHeartbeat} /></> : "no heartbeat recorded"}</p></div>
                <div className="panel p-4"><div className="flex items-center gap-2 text-sm"><Dot tone={health.ai.demoMode ? "warn" : health.integrations.find((i) => i.slug === health.ai.provider)?.status === "not_configured" ? "bad" : "ok"} />Agent service</div><p className="mt-1 text-xs text-muted">{health.ai.demoMode ? "DEMO mode" : `${health.ai.provider} · ${health.ai.model}`}</p></div>
                <div className="panel p-4"><div className="flex items-center gap-2 text-sm"><Dot tone={health.failedJobs.length ? "warn" : "ok"} />Jobs</div><p className="mt-1 text-xs text-muted">{health.jobs.map((j) => `${j.n} ${j.status}`).join(" · ") || "none"}</p></div>
              </div>
              <Card title="AI token consumption & estimated cost">
                <div className="grid gap-3 sm:grid-cols-4 text-sm">
                  <div><div className="text-xs text-muted">Tokens today</div><div className="text-lg tabular-nums">{health.usage.tokensToday.toLocaleString()}</div></div>
                  <div><div className="text-xs text-muted">Cost today (est.)</div><div className="text-lg tabular-nums">${health.usage.costToday.toFixed(2)}</div></div>
                  <div><div className="text-xs text-muted">Tokens this month</div><div className="text-lg tabular-nums">{health.usage.tokensMonth.toLocaleString()}</div></div>
                  <div><div className="text-xs text-muted">Cost this month (est.)</div><div className="text-lg tabular-nums">${health.usage.costMonth.toFixed(2)} <span className="text-xs text-muted">/ ${health.budget.monthlyBudgetUsd}</span></div></div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-2"><div className={clsx("h-full", budgetPct > 90 ? "bg-bad" : budgetPct > 70 ? "bg-warn" : "bg-accent")} style={{ width: `${budgetPct}%` }} /></div>
                <p className="mt-1 text-[11px] text-muted">Estimates use list prices × recorded tokens; your provider invoice is authoritative.</p>
              </Card>
              <Card title="Integration status">
                <ul className="grid gap-1.5 sm:grid-cols-2 text-sm">
                  {health.integrations.map((i) => <li key={i.slug} className="flex items-center gap-2"><span className="flex-1 truncate">{i.name}</span>{i.implementation === "planned" && <Badge>planned</Badge>}<StatusBadge status={i.status} /></li>)}
                </ul>
              </Card>
              <Card title="Failed jobs">
                {health.failedJobs.length === 0 ? <p className="text-sm text-muted">No failed background jobs.</p> : (
                  <ul className="space-y-1 text-sm">{health.failedJobs.map((j) => <li key={j.id}><code className="text-xs">{j.type}</code> · <Ago d={j.finishedAt} /> · <span className="text-bad">{j.lastError}</span></li>)}</ul>
                )}
              </Card>
            </div>
          )}
          {tab === "audit" && <Card title="Immutable audit log">{admin ? <AuditLog /> : <p className="text-sm text-muted">Only owners and admins can view the audit log.</p>}</Card>}
        </div>
      </div>
    </div>
  );
}
