import { requireUser } from "@/server/http";
import { listApprovals } from "@/server/approvals/service";
import { actionLabel } from "@/server/approvals/catalog";
import { ApprovalsUI } from "./ui";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const user = await requireUser();
  const rows = await listApprovals();
  const items = rows.map((r) => ({ ...r.approval, agentName: r.agentName, taskTitle: r.taskTitle, actionLabel: actionLabel(r.approval.action) }));
  return <ApprovalsUI items={JSON.parse(JSON.stringify(items))} canDecide={["owner", "admin"].includes(user.role)} focusId={(await searchParams).id ?? null} />;
}
