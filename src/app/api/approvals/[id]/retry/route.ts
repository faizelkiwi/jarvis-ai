import { retryExecution } from "@/server/approvals/service";
import { route } from "@/server/http";

export const POST = route<{ id: string }>({ role: "admin" }, async ({ params, user }) => ({ result: await retryExecution(params.id, user) }));
