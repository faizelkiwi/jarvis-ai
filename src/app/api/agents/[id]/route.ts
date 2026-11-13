import { agentDetail, deleteAgent, updateAgent } from "@/server/agents/service";
import { json, notFound, route } from "@/server/http";

export const GET = route<{ id: string }>({}, async ({ params }) => (await agentDetail(params.id)) ?? notFound("Agent"));
export const PATCH = route<{ id: string }>({ role: "admin" }, async ({ req, params, user }) => ({
  agent: (await updateAgent(params.id, await json(req), user.id)) ?? notFound("Agent"),
}));
export const DELETE = route<{ id: string }>({ role: "admin" }, async ({ params, user }) => ({
  agent: (await deleteAgent(params.id, user.id)) ?? notFound("Agent"),
}));
