import { z } from "zod";
import { decideApproval } from "@/server/approvals/service";
import { json, route } from "@/server/http";

export const POST = route<{ id: string }>({ role: "admin", limit: [60, 60] }, async ({ req, params, user }) => {
  const v = z.object({ decision: z.enum(["approve", "reject", "request_changes"]), note: z.string().max(2000).optional() }).parse(await json(req));
  if (v.decision === "request_changes" && !v.note?.trim()) throw new z.ZodError([{ code: "custom", path: ["note"], message: "Describe the changes you want", input: v.note }]);
  return decideApproval(params.id, v.decision, user, v.note);
});
