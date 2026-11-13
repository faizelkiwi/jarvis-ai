import { NextResponse } from "next/server";
import { audit } from "@/server/audit/log";
import { exportAll } from "@/server/backup";
import { route } from "@/server/http";

export const GET = route({ role: "owner" }, async ({ user }) => {
  const data = await exportAll();
  await audit({ actorType: "user", actorId: user.id, action: "backup.exported" });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="jarvis-backup-${data.exportedAt.slice(0, 10)}.json"` },
  });
});
