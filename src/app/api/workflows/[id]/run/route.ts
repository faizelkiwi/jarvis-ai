import { z } from "zod";
import { runWorkflow } from "@/server/workflows/service";
import { json, route } from "@/server/http";

export const POST = route<{ id: string }>({ role: "operator", limit: [20, 60] }, async ({ req, params, user }) => {
  const v = z.object({ input: z.string().max(10_000).default("") }).parse(await json(req));
  return { run: await runWorkflow(params.id, v.input, user.id) };
});
