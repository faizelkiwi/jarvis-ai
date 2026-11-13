import { listApprovals } from "@/server/approvals/service";
import { route } from "@/server/http";

export const GET = route({}, async ({ req }) => {
  const status = req.nextUrl.searchParams.get("status");
  return { approvals: await listApprovals(status ? status.split(",") : undefined) };
});
