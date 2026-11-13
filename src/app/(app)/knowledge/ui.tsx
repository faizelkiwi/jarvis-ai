"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, FileUp, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorText, Field, Input, Modal, PageHeader, Select, Textarea, Ago, type Tone } from "@/components/ui";
import { api, toast } from "@/lib/api";

type Doc = { id: string; title: string; category: string; kind: string; source: string; verified: boolean; fileName: string | null; sizeBytes: number | null; expiresAt: string | null; createdAt: string; updatedAt: string; preview: string };
const KINDS: { v: string; label: string; tone: Tone }[] = [
  { v: "verified_fact", label: "Verified fact", tone: "ok" },
  { v: "preference", label: "Preference", tone: "info" },
  { v: "procedure", label: "Procedure", tone: "accent" },
  { v: "decision", label: "Decision", tone: "accent" },
  { v: "document", label: "Document", tone: "neutral" },
  { v: "research", label: "Research", tone: "info" },
  { v: "temporary", label: "Temporary", tone: "warn" },
  { v: "assumption", label: "Agent assumption", tone: "warn" },
];
const kindOf = (k: string) => KINDS.find((x) => x.v === k) ?? { v: k, label: k, tone: "neutral" as Tone };

function KindSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <Select {...props}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}</Select>;
}

function EditDoc({ id, onDone, canDelete }: { id: string; onDone: () => void; canDelete: boolean }) {
  const [doc, setDoc] = useState<{ title: string; content: string; category: string; kind: string; verified: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ document: NonNullable<typeof doc> }>(`/api/knowledge/${id}`).then((r) => setDoc(r.document)).catch((e) => setError(e.message));
  }, [id]);
  if (!doc) return error ? <ErrorText>{error}</ErrorText> : <div className="h-40 animate-pulse rounded bg-accent-soft" />;
  async function save() {
    setBusy(true);
    try {
      await api(`/api/knowledge/${id}`, { method: "PATCH", body: doc });
      toast("Saved and re-indexed");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm("Delete this knowledge item permanently?")) return;
    try {
      await api(`/api/knowledge/${id}`, { method: "DELETE" });
      toast("Deleted");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="space-y-3">
      <Field label="Title"><Input value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Category"><Input value={doc.category} onChange={(e) => setDoc({ ...doc, category: e.target.value })} /></Field>
        <Field label="Type"><KindSelect value={doc.kind} onChange={(e) => setDoc({ ...doc, kind: e.target.value })} /></Field>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" className="accent-[var(--accent)]" checked={doc.verified} onChange={(e) => setDoc({ ...doc, verified: e.target.checked })} />Verified by me</label>
      </div>
      <Field label="Content"><Textarea value={doc.content} onChange={(e) => setDoc({ ...doc, content: e.target.value })} className="min-h-72 font-mono text-xs" /></Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button variant="primary" onClick={save} loading={busy}>Save</Button>
        {canDelete && <Button variant="danger" onClick={remove}><Trash2 className="size-4" />Delete</Button>}
      </div>
    </div>
  );
}

export function KnowledgeUI({ docs, embeddingModel, accept, canEdit, canDelete }: { docs: Doc[]; embeddingModel: string; accept: string; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState("");
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ title: string; kind: string; content: string; score: number; documentId: string }[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const list = useMemo(() => docs.filter((d) => (!kind || d.kind === kind) && (!filter || `${d.title} ${d.category} ${d.preview}`.toLowerCase().includes(filter.toLowerCase()))), [docs, kind, filter]);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("file") as File | null;
    if (!file || !file.size) return setErr("Choose a file");
    setUploading(true);
    setErr("");
    try {
      const r = await api<{ document: { title: string; chars: number } }>("/api/knowledge/upload", { form });
      toast(`Indexed "${r.document.title}" (${r.document.chars.toLocaleString()} characters)`);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (er) {
      setErr((er as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function addNote(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/knowledge", { body: { title: f.get("title"), content: f.get("content"), category: f.get("category") || "general", kind: f.get("kind"), verified: f.get("kind") === "verified_fact" } });
      toast("Saved to memory");
      setAdding(false);
      router.refresh();
    } catch (er) {
      toast((er as Error).message, "error");
    }
  }
  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    try {
      setHits((await api<{ hits: NonNullable<typeof hits> }>(`/api/knowledge/search?q=${encodeURIComponent(q)}`)).hits);
    } catch (er) {
      toast((er as Error).message, "error");
    }
  }
  async function reindex() {
    try {
      const r = await api<{ reindexed: number }>("/api/knowledge/reindex", { body: {} });
      toast(`Re-indexed ${r.reindexed} documents`);
    } catch (er) {
      toast((er as Error).message, "error");
    }
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title="Knowledge Base"
        subtitle={<>Long-term memory for JARVIS and all agents (RAG). Embeddings: <code className="text-xs">{embeddingModel}</code> + full-text search.</>}
        actions={
          <>
            {canDelete && <Button onClick={reindex} title="Rebuild embeddings after changing the embedding provider"><RefreshCw className="size-4" />Re-index</Button>}
            {canEdit && <Button variant="primary" onClick={() => setAdding(true)}><Plus className="size-4" />Add memory</Button>}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {canEdit && (
          <Card title="Upload documents">
            <form onSubmit={upload} className="space-y-3">
              <input type="file" name="file" accept={accept} className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-accent-soft file:px-3 file:py-2 file:text-sm file:text-fg" />
              <div className="grid gap-2 sm:grid-cols-3">
                <Input name="title" placeholder="Title (optional)" />
                <Input name="category" placeholder="Category e.g. products" />
                <KindSelect name="kind" defaultValue="document" />
              </div>
              <p className="text-[11px] text-muted">PDF, TXT, Markdown, CSV/TSV (spreadsheet exports), JSON, HTML · max 10 MB. Uploaded content is treated as untrusted data by agents.</p>
              <ErrorText>{err}</ErrorText>
              <Button type="submit" loading={uploading}><FileUp className="size-4" />Upload & index</Button>
            </form>
          </Card>
        )}
        <Card title="Test retrieval">
          <form onSubmit={search} className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask what an agent would search for…" />
            <Button type="submit" aria-label="Search"><Search className="size-4" /></Button>
          </form>
          {hits && (
            <ul className="mt-3 space-y-2 max-h-72 overflow-y-auto scroll-thin">
              {hits.length === 0 && <li className="text-sm text-muted">No relevant knowledge found.</li>}
              {hits.map((h, i) => (
                <li key={i} className="rounded-lg border border-line p-2 text-sm">
                  <div className="flex items-center gap-2"><span className="font-medium truncate">{h.title}</span><Badge tone={kindOf(h.kind).tone}>{kindOf(h.kind).label}</Badge><span className="ml-auto text-[11px] text-muted tabular-nums">score {h.score.toFixed(3)}</span></div>
                  <p className="mt-1 text-xs text-muted line-clamp-3">{h.content}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="!w-full sm:!w-64" />
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setKind("")} className={clsx("rounded-lg border px-2.5 py-1 text-xs", !kind ? "border-line-strong bg-accent-soft text-accent" : "border-line text-muted")}>All ({docs.length})</button>
          {KINDS.map((k) => (
            <button key={k.v} onClick={() => setKind(k.v)} className={clsx("rounded-lg border px-2.5 py-1 text-xs", kind === k.v ? "border-line-strong bg-accent-soft text-accent" : "border-line text-muted")}>
              {k.label} ({docs.filter((d) => d.kind === k.v).length})
            </button>
          ))}
        </div>
      </div>
      <div className="panel overflow-hidden">
        {list.length === 0 ? (
          <EmptyState icon={<BookOpen className="size-8" />} title="No knowledge yet">Upload business documents, or add facts and preferences JARVIS should remember.</EmptyState>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {list.map((d) => (
              <li key={d.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate">{d.title}</span>
                    <Badge tone={kindOf(d.kind).tone}>{kindOf(d.kind).label}</Badge>
                    {d.verified && <span className="inline-flex items-center gap-1 text-[11px] text-ok"><CheckCircle2 className="size-3" />verified</span>}
                    <Badge>{d.category}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted line-clamp-2">{d.preview}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {d.source === "agent" || d.source === "task" ? "Agent-generated" : d.source === "upload" ? `Uploaded ${d.fileName ?? ""}` : "Added manually"} · updated <Ago d={d.updatedAt} />
                    {d.expiresAt && ` · expires ${new Date(d.expiresAt).toLocaleDateString("en-ZA")}`}
                  </p>
                </div>
                {canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(d.id)} aria-label="Edit"><Pencil className="size-3.5" /></Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add to memory">
        <form onSubmit={addNote} className="space-y-3">
          <Field label="Title"><Input name="title" required maxLength={300} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" hint="Verified facts are trusted by agents; temporary notes expire."><KindSelect name="kind" defaultValue="verified_fact" /></Field>
            <Field label="Category"><Input name="category" placeholder="general" /></Field>
          </div>
          <Field label="Content"><Textarea name="content" required className="min-h-40" /></Field>
          <Button type="submit" variant="primary">Save</Button>
        </form>
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Inspect & correct memory" wide>
        {editing && <EditDoc id={editing} canDelete={canDelete} onDone={() => { setEditing(null); router.refresh(); }} />}
      </Modal>
    </div>
  );
}
