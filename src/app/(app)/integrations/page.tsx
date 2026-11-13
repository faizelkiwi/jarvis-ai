import { listIntegrationStatus } from "@/server/integrations/service";
import { requireUser } from "@/server/http";
import { IntegrationsUI } from "./ui";

export default async function IntegrationsPage() {
  const user = await requireUser();
  const list = await listIntegrationStatus();
  return <IntegrationsUI items={JSON.parse(JSON.stringify(list))} canEdit={["owner", "admin"].includes(user.role)} />;
}
