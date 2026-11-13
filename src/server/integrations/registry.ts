/**
 * Catalogue of supported integrations.
 *
 * `implementation`:
 *  - "live":    backend connection test + actions are implemented and work once credentials are supplied.
 *  - "planned": configuration UI and secure storage work; the OAuth flow / action executor is not built yet.
 */
export type IntegrationField = { key: string; label: string; secret: boolean; placeholder?: string; help?: string };

export type IntegrationDef = {
  slug: string;
  name: string;
  category: "AI Providers" | "Communication" | "Social Media" | "Google Workspace" | "Microsoft 365" | "Automation" | "Payments" | "Analytics";
  description: string;
  implementation: "live" | "planned";
  authType: "api_key" | "bot_token" | "webhook" | "oauth";
  fields: IntegrationField[];
  /** Approval-gated actions this integration can execute. */
  actions: string[];
  envVar?: string;
  docsUrl: string;
  note?: string;
};

export const INTEGRATIONS: IntegrationDef[] = [
  {
    slug: "anthropic",
    name: "Anthropic Claude",
    category: "AI Providers",
    description: "Primary AI provider for JARVIS and all agents. Enables web research.",
    implementation: "live",
    authType: "api_key",
    envVar: "ANTHROPIC_API_KEY",
    fields: [{ key: "apiKey", label: "API key", secret: true, placeholder: "sk-ant-…" }],
    actions: [],
    docsUrl: "https://platform.claude.com/settings/keys",
  },
  {
    slug: "openai",
    name: "OpenAI",
    category: "AI Providers",
    description: "Alternative model provider; also used for semantic embeddings when selected.",
    implementation: "live",
    authType: "api_key",
    envVar: "OPENAI_API_KEY",
    fields: [{ key: "apiKey", label: "API key", secret: true, placeholder: "sk-…" }],
    actions: [],
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    slug: "gemini",
    name: "Google Gemini",
    category: "AI Providers",
    description: "Alternative model provider.",
    implementation: "live",
    authType: "api_key",
    envVar: "GEMINI_API_KEY",
    fields: [{ key: "apiKey", label: "API key", secret: true, placeholder: "AIza…" }],
    actions: [],
    docsUrl: "https://aistudio.google.com/apikey",
  },
  {
    slug: "telegram",
    name: "Telegram",
    category: "Communication",
    description: "Send approved messages and briefings through your Telegram bot.",
    implementation: "live",
    authType: "bot_token",
    fields: [
      { key: "botToken", label: "Bot token", secret: true, placeholder: "123456:ABC…", help: "Create a bot with @BotFather" },
      { key: "defaultChatId", label: "Default chat ID", secret: false, placeholder: "e.g. 123456789" },
    ],
    actions: ["send_telegram_message"],
    docsUrl: "https://core.telegram.org/bots#how-do-i-create-a-bot",
  },
  {
    slug: "whatsapp",
    name: "WhatsApp Business (Cloud API)",
    category: "Communication",
    description: "Send approved customer messages via the official WhatsApp Cloud API.",
    implementation: "live",
    authType: "api_key",
    fields: [
      { key: "accessToken", label: "Permanent access token", secret: true },
      { key: "phoneNumberId", label: "Phone number ID", secret: false },
    ],
    actions: ["send_customer_message"],
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
    note: "Free-form messages only reach customers who messaged you within 24 hours; otherwise approved templates are required.",
  },
  {
    slug: "resend",
    name: "Email (Resend)",
    category: "Communication",
    description: "Send approved outbound email through the Resend API from your verified domain.",
    implementation: "live",
    authType: "api_key",
    fields: [
      { key: "apiKey", label: "API key", secret: true, placeholder: "re_…" },
      { key: "fromAddress", label: "From address", secret: false, placeholder: "JARVIS <hello@yourdomain.com>" },
    ],
    actions: ["send_email"],
    docsUrl: "https://resend.com/docs/api-reference/emails/send-email",
  },
  {
    slug: "gmail",
    name: "Gmail",
    category: "Google Workspace",
    description: "Read and send email through your Google account (OAuth).",
    implementation: "planned",
    authType: "oauth",
    fields: [
      { key: "clientId", label: "OAuth client ID", secret: false },
      { key: "clientSecret", label: "OAuth client secret", secret: true },
    ],
    actions: ["send_email"],
    docsUrl: "https://developers.google.com/gmail/api/quickstart",
  },
  {
    slug: "google-calendar",
    name: "Google Calendar",
    category: "Google Workspace",
    description: "Read your schedule and create approved events (OAuth).",
    implementation: "planned",
    authType: "oauth",
    fields: [
      { key: "clientId", label: "OAuth client ID", secret: false },
      { key: "clientSecret", label: "OAuth client secret", secret: true },
    ],
    actions: ["schedule_calendar_event"],
    docsUrl: "https://developers.google.com/calendar/api/quickstart/nodejs",
  },
  {
    slug: "google-drive",
    name: "Google Drive",
    category: "Google Workspace",
    description: "Import documents into the knowledge base (OAuth).",
    implementation: "planned",
    authType: "oauth",
    fields: [
      { key: "clientId", label: "OAuth client ID", secret: false },
      { key: "clientSecret", label: "OAuth client secret", secret: true },
    ],
    actions: [],
    docsUrl: "https://developers.google.com/drive/api/quickstart/nodejs",
  },
  {
    slug: "microsoft-365",
    name: "Microsoft 365 / Excel",
    category: "Microsoft 365",
    description: "Outlook mail, calendar and Excel workbooks via Microsoft Graph (OAuth).",
    implementation: "planned",
    authType: "oauth",
    fields: [
      { key: "tenantId", label: "Tenant ID", secret: false },
      { key: "clientId", label: "Application (client) ID", secret: false },
      { key: "clientSecret", label: "Client secret", secret: true },
    ],
    actions: [],
    docsUrl: "https://learn.microsoft.com/graph/auth-register-app-v2",
  },
  {
    slug: "facebook",
    name: "Facebook Pages",
    category: "Social Media",
    description: "Publish approved posts to a Facebook Page via the Graph API.",
    implementation: "live",
    authType: "api_key",
    fields: [
      { key: "pageAccessToken", label: "Page access token", secret: true },
      { key: "pageId", label: "Page ID", secret: false },
    ],
    actions: ["publish_social_post"],
    docsUrl: "https://developers.facebook.com/docs/pages-api/posts",
  },
  {
    slug: "instagram",
    name: "Instagram (Graph API)",
    category: "Social Media",
    description: "Publish approved image posts to an Instagram professional account.",
    implementation: "planned",
    authType: "api_key",
    fields: [
      { key: "accessToken", label: "Access token", secret: true },
      { key: "igUserId", label: "Instagram user ID", secret: false },
    ],
    actions: ["publish_social_post"],
    docsUrl: "https://developers.facebook.com/docs/instagram-platform/content-publishing",
  },
  {
    slug: "tiktok",
    name: "TikTok",
    category: "Social Media",
    description: "Content Posting API (requires TikTok app review).",
    implementation: "planned",
    authType: "oauth",
    fields: [
      { key: "clientKey", label: "Client key", secret: false },
      { key: "clientSecret", label: "Client secret", secret: true },
    ],
    actions: ["publish_social_post"],
    docsUrl: "https://developers.tiktok.com/doc/content-posting-api-get-started",
  },
  {
    slug: "youtube",
    name: "YouTube Data API",
    category: "Social Media",
    description: "Channel analytics and video metadata (OAuth).",
    implementation: "planned",
    authType: "oauth",
    fields: [
      { key: "clientId", label: "OAuth client ID", secret: false },
      { key: "clientSecret", label: "OAuth client secret", secret: true },
    ],
    actions: [],
    docsUrl: "https://developers.google.com/youtube/v3/getting-started",
  },
  {
    slug: "make",
    name: "Make.com",
    category: "Automation",
    description: "Trigger approved Make scenarios through a custom webhook.",
    implementation: "live",
    authType: "webhook",
    fields: [{ key: "webhookUrl", label: "Webhook URL", secret: true, placeholder: "https://hook.eu1.make.com/…" }],
    actions: ["trigger_external_workflow"],
    docsUrl: "https://www.make.com/en/help/tools/webhooks",
  },
  {
    slug: "n8n",
    name: "n8n",
    category: "Automation",
    description: "Trigger approved n8n workflows through a webhook node.",
    implementation: "live",
    authType: "webhook",
    fields: [
      { key: "webhookUrl", label: "Webhook URL", secret: true, placeholder: "https://your-n8n/webhook/…" },
      { key: "headerSecret", label: "Header auth value (optional)", secret: true },
    ],
    actions: ["trigger_external_workflow"],
    docsUrl: "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/",
  },
  {
    slug: "stripe",
    name: "Stripe",
    category: "Payments",
    description: "Read balance and payouts. Outbound payments are never automated.",
    implementation: "live",
    authType: "api_key",
    fields: [{ key: "secretKey", label: "Restricted secret key (read-only)", secret: true, placeholder: "rk_live_…" }],
    actions: [],
    docsUrl: "https://docs.stripe.com/keys#limit-access",
    note: "Use a restricted, read-only key. JARVIS will not move money automatically.",
  },
  {
    slug: "google-analytics",
    name: "Google Analytics 4",
    category: "Analytics",
    description: "Website traffic and conversions (OAuth / service account).",
    implementation: "planned",
    authType: "oauth",
    fields: [
      { key: "propertyId", label: "GA4 property ID", secret: false },
      { key: "serviceAccountJson", label: "Service account JSON", secret: true },
    ],
    actions: [],
    docsUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart-client-libraries",
  },
];

export function getIntegrationDef(slug: string) {
  return INTEGRATIONS.find((i) => i.slug === slug);
}
