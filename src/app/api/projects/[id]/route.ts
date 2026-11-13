import { deleteProject, saveProject } from "@/server/projects/service";
import { json, notFound, route } from "@/server/http";

export const PATCH = route<{ id: string }>({ role: "operator" }, async ({ req, params, user }) => ({
  project: (await saveProject(await json(req), user.id, params.id)) ?? notFound("Project"),
}));
export const DELETE = route<{ id: string }>({ role: "admin" }, async ({ params, user }) => ({ project: (await deleteProject(params.id, user.id)) ?? notFound("Project") }));
