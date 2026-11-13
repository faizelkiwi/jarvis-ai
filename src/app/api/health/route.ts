import { healthData } from "@/server/queries";
import { route } from "@/server/http";

export const GET = route({}, async () => healthData());
