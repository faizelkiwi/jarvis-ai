import { z } from "zod";
import { removeIntegrationSecrets, saveIntegration } from "@/server/integrations/service";
import { getIntegrationDef } from "@/server/integrations/registry";
import { json, notFound, route } from "@/server/http";

export const PUT = route<{ slug: string }>({ role: "admin", limit: [30, 300] }, async ({ req, params, user }) => {
  if (!getIntegrationDef(params.slug)) notFound("Integration");
  const v = z.object({ enabled: z.boolean().optional(), values: z.record(z.string(), z.string().max(8000)).optional() }).parse(await json(req));
  await saveIntegration(params.slug, v, user.id);
  return { ok: true };
});

export const DELETE = route<{ slug: string }>({ role: "admin" }, async ({ params, user }) => {
  if (!getIntegrationDef(params.slug)) notFound("Integration");
  await removeIntegrationSecrets(params.slug, user.id);
  return { ok: true };
});
