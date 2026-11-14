import { accessToken } from "./oauth";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmail<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken("gmail");
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
    throw new Error(`Gmail API error ${res.status}: ${msg}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);
const noCrlf = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** RFC 2822 message, safe against header injection. */
export function buildMime(m: { from: string; to: string; subject: string; body: string; inReplyTo?: string; threadSubject?: boolean }) {
  const lines = [
    `From: ${noCrlf(m.from)}`,
    `To: ${noCrlf(m.to)}`,
    `Subject: ${encodeHeader(noCrlf(m.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    ...(m.inReplyTo ? [`In-Reply-To: ${noCrlf(m.inReplyTo)}`, `References: ${noCrlf(m.inReplyTo)}`] : []),
    "",
    Buffer.from(m.body).toString("base64").replace(/(.{76})/g, "$1\r\n"),
  ];
  return lines.join("\r\n");
}

export async function gmailProfile() {
  return gmail<{ emailAddress: string; messagesTotal: number }>("/profile");
}

export async function sendGmail(m: { from: string; to: string; subject: string; body: string; threadId?: string; inReplyTo?: string }) {
  const raw = b64url(buildMime(m));
  return gmail<{ id: string; threadId: string }>("/messages/send", { method: "POST", body: JSON.stringify({ raw, ...(m.threadId ? { threadId: m.threadId } : {}) }) });
}

type Header = { name: string; value: string };
type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: Header[] };
const header = (hs: Header[] | undefined, n: string) => hs?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";

function plainText(p: Part): string {
  if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const c of p.parts ?? []) {
    const t = plainText(c);
    if (t) return t;
  }
  if (p.mimeType === "text/html" && p.body?.data)
    return Buffer.from(p.body.data, "base64url").toString("utf8").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  return "";
}

export async function searchGmail(query: string, max = 10) {
  const list = await gmail<{ messages?: { id: string }[] }>(`/messages?maxResults=${Math.min(max, 20)}&q=${encodeURIComponent(query)}`);
  const ids = (list.messages ?? []).map((m) => m.id);
  return Promise.all(
    ids.map(async (id) => {
      const m = await gmail<{ id: string; threadId: string; snippet: string; labelIds?: string[]; payload: Part }>(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
      return {
        id: m.id,
        threadId: m.threadId,
        from: header(m.payload.headers, "From"),
        subject: header(m.payload.headers, "Subject"),
        date: header(m.payload.headers, "Date"),
        unread: m.labelIds?.includes("UNREAD") ?? false,
        snippet: m.snippet,
      };
    }),
  );
}

export async function readGmail(id: string) {
  const m = await gmail<{ id: string; threadId: string; payload: Part }>(`/messages/${encodeURIComponent(id)}?format=full`);
  return {
    id: m.id,
    threadId: m.threadId,
    from: header(m.payload.headers, "From"),
    to: header(m.payload.headers, "To"),
    subject: header(m.payload.headers, "Subject"),
    date: header(m.payload.headers, "Date"),
    messageId: header(m.payload.headers, "Message-ID"),
    body: plainText(m.payload).slice(0, 20_000),
  };
}
