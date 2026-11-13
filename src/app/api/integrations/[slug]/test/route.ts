import { testIntegration } from "@/server/integrations/test";
import { route } from "@/server/http";

export const POST = route<{ slug: string }>({ role: "admin", limit: [20, 300] }, async ({ params }) => testIntegration(params.slug));
