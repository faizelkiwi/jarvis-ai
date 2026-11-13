import Anthropic from "@anthropic-ai/sdk";
import { getIntegrationDef } from "./registry";
import { recordIntegrationCheck, requiredFieldsPresent, resolveIntegration } from "./service";

/** Read-only connectivity checks. Never triggers side effects. */
export async function testIntegration(slug: string): Promise<{ ok: boolean; message: string }> {
  const def = getIntegrationDef(slug);
  if (!def) return { ok: false, message: "Unknown integration" };
  const { values } = await resolveIntegration(slug);
  if (!requiredFieldsPresent(slug, values)) return { ok: false, message: "Required credentials are missing." };
  if (def.implementation === "planned")
    return { ok: false, message: "Credentials are stored securely, but this connector (OAuth flow / API calls) is not implemented yet." };
  if (def.authType === "webhook")
    return { ok: true, message: "Webhook URL stored. Not called during testing to avoid triggering the workflow." };

  const get = async (url: string, headers: Record<string, string> = {}) => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  try {
    let message = "Connected";
    switch (slug) {
      case "anthropic": {
        const client = new Anthropic({ apiKey: values.apiKey, maxRetries: 0 });
        const page = await client.models.list({ limit: 5 });
        message = `Connected — models available: ${page.data.map((m) => m.id).join(", ")}`;
        break;
      }
      case "openai":
        await get("https://api.openai.com/v1/models", { authorization: `Bearer ${values.apiKey}` });
        break;
      case "gemini":
        await get("https://generativelanguage.googleapis.com/v1beta/models", { "x-goog-api-key": values.apiKey });
        break;
      case "telegram": {
        const r = await get(`https://api.telegram.org/bot${values.botToken}/getMe`);
        message = `Connected as @${r.result?.username}`;
        break;
      }
      case "resend":
        await get("https://api.resend.com/domains", { authorization: `Bearer ${values.apiKey}` });
        break;
      case "whatsapp": {
        const r = await get(`https://graph.facebook.com/v21.0/${encodeURIComponent(values.phoneNumberId)}?fields=display_phone_number`, { authorization: `Bearer ${values.accessToken}` });
        message = `Connected — ${r.display_phone_number ?? "number verified"}`;
        break;
      }
      case "facebook": {
        const r = await get(`https://graph.facebook.com/v21.0/${encodeURIComponent(values.pageId)}?fields=name`, { authorization: `Bearer ${values.pageAccessToken}` });
        message = `Connected to page "${r.name}"`;
        break;
      }
      case "elevenlabs": {
        const r = await get("https://api.elevenlabs.io/v1/voices", { "xi-api-key": values.apiKey });
        message = `Connected — ${r.voices?.length ?? 0} voices available`;
        break;
      }
      case "stripe":
        await get("https://api.stripe.com/v1/balance", { authorization: `Bearer ${values.secretKey}` });
        break;
      default:
        return { ok: false, message: "No connectivity test available" };
    }
    await recordIntegrationCheck(slug, true);
    return { ok: true, message };
  } catch (e) {
    const msg = (e as Error).message.replace(/bot\d+:[\w-]+/g, "bot[REDACTED]");
    await recordIntegrationCheck(slug, false, msg);
    return { ok: false, message: msg };
  }
}
