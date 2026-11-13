import { getDb } from "@/server/db/client";
import { agents } from "@/server/db/schema";
import { listWorkflows } from "@/server/workflows/service";
import { CONSEQUENTIAL_ACTIONS } from "@/server/approvals/catalog";
import { requireUser } from "@/server/http";
import { WorkflowsUI } from "./ui";

export default async function WorkflowsPage() {
  const user = await requireUser();
  const db = await getDb();
  const [wfs, roster] = await Promise.all([listWorkflows(), db.select({ slug: agents.slug, name: agents.name, active: agents.active }).from(agents).orderBy(agents.name)]);
  const actions = Object.entries(CONSEQUENTIAL_ACTIONS).filter(([k]) => k !== "workflow_checkpoint").map(([k, v]) => ({ value: k, label: v.label }));
  return <WorkflowsUI workflows={JSON.parse(JSON.stringify(wfs))} agents={roster} actions={actions} canEdit={["owner", "admin"].includes(user.role)} canRun={user.role !== "viewer"} />;
}
