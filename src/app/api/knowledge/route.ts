import { z } from "zod";
import { KNOWLEDGE_KINDS } from "@/server/db/schema";
import { addKnowledge, listKnowledge } from "@/server/knowledge/service";
import { json, route } from "@/server/http";

export const GET = route({}, async ({ req }) => {
  const s = req.nextUrl.searchParams;
  return { documents: await listKnowledge({ q: s.get("q") ?? undefined, kind: s.get("kind") ?? undefined, category: s.get("category") ?? undefined }) };
});

export const POST = route({ role: "operator", limit: [60, 60] }, async ({ req, user }) => {
  const v = z
    .object({
      title: z.string().trim().min(1).max(300),
      content: z.string().trim().min(1).max(500_000),
      category: z.string().trim().max(100).default("general"),
      kind: z.enum(KNOWLEDGE_KINDS).default("document"),
      verified: z.boolean().optional(),
    })
    .parse(await json(req));
  return { document: await addKnowledge({ ...v, source: "manual", createdBy: user.id }) };
});
