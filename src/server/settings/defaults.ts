import { z } from "zod";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export const PROVIDERS = ["anthropic", "openai", "gemini"] as const;
export type ProviderName = (typeof PROVIDERS)[number] | "demo";

export const settingSchemas = {
  "business.profile": z.object({
    name: z.string().max(200),
    tagline: z.string().max(300),
    industry: z.string().max(200),
    description: z.string().max(5000),
    goals: z.string().max(5000),
    currency: z.string().length(3),
    timezone: z.string().max(64),
    country: z.string().max(64),
  }),
  "ai.defaults": z.object({
    provider: z.enum(PROVIDERS),
    model: z.string().min(1).max(100),
    effort: z.enum(EFFORTS),
    orchestratorModel: z.string().min(1).max(100),
    embeddingProvider: z.enum(["local", "openai"]),
    monthlyBudgetUsd: z.number().min(0).max(1_000_000),
  }),
  "approvals.rules": z.object({
    /** Lower-risk internal actions that may run automatically. Consequential actions are never listed here. */
    autoApprove: z.record(z.string(), z.boolean()),
  }),
  "memory.settings": z.object({
    temporaryRetentionDays: z.number().int().min(1).max(365),
    ragEnabled: z.boolean(),
    maxRetrievedChunks: z.number().int().min(1).max(20),
  }),
  "voice.settings": z.object({
    enabled: z.boolean(),
    speakResponses: z.boolean(),
    voiceName: z.string().max(200),
    rate: z.number().min(0.5).max(2),
    pitch: z.number().min(0).max(2),
    language: z.string().max(20),
  }),
  "notifications.settings": z.object({
    approvalRequests: z.boolean(),
    taskFailures: z.boolean(),
    taskCompletions: z.boolean(),
  }),
  "auth.settings": z.object({
    allowRegistration: z.boolean(),
    sessionDays: z.number().int().min(1).max(30),
  }),
  "backup.settings": z.object({
    reminderDays: z.number().int().min(1).max(90),
    lastBackupAt: z.string().nullable(),
  }),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingSchemas)[K]>;

export const DEFAULT_SETTINGS: { [K in SettingKey]: SettingValue<K> } = {
  "business.profile": {
    name: "My Digital Business",
    tagline: "Your Business. Your Intelligence. Your Control.",
    industry: "Digital products, affiliate marketing and content creation",
    description: "",
    goals: "",
    currency: "ZAR",
    timezone: "Africa/Johannesburg",
    country: "South Africa",
  },
  "ai.defaults": {
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "medium",
    orchestratorModel: "claude-opus-5-5",
    embeddingProvider: "local",
    monthlyBudgetUsd: 100,
  },
  "approvals.rules": {
    autoApprove: {
      save_memory: true,
      delegate_task: true,
      create_project: true,
      record_transaction: false,
    },
  },
  "memory.settings": { temporaryRetentionDays: 7, ragEnabled: true, maxRetrievedChunks: 6 },
  "voice.settings": {
    enabled: true,
    speakResponses: true,
    voiceName: "",
    rate: 1,
    pitch: 1,
    language: "en-ZA",
  },
  "notifications.settings": { approvalRequests: true, taskFailures: true, taskCompletions: true },
  "auth.settings": { allowRegistration: false, sessionDays: 7 },
  "backup.settings": { reminderDays: 7, lastBackupAt: null },
};
