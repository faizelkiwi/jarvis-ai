import { describe, it, expect, afterEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { knowledgeDocuments, tasks } from "@/server/db/schema";
import { addKnowledge, searchKnowledge, formatKnowledgeContext, purgeExpiredKnowledge } from "@/server/knowledge/service";
import { chunkText, extractText, UnsupportedFileError } from "@/server/knowledge/extract";
import { createTask, scheduleReadyTasks } from "@/server/tasks/service";
import { drainJobs } from "@/server/jobs/worker";
import { agentBySlug, clearProvider, scriptedProvider } from "./helpers";

afterEach(() => clearProvider());

describe("knowledge base & RAG", () => {
  it("stores, indexes and retrieves documents via hybrid search", async () => {
    await addKnowledge({ title: "Refund policy", content: "Customers may request a refund within 14 days of purchase of any digital product.", source: "manual", kind: "verified_fact" });
    await addKnowledge({ title: "Brand voice", content: "Our tone is friendly, practical and South African. Avoid jargon.", source: "manual", kind: "preference" });
    await addKnowledge({ title: "Office plants", content: "Water the ferns on Mondays.", source: "manual" });
    const hits = await searchKnowledge("what is the refund window for products?");
    expect(hits[0].title).toBe("Refund policy");
    expect(hits[0].verified).toBe(true);
    const ctx = formatKnowledgeContext(hits);
    expect(ctx).toContain("<retrieved_knowledge>");
    expect(ctx).toContain("VERIFIED FACT");
  });

  it("excludes expired temporary memory and purges it", async () => {
    const doc = await addKnowledge({ title: "Temp promo code", content: "Promo code SPRING expires soon", source: "manual", kind: "temporary" });
    expect(doc.expiresAt).toBeTruthy();
    const db = await getDb();
    await db.update(knowledgeDocuments).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(knowledgeDocuments.id, doc.id));
    expect((await searchKnowledge("promo code SPRING")).some((h) => h.title === "Temp promo code")).toBe(false);
    expect(await purgeExpiredKnowledge()).toBe(1);
  });

  it("agent-saved memory is never verified, and agents receive retrieved knowledge", async () => {
    const provider = scriptedProvider([
      () => ({
        stopReason: "tool_use",
        toolCalls: [{ id: "m1", name: "save_memory", input: { title: "Owner prefers short posts", content: "Keep posts under 100 words", kind: "preference" } }],
      }),
      () => ({ text: "Saved." }),
    ]);
    const agent = await agentBySlug("customer-service");
    await createTask({ title: "Answer refund question", description: "A customer asks about refunds", agentId: agent.id, createdBy: "user" });
    await scheduleReadyTasks();
    await drainJobs();
    const firstPrompt = provider.calls[0].messages[0];
    expect(firstPrompt.role === "user" && firstPrompt.content).toContain("Refund policy");
    const db = await getDb();
    const [mem] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.title, "Owner prefers short posts"));
    expect(mem).toMatchObject({ source: "agent", verified: false, kind: "preference" });
    const t = await db.select().from(tasks);
    expect(t[0].status).toBe("completed");
  });

  it("extracts text safely and rejects unsupported files", async () => {
    const { text } = await extractText("notes.md", Buffer.from("# Hello\n\nWorld"));
    expect(text).toContain("World");
    const html = await extractText("page.html", Buffer.from("<p>Hi</p><script>alert(1)</script>"));
    expect(html.text).not.toContain("alert");
    await expect(extractText("evil.exe", Buffer.from("MZ"))).rejects.toBeInstanceOf(UnsupportedFileError);
    await expect(extractText("fake.pdf", Buffer.from("not a pdf"))).rejects.toThrow(/valid PDF/);
  });

  it("chunks long text with overlap", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ` + "lorem ipsum ".repeat(20)).join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.length <= 1900)).toBe(true);
  });

  it("uses pgvector for similarity", async () => {
    const db = await getDb();
    const r = await db.execute<{ d: number }>(sql`select '[1,0,0]'::vector <=> '[0,1,0]'::vector as d`);
    expect(Number(r.rows[0].d)).toBeCloseTo(1);
  });
});
