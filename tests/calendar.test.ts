import { describe, it, expect, afterEach, vi } from "vitest";
import { saveIntegration } from "@/server/integrations/service";
import { clientCredentials, clearTokenCache, patchSecrets } from "@/server/google/oauth";
import { timeObject } from "@/server/google/calendar";
import { decideApproval, requestApproval } from "@/server/approvals/service";
import { TOOLS } from "@/server/agents/tools";
import { agentBySlug, makeUser } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  clearTokenCache("google-calendar");
});
const UID = "00000000-0000-0000-0000-000000000000";

describe("Google Calendar integration", () => {
  it("reuses the Gmail OAuth client when Calendar has none of its own", async () => {
    expect(await clientCredentials("google-calendar")).toBeNull();
    await saveIntegration("gmail", { enabled: true, values: { clientId: "gmail-cid", clientSecret: "gmail-sec" } }, UID);
    expect(await clientCredentials("google-calendar")).toEqual({ clientId: "gmail-cid", clientSecret: "gmail-sec" });
  });

  it("interprets local times in the business timezone", () => {
    expect(timeObject("2026-11-20T14:00", "Africa/Johannesburg")).toEqual({ dateTime: "2026-11-20T14:00:00", timeZone: "Africa/Johannesburg" });
    expect(timeObject("2026-11-20T14:00:00+02:00", "Africa/Johannesburg")).toEqual({ dateTime: "2026-11-20T14:00:00+02:00" });
    expect(timeObject("2026-11-20", "Africa/Johannesburg")).toEqual({ date: "2026-11-20" });
  });

  it("creates the event (with invitations) only after approval", async () => {
    await saveIntegration("google-calendar", { enabled: true }, UID);
    await patchSecrets("google-calendar", { refreshToken: "rt" });
    const bodies: { url: string; body?: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "at", expires_in: 3600 });
      if (url.includes("/calendars/primary/events") && init?.method === "POST") {
        bodies.push({ url, body: JSON.parse(String(init.body)) });
        return Response.json({ id: "ev1", htmlLink: "https://calendar.google.com/x" });
      }
      return new Response("nf", { status: 404 });
    });
    const a = await requestApproval({
      action: "schedule_calendar_event", title: "Meeting", agentId: null, taskId: null, reason: "r", expectedOutcome: "o", risks: "k",
      payload: { title: "Strategy call", start: "2026-11-20T14:00", attendees: ["client@example.com"] },
    });
    expect(bodies).toHaveLength(0);
    const r = await decideApproval(a.id, "approve", await makeUser("owner"));
    expect(r.status).toBe("executed");
    expect(bodies[0].url).toContain("sendUpdates=all");
    expect(bodies[0].body).toMatchObject({
      summary: "Strategy call",
      start: { dateTime: "2026-11-20T14:00:00", timeZone: "Africa/Johannesburg" },
      end: { dateTime: "2026-11-20T15:00:00", timeZone: "Africa/Johannesburg" },
      attendees: [{ email: "client@example.com" }],
    });
  });

  it("agents can read the schedule as untrusted data", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "at", expires_in: 3600 });
      return Response.json({ timeZone: "Africa/Johannesburg", items: [{ id: "e1", summary: "Dentist", start: { dateTime: "2026-11-15T09:00:00+02:00" }, end: { dateTime: "2026-11-15T10:00:00+02:00" } }] });
    });
    const pa = await agentBySlug("personal-assistant");
    expect(pa.permissions).toContain("list_calendar_events");
    const out = await TOOLS.list_calendar_events.run!({ agent: pa, task: {} as never }, { days: 3 });
    expect(out).toContain("<untrusted_content");
    expect(out).toContain("Dentist");
  });
});
