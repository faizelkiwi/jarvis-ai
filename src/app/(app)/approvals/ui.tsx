"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, MessageSquareWarning, RotateCcw, ShieldCheck, X } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, Button, EmptyState, PageHeader, StatusBadge, Textarea, Ago } from "@/components/ui";
import { api, toast } from "@/lib/api";

type A = {
  id: string; action: string; actionLabel: string; title: string; agentName: string | null; taskId: string | null; taskTitle: string | null;
  reason: string; expectedOutcome: string; risks: string; riskLevel: string; payload: Record<string, unknown>; status: string;
  decisionNote: string | null; decidedAt: string | null; executionResult: { ok: boolean; message: string } | null; createdAt: string;
};

function PayloadView({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(([k]) => !k.startsWith("_"));
  if (!entries.length) return <p className="text-sm text-muted">No data</p>;
  return (
    <dl className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[11px] uppercase tracking-wider text-muted">{k.replace(/_/g, " ")}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap break-words rounded-md border border-line bg-bg-2/50 px-2.5 py-1.5 text-sm max-h-80 overflow-y-auto scroll-thin">
            {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ApprovalCard({ a, canDecide, focused }: { a: A; canDecide: boolean; focused: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<null | "changes" | "reject">(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (focused) document.getElementById(`ap-${a.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focused, a.id]);

  async function decide(decision: "approve" | "reject" | "request_changes") {
    setBusy(decision);
    try {
      const r = await api<{ status: string; result?: { ok: boolean; message: string } }>(`/api/approvals/${a.id}`, { body: { decision, note: note || undefined } });
      if (decision === "approve") toast(r.result?.ok ? `Executed: ${r.result.message}` : `Approved, but execution failed: ${r.result?.message}`, r.result?.ok ? "ok" : "error");
      else toast(decision === "reject" ? "Rejected — nothing was executed" : "Sent back to the agent for changes");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }
  async function retry() {
    setBusy("retry");
    try {
      const r = await api<{ result: { ok: boolean; message: string } }>(`/api/approvals/${a.id}/retry`, { body: {} });
      toast(r.result.message, r.result.ok ? "ok" : "error");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }
  const pending = a.status === "pending";
  return (
    <article id={`ap-${a.id}`} className={clsx("panel p-4", pending && "!border-warn/40", focused && "ring-2 ring-accent")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={a.riskLevel === "critical" || a.riskLevel === "high" ? "bad" : a.riskLevel === "medium" ? "warn" : "neutral"}>{a.riskLevel} risk</Badge>
        <span className="text-xs font-medium text-accent">{a.actionLabel}</span>
        <StatusBadge status={a.status} />
        <span className="ml-auto text-xs text-muted"><Ago d={a.createdAt} /></span>
      </div>
      <h3 className="mt-2 font-semibold break-words">{a.title}</h3>
      <p className="mt-0.5 text-xs text-muted">
        Requested by <span className="text-fg">{a.agentName ?? "Workflow"}</span>
        {a.taskId && (
          <> · task <Link className="text-accent hover:underline" href={`/tasks?id=${a.taskId}`}>{a.taskTitle ?? "view"}</Link></>
        )}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm">
        <div><div className="text-[11px] uppercase tracking-wider text-muted">Reason</div><p className="mt-0.5 whitespace-pre-wrap">{a.reason}</p></div>
        <div><div className="text-[11px] uppercase tracking-wider text-muted">Expected outcome</div><p className="mt-0.5 whitespace-pre-wrap">{a.expectedOutcome}</p></div>
        <div><div className="text-[11px] uppercase tracking-wider text-muted">Potential risks</div><p className="mt-0.5 whitespace-pre-wrap text-warn">{a.risks}</p></div>
      </div>
      <details className="mt-3" open={pending}>
        <summary className="cursor-pointer text-xs text-muted hover:text-fg">Content & data</summary>
        <div className="mt-2"><PayloadView payload={a.payload} /></div>
      </details>
      {a.decisionNote && <p className="mt-3 text-sm"><span className="text-muted">Decision note:</span> {a.decisionNote}</p>}
      {a.executionResult && (
        <p className={clsx("mt-2 rounded-md border px-2.5 py-1.5 text-sm", a.executionResult.ok ? "border-ok/30 bg-ok/5 text-ok" : "border-bad/30 bg-bad/5 text-bad")}>
          {a.executionResult.ok ? "Executed: " : "Not executed: "}
          {a.executionResult.message}
        </p>
      )}
      {pending && canDecide && (
        <div className="mt-4 space-y-2">
          {mode && (
            <Textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={mode === "changes" ? "Describe the changes you want…" : "Optional reason for rejecting"}
              className="min-h-16"
              maxLength={2000}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {!mode && (
              <>
                <Button variant="success" onClick={() => decide("approve")} loading={busy === "approve"}><Check className="size-4" />Approve</Button>
                <Button variant="secondary" onClick={() => setMode("changes")}><MessageSquareWarning className="size-4" />Request changes</Button>
                <Button variant="danger" onClick={() => setMode("reject")}><X className="size-4" />Reject</Button>
              </>
            )}
            {mode === "changes" && <Button variant="primary" disabled={!note.trim()} loading={busy === "request_changes"} onClick={() => decide("request_changes")}>Send back to agent</Button>}
            {mode === "reject" && <Button variant="danger" loading={busy === "reject"} onClick={() => decide("reject")}>Confirm reject</Button>}
            {mode && <Button variant="ghost" onClick={() => { setMode(null); setNote(""); }}>Cancel</Button>}
          </div>
        </div>
      )}
      {pending && !canDecide && <p className="mt-3 text-xs text-muted">Only owners and admins can decide approvals.</p>}
      {a.status === "execution_failed" && canDecide && (
        <Button className="mt-3" size="sm" onClick={retry} loading={busy === "retry"}><RotateCcw className="size-3.5" />Retry execution</Button>
      )}
    </article>
  );
}

export function ApprovalsUI({ items, canDecide, focusId }: { items: A[]; canDecide: boolean; focusId: string | null }) {
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const pending = items.filter((i) => i.status === "pending");
  const history = items.filter((i) => i.status !== "pending");
  useEffect(() => {
    if (focusId && history.some((h) => h.id === focusId)) setTab("history");
  }, [focusId]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = tab === "pending" ? pending : history;
  return (
    <div>
      <AutoRefresh ms={10000} />
      <PageHeader
        title="Approval Queue"
        subtitle="Consequential actions never run without your decision. Every decision is recorded in the immutable audit log."
      />
      <div className="mb-4 inline-flex rounded-lg border border-line p-1" role="tablist">
        {(["pending", "history"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={clsx("rounded-md px-3 py-1.5 text-sm capitalize", tab === t ? "bg-accent-soft text-accent" : "text-muted")}>
            {t} {t === "pending" ? `(${pending.length})` : `(${history.length})`}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="panel"><EmptyState icon={<ShieldCheck className="size-8" />} title={tab === "pending" ? "Nothing awaiting approval" : "No decisions yet"}>Agents file requests here when they want to publish, send, spend or trigger anything external.</EmptyState></div>
      ) : (
        <div className="space-y-3">{list.map((a) => <ApprovalCard key={a.id} a={a} canDecide={canDecide} focused={focusId === a.id} />)}</div>
      )}
    </div>
  );
}
