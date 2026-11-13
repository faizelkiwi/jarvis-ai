"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorText, Field, Input, Modal, PageHeader, Select, Stat } from "@/components/ui";
import { api, toast } from "@/lib/api";
import { money } from "@/lib/format";

type Data = {
  days: number;
  byStatus: { status: string; n: number }[];
  byAgent: { agent: string; completed: number; failed: number; total: number; avgSeconds: number }[];
  daily: { day: string; created: number; completed: number; failed: number }[];
  runs: { status: string; n: number }[];
  usageByDay: { day: string; cost: number; tokens: number }[];
  usageByAgent: { agent: string; cost: number; tokens: number }[];
  tx: { month: string; type: string; currency: string; total: number }[];
  approvalsByStatus: { status: string; n: number }[];
  expensesByCategory: { category: string; total: number }[];
};
type Tx = { id: string; date: string; description: string; amount: string; currency: string; type: string; category: string; source: string };

/** Validated categorical palette (dataviz validator: dark vs #0a1830, light vs white). */
function usePalette() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme ?? "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  const dark = theme === "dark";
  return {
    s1: "#0891b2",
    s2: dark ? "#8b5cf6" : "#7c3aed",
    s3: "#d97706",
    grid: dark ? "rgba(56,189,248,0.10)" : "rgba(15,52,96,0.10)",
    axis: dark ? "#7f97b5" : "#56677f",
    tooltipBg: dark ? "#0a1830" : "#ffffff",
    tooltipBorder: dark ? "rgba(56,189,248,0.34)" : "rgba(15,52,96,0.2)",
    text: dark ? "#e3f1ff" : "#0b1b33",
  };
}

function csv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return toast("Nothing to export", "info");
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function AddTx({ currency, onDone }: { currency: string; onDone: () => void }) {
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/transactions", { body: { date: f.get("date"), description: f.get("description"), amount: Number(f.get("amount")), currency: f.get("currency"), type: f.get("type"), category: f.get("category") || "uncategorised" } });
      toast("Transaction recorded");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date"><Input type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
        <Field label="Type"><Select name="type"><option value="income">Income</option><option value="expense">Expense</option></Select></Field>
        <Field label="Amount"><Input type="number" name="amount" step="0.01" min="0.01" required /></Field>
        <Field label="Currency"><Input name="currency" defaultValue={currency} maxLength={3} /></Field>
      </div>
      <Field label="Description"><Input name="description" required maxLength={500} /></Field>
      <Field label="Category"><Input name="category" placeholder="e.g. affiliate commissions, hosting, ads" /></Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="primary">Record</Button>
    </form>
  );
}

export function AnalyticsUI({ data, transactions, currency, canEdit, canDelete }: { data: Data; transactions: Tx[]; currency: string; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const p = usePalette();
  const [adding, setAdding] = useState(false);
  const total = data.byStatus.reduce((s, x) => s + x.n, 0);
  const done = data.byStatus.find((x) => x.status === "completed")?.n ?? 0;
  const failed = data.byStatus.find((x) => x.status === "failed")?.n ?? 0;
  const runsTotal = data.runs.reduce((s, x) => s + x.n, 0);
  const runsOk = data.runs.find((x) => x.status === "completed")?.n ?? 0;
  const cost = data.usageByDay.reduce((s, x) => s + x.cost, 0);
  const months = [...new Set(data.tx.filter((t) => t.currency === currency).map((t) => t.month))].map((m) => ({
    month: m,
    income: data.tx.find((t) => t.month === m && t.type === "income" && t.currency === currency)?.total ?? 0,
    expenses: data.tx.find((t) => t.month === m && t.type === "expense" && t.currency === currency)?.total ?? 0,
  }));
  const income = months.reduce((s, m) => s + m.income, 0);
  const expenses = months.reduce((s, m) => s + m.expenses, 0);
  const tooltip = { contentStyle: { background: p.tooltipBg, border: `1px solid ${p.tooltipBorder}`, borderRadius: 8, color: p.text, fontSize: 12 }, labelStyle: { color: p.text }, cursor: { fill: p.grid } };
  const axis = { stroke: p.axis, fontSize: 11, tickLine: false, axisLine: false };

  async function del(id: string) {
    if (!confirm("Delete this transaction?")) return;
    try {
      await api(`/api/transactions/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics"
        subtitle="Measured data only — from JARVIS operations and your recorded financials. Nothing here is estimated unless labelled."
        actions={
          <div className="inline-flex rounded-lg border border-line p-1">
            {[7, 30, 90, 365].map((d) => (
              <Link key={d} href={`/analytics?days=${d}`} className={clsx("rounded-md px-2.5 py-1 text-xs", data.days === d ? "bg-accent-soft text-accent" : "text-muted")}>{d === 365 ? "1y" : `${d}d`}</Link>
            ))}
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Tasks created" value={total} />
        <Stat label="Completion rate" value={total ? `${Math.round((done / total) * 100)}%` : "—"} hint={`${done} completed · ${failed} failed`} tone="ok" />
        <Stat label="Automation success" value={runsTotal ? `${Math.round((runsOk / runsTotal) * 100)}%` : "—"} hint={`${runsTotal} workflow runs`} />
        <Stat label={`Net (${currency}, 12 mo)`} value={money(income - expenses, currency)} hint={`${money(income, currency)} in · ${money(expenses, currency)} out`} tone={income - expenses >= 0 ? "ok" : "bad"} />
        <Stat label="AI cost (estimate)" value={`$${cost.toFixed(2)}`} hint="from token usage × list price" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Task throughput" action={<Button size="sm" variant="ghost" onClick={() => csv("tasks-daily", data.daily)}><Download className="size-3.5" />CSV</Button>}>
          {data.daily.length === 0 ? <EmptyState title="No tasks in this period" /> : (
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={data.daily} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke={p.grid} vertical={false} />
                  <XAxis dataKey="day" {...axis} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis {...axis} allowDecimals={false} />
                  <Tooltip {...tooltip} cursor={{ stroke: p.axis, strokeDasharray: "3 3" }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: p.axis }} />
                  <Line type="monotone" dataKey="created" name="Created" stroke={p.s1} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="completed" name="Completed" stroke={p.s2} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="failed" name="Failed" stroke={p.s3} strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card title={`Revenue & expenses (${currency})`} action={canEdit && <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-3.5" />Record</Button>}>
          {months.length === 0 ? (
            <EmptyState title="No financial records yet">Record income and expenses manually, or let the Finance Agent propose entries (approval-gated). Connected payment data will appear here once a connector is implemented.</EmptyState>
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
                  <CartesianGrid stroke={p.grid} vertical={false} />
                  <XAxis dataKey="month" {...axis} />
                  <YAxis {...axis} width={60} />
                  <Tooltip {...tooltip} formatter={(v) => money(Number(v), currency)} />
                  <Legend wrapperStyle={{ fontSize: 12, color: p.axis }} />
                  <Bar dataKey="income" name="Income" fill={p.s1} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="expenses" name="Expenses" fill={p.s3} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Agent productivity" action={<Button size="sm" variant="ghost" onClick={() => csv("agent-productivity", data.byAgent)}><Download className="size-3.5" />CSV</Button>}>
          {data.byAgent.length === 0 ? <EmptyState title="No agent activity in this period" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr><th className="py-1.5">Agent</th><th className="text-right">Tasks</th><th className="text-right">Done</th><th className="text-right">Failed</th><th className="text-right">Success</th><th className="text-right">Avg time</th></tr></thead>
                <tbody>
                  {data.byAgent.sort((a, b) => b.total - a.total).map((a) => (
                    <tr key={a.agent} className="border-t border-line">
                      <td className="py-1.5">{a.agent}</td>
                      <td className="text-right tabular-nums">{a.total}</td>
                      <td className="text-right tabular-nums">{a.completed}</td>
                      <td className="text-right tabular-nums">{a.failed}</td>
                      <td className="text-right tabular-nums">{a.completed + a.failed ? `${Math.round((a.completed / (a.completed + a.failed)) * 100)}%` : "—"}</td>
                      <td className="text-right tabular-nums">{a.avgSeconds ? `${Math.round(a.avgSeconds)}s` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="AI usage by agent (estimated cost)" action={<Button size="sm" variant="ghost" onClick={() => csv("ai-usage", data.usageByAgent)}><Download className="size-3.5" />CSV</Button>}>
          {data.usageByAgent.length === 0 ? <EmptyState title="No AI usage recorded" /> : (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={data.usageByAgent} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={p.grid} horizontal={false} />
                  <XAxis type="number" {...axis} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                  <YAxis type="category" dataKey="agent" {...axis} width={130} />
                  <Tooltip {...tooltip} formatter={(v, n) => (n === "cost" ? `$${Number(v).toFixed(4)}` : v)} />
                  <Bar dataKey="cost" name="cost" fill={p.s1} radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Approvals">
          {data.approvalsByStatus.length === 0 ? <EmptyState title="No approval requests" /> : (
            <ul className="space-y-1 text-sm">{data.approvalsByStatus.map((a) => <li key={a.status} className="flex justify-between"><span className="capitalize">{a.status.replace(/_/g, " ")}</span><span className="tabular-nums">{a.n}</span></li>)}</ul>
          )}
        </Card>
        <Card title="Expenses by category">
          {data.expensesByCategory.length === 0 ? <EmptyState title="No expenses in this period" /> : (
            <ul className="space-y-1 text-sm">{data.expensesByCategory.sort((a, b) => b.total - a.total).map((c) => <li key={c.category} className="flex justify-between gap-2"><span className="truncate">{c.category}</span><span className="tabular-nums">{money(c.total, currency)}</span></li>)}</ul>
          )}
        </Card>
        <Card title="Marketing, social & affiliate">
          <p className="text-sm text-muted">No analytics source is connected. Campaign, engagement and commission metrics will appear here only from connected platforms — JARVIS does not display invented performance figures.</p>
          <Link href="/integrations" className="mt-2 inline-block text-xs text-accent">Connect a data source →</Link>
        </Card>
      </div>

      <Card title="Financial records" action={<div className="flex gap-1">{canEdit && <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-3.5" />Record</Button>}<Button size="sm" variant="ghost" onClick={() => csv("transactions", transactions)}><Download className="size-3.5" />CSV</Button></div>}>
        {transactions.length === 0 ? <EmptyState title="No records" /> : (
          <div className="overflow-x-auto max-h-96 scroll-thin">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr><th className="py-1.5">Date</th><th>Description</th><th>Category</th><th>Source</th><th className="text-right">Amount</th><th /></tr></thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="py-1.5 whitespace-nowrap tabular-nums">{t.date}</td>
                    <td className="max-w-64 truncate">{t.description}</td>
                    <td>{t.category}</td>
                    <td><Badge tone={t.source === "agent" ? "warn" : "neutral"}>{t.source}</Badge></td>
                    <td className={clsx("text-right tabular-nums whitespace-nowrap", t.type === "income" ? "text-ok" : "")}>{t.type === "expense" ? "−" : "+"}{money(Number(t.amount), t.currency)}</td>
                    <td className="text-right">{canDelete && <button onClick={() => del(t.id)} className="p-1 text-muted hover:text-bad" aria-label="Delete"><Trash2 className="size-3.5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title="Record transaction">
        <AddTx currency={currency} onDone={() => { setAdding(false); router.refresh(); }} />
      </Modal>
    </div>
  );
}
