import { searchKnowledge } from "@/server/knowledge/service";
import { route } from "@/server/http";

export const GET = route({ limit: [120, 60] }, async ({ req }) => ({ hits: await searchKnowledge(req.nextUrl.searchParams.get("q") ?? "", { limit: 10 }) }));
