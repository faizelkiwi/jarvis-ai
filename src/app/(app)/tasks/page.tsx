import { getDb } from "@/server/db/client";
import { agents, projects } from "@/server/db/schema";
import { listTasks } from "@/server/tasks/service";
import { requireUser } from "@/server/http";
import { TasksUI } from "./ui";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ id?: string; new?: string; status?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const db = await getDb();
  const [rows, agentRows, projectRows] = await Promise.all([
    listTasks({ limit: 400 }),
    db.select({ id: agents.id, name: agents.name, active: agents.active }).from(agents).orderBy(agents.name),
    db.select({ id: projects.id, name: projects.name }).from(projects),
  ]);
  return (
    <TasksUI
      rows={JSON.parse(JSON.stringify(rows))}
      agents={agentRows}
      projects={projectRows}
      openId={sp.id ?? null}
      openNew={sp.new === "1"}
      initialStatus={sp.status ?? ""}
      canEdit={user.role !== "viewer"}
    />
  );
}
