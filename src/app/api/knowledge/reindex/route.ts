import { reindexAll } from "@/server/knowledge/service";
import { route } from "@/server/http";

export const POST = route({ role: "admin", limit: [5, 3600] }, async () => ({ reindexed: await reindexAll() }));
