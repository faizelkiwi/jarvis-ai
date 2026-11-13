import { listIntegrationStatus } from "@/server/integrations/service";
import { route } from "@/server/http";

export const GET = route({}, async () => ({ integrations: await listIntegrationStatus() }));
