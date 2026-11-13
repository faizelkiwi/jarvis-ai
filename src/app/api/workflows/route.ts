import { listWorkflows, saveWorkflow } from "@/server/workflows/service";
import { json, route } from "@/server/http";

export const GET = route({}, async () => ({ workflows: await listWorkflows() }));
export const POST = route({ role: "admin" }, async ({ req, user }) => ({ workflow: await saveWorkflow(await json(req), user.id) }));
