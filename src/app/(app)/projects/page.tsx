import { getDb } from "@/server/db/client";
import { agents } from "@/server/db/schema";
import { listProjects } from "@/server/projects/service";
import { listTasks } from "@/server/tasks/service";
import { requireUser } from "@/server/http";
import { ProjectsUI } from "./ui";

export default async function ProjectsPage() {
  const user = await requireUser();
  const db = await getDb();
  const [projects, roster, tasks] = await Promise.all([listProjects(), db.select({ id: agents.id, name: agents.name }).from(agents).orderBy(agents.name), listTasks({ limit: 500 })]);
  const projectTasks = tasks.filter((t) => t.task.projectId).map((t) => ({ id: t.task.id, title: t.task.title, status: t.task.status, projectId: t.task.projectId, agentName: t.agentName, dueDate: t.task.dueDate }));
  return <ProjectsUI projects={JSON.parse(JSON.stringify(projects))} agents={roster} tasks={projectTasks} canEdit={user.role !== "viewer"} canDelete={["owner", "admin"].includes(user.role)} />;
}
