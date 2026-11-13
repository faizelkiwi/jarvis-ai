import { listProjects, saveProject } from "@/server/projects/service";
import { json, route } from "@/server/http";

export const GET = route({}, async () => ({ projects: await listProjects() }));
export const POST = route({ role: "operator" }, async ({ req, user }) => ({ project: await saveProject(await json(req), user.id) }));
