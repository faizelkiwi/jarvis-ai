import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { agents, users } from "@/server/db/schema";
import { __setProviderOverride } from "@/server/ai";
import type { AIProvider, GenerateRequest, GenerateResponse } from "@/server/ai/types";

export async function makeUser(role: "owner" | "admin" | "operator" | "viewer" = "owner") {
  const db = await getDb();
  const [u] = await db
    .insert(users)
    .values({ email: `${role}-${Math.random().toString(36).slice(2)}@test.local`, name: role, passwordHash: "x", role })
    .returning();
  return { id: u.id, role: u.role };
}

export async function agentBySlug(slug: string) {
  const db = await getDb();
  const [a] = await db.select().from(agents).where(eq(agents.slug, slug));
  return a;
}

/** A scripted provider: each call returns the next scripted response (or the fallback). */
export function scriptedProvider(script: ((req: GenerateRequest) => Partial<GenerateResponse>)[]): AIProvider & { calls: GenerateRequest[] } {
  const calls: GenerateRequest[] = [];
  const p = {
    name: "scripted",
    calls,
    async generate(req: GenerateRequest): Promise<GenerateResponse> {
      calls.push(req);
      const step = script[Math.min(calls.length - 1, script.length - 1)];
      const r = step(req);
      return { text: "", toolCalls: [], stopReason: "end", usage: { inputTokens: 10, outputTokens: 5 }, model: "scripted", ...r };
    },
  };
  __setProviderOverride(p);
  return p;
}

export function clearProvider() {
  __setProviderOverride(undefined);
}
