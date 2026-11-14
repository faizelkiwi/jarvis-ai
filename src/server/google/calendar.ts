import { accessToken } from "./oauth";

const API = "https://www.googleapis.com/calendar/v3";

async function cal<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken("google-calendar");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      msg = JSON.parse(text).error?.message ?? msg;
    } catch {}
    throw new Error(`Google Calendar error ${res.status}: ${msg}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

type GEvent = {
  id: string;
  summary?: string;
  location?: string;
  description?: string;
  htmlLink?: string;
  status?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { email: string; responseStatus?: string }[];
};

export async function listEvents(fromIso: string, toIso: string, max = 50) {
  const q = new URLSearchParams({ timeMin: fromIso, timeMax: toIso, singleEvents: "true", orderBy: "startTime", maxResults: String(Math.min(max, 100)) });
  const r = await cal<{ items?: GEvent[]; timeZone?: string }>(`/calendars/primary/events?${q}`);
  return {
    timeZone: r.timeZone ?? null,
    events: (r.items ?? [])
      .filter((e) => e.status !== "cancelled")
      .map((e) => ({
        id: e.id,
        title: e.summary ?? "(no title)",
        start: e.start.dateTime ?? e.start.date ?? "",
        end: e.end.dateTime ?? e.end.date ?? "",
        allDay: !e.start.dateTime,
        location: e.location ?? null,
        attendees: (e.attendees ?? []).map((a) => a.email),
        description: e.description?.slice(0, 500) ?? null,
      })),
  };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/;

/** Builds a Google time object; local times without an offset are interpreted in the business timezone. */
export function timeObject(value: string, timeZone: string) {
  if (DATE_ONLY.test(value)) return { date: value };
  return HAS_OFFSET.test(value) ? { dateTime: value } : { dateTime: value.length === 16 ? `${value}:00` : value, timeZone };
}

function defaultEnd(start: string) {
  if (DATE_ONLY.test(start)) {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  // Same wall-clock format as the start, one hour later.
  const m = start.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(.*)$/);
  if (!m) return start;
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:00Z`);
  d.setUTCHours(d.getUTCHours() + 1);
  const iso = d.toISOString();
  return `${iso.slice(0, 10)}T${iso.slice(11, 16)}:00${m[4].replace(/^:\d{2}(\.\d+)?/, "")}`;
}

export async function createEvent(e: { title: string; start: string; end?: string; attendees?: string[]; description?: string; location?: string }, timeZone: string) {
  const body = {
    summary: e.title,
    description: e.description,
    location: e.location,
    start: timeObject(e.start, timeZone),
    end: timeObject(e.end || defaultEnd(e.start), timeZone),
    attendees: (e.attendees ?? []).map((email) => ({ email })),
  };
  const sendUpdates = e.attendees?.length ? "all" : "none";
  return cal<GEvent>(`/calendars/primary/events?sendUpdates=${sendUpdates}`, { method: "POST", body: JSON.stringify(body) });
}
