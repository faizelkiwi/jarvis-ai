import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { KNOWLEDGE_KINDS, knowledgeDocuments } from "@/server/db/schema";
import { deleteKnowledge, updateKnowledge } from "@/server/knowledge/service";
import { json, notFound, route } from "@/server/http";

export const GET = route<{ id: string }>({}, async ({ params }) => {
  const db = await getDb();
  const [doc] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, params.id));
  return { document: doc ?? notFound("Document") };
});

export const PATCH = route<{ id: string }>({ role: "operator" }, async ({ req, params, user }) => {
  const v = z
    .object({
      title: z.string().trim().min(1).max(300).optional(),
      content: z.string().trim().min(1).max(500_000).optional(),
      category: z.string().trim().max(100).optional(),
      kind: z.enum(KNOWLEDGE_KINDS).optional(),
      verified: z.boolean().optional(),
    })
    .parse(await json(req));
  return { document: (await updateKnowledge(params.id, v, user.id)) ?? notFound("Document") };
});

export const DELETE = route<{ id: string }>({ role: "admin" }, async ({ params, user }) => ({
  document: (await deleteKnowledge(params.id, { type: "user", id: user.id })) ?? notFound("Document"),
}));
