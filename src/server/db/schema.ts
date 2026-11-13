/**
 * JARVIS database schema (PostgreSQL + pgvector).
 *
 * Works unchanged on Supabase/managed Postgres (production) and on embedded
 * PGlite (local development and automated tests).
 */
import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  jsonb,
  numeric,
  bigserial,
  vector,
  index,
  uniqueIndex,
  primaryKey,
  date,
} from "drizzle-orm/pg-core";

export const EMBEDDING_DIMENSIONS = 384;

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ───────────────────────────── Identity & access ─────────────────────────────

export const USER_ROLES = ["owner", "admin", "operator", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<UserRole>().notNull().default("viewer"),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the session token; the raw token only ever lives in the cookie.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Key/value configuration (business profile, approval rules, AI defaults…). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by"),
  updatedAt: updatedAt(),
});

/** Encrypted secrets (AES-256-GCM). Values are never returned to the browser. */
export const credentials = pgTable("credentials", {
  id: id(),
  provider: text("provider").notNull().unique(),
  encryptedValue: text("encrypted_value").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────────────────────── Agents ─────────────────────────────

export const agents = pgTable("agents", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  responsibilities: jsonb("responsibilities").$type<string[]>().notNull().default([]),
  systemPrompt: text("system_prompt").notNull(),
  provider: text("provider"), // null → use global default
  model: text("model"), // null → use global default
  effort: text("effort"), // low | medium | high | xhigh | max
  active: boolean("active").notNull().default(true),
  /** Tool names this agent may use. Consequential tools still route through approvals. */
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  /** Agent slugs this agent may delegate to / communicate with. */
  canDelegateTo: jsonb("can_delegate_to").$type<string[]>().notNull().default([]),
  /** Knowledge categories this agent retrieves from ("*" = all). */
  knowledgeScopes: jsonb("knowledge_scopes").$type<string[]>().notNull().default(["*"]),
  color: text("color").notNull().default("cyan"),
  icon: text("icon").notNull().default("bot"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────────────────────── Projects, commands, tasks ─────────────────────────────

export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  objective: text("objective").notNull().default(""),
  status: text("status").$type<ProjectStatus>().notNull().default("active"),
  dueDate: date("due_date"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projectAgents = pgTable(
  "project_agents",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.agentId] })],
);

export const COMMAND_STATUSES = ["planning", "running", "awaiting_approval", "completed", "failed"] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

/** A natural-language instruction given to JARVIS (text or voice). */
export const commands = pgTable(
  "commands",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    input: text("input").notNull(),
    channel: text("channel").$type<"text" | "voice" | "workflow">().notNull().default("text"),
    status: text("status").$type<CommandStatus>().notNull().default("planning"),
    plan: jsonb("plan"),
    response: text("response"),
    error: text("error"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("commands_created_idx").on(t.createdAt)],
);

export const TASK_STATUSES = [
  "pending",
  "assigned",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    commandId: uuid("command_id").references(() => commands.id, { onDelete: "set null" }),
    workflowRunId: uuid("workflow_run_id"),
    parentTaskId: uuid("parent_task_id"),
    /** "agent" tasks run an AI agent; "checkpoint" tasks wait for a human approval. */
    kind: text("kind").$type<"agent" | "checkpoint" | "manual">().notNull().default("agent"),
    status: text("status").$type<TaskStatus>().notNull().default("pending"),
    priority: text("priority").$type<TaskPriority>().notNull().default("medium"),
    dueDate: date("due_date"),
    dependsOn: jsonb("depends_on").$type<string[]>().notNull().default([]),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: text("output"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(2),
    createdBy: text("created_by").notNull().default("user"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_status_idx").on(t.status),
    index("tasks_agent_idx").on(t.agentId),
    index("tasks_command_idx").on(t.commandId),
    index("tasks_project_idx").on(t.projectId),
  ],
);

export const taskLogs = pgTable(
  "task_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id"),
    level: text("level").$type<"info" | "warn" | "error" | "tool" | "llm">().notNull(),
    message: text("message").notNull(),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [index("task_logs_task_idx").on(t.taskId)],
);

// ───────────────────────────── Background jobs ─────────────────────────────

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<"queued" | "running" | "done" | "failed">().notNull().default("queued"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("jobs_ready_idx").on(t.status, t.runAt)],
);

// ───────────────────────────── Approvals & audit ─────────────────────────────

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "changes_requested",
  "executed",
  "execution_failed",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    action: text("action").notNull(),
    title: text("title").notNull(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    expectedOutcome: text("expected_outcome").notNull(),
    risks: text("risks").notNull(),
    riskLevel: text("risk_level").$type<"low" | "medium" | "high" | "critical">().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<ApprovalStatus>().notNull().default("pending"),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    executionResult: jsonb("execution_result"),
    createdAt: createdAt(),
  },
  (t) => [index("approvals_status_idx").on(t.status)],
);

/**
 * Append-only, hash-chained audit log. UPDATE/DELETE are blocked by a database
 * trigger (see drizzle/0001_audit_immutability.sql).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    actorType: text("actor_type").$type<"user" | "agent" | "system">().notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    details: jsonb("details"),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [index("audit_ts_idx").on(t.ts)],
);

// ───────────────────────────── Knowledge & memory ─────────────────────────────

export const KNOWLEDGE_KINDS = [
  "verified_fact",
  "preference",
  "temporary",
  "assumption",
  "document",
  "research",
  "procedure",
  "decision",
] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: id(),
    title: text("title").notNull(),
    category: text("category").notNull().default("general"),
    kind: text("kind").$type<KnowledgeKind>().notNull().default("document"),
    source: text("source").$type<"upload" | "manual" | "agent" | "task">().notNull(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    content: text("content").notNull(),
    verified: boolean("verified").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("knowledge_kind_idx").on(t.kind), index("knowledge_category_idx").on(t.category)],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: id(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    embeddingModel: text("embedding_model").notNull(),
  },
  (t) => [
    index("knowledge_chunks_doc_idx").on(t.documentId),
    index("knowledge_chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

// ───────────────────────────── Workflows ─────────────────────────────

export type WorkflowStep =
  | { id: string; type: "agent"; agentSlug: string; instruction: string }
  | { id: string; type: "approval"; title: string; instruction?: string }
  | { id: string; type: "integration"; action: string; instruction: string; params?: Record<string, string> };

export const workflows = pgTable("workflows", {
  id: id(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  steps: jsonb("steps").$type<WorkflowStep[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workflowRuns = pgTable("workflow_runs", {
  id: id(),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  status: text("status").$type<"running" | "completed" | "failed" | "cancelled">().notNull().default("running"),
  input: text("input").notNull().default(""),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ───────────────────────────── Integrations, notifications, finance, usage ─────────────────────────────

export const integrations = pgTable("integrations", {
  slug: text("slug").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config").$type<Record<string, string>>().notNull().default({}),
  status: text("status")
    .$type<"not_configured" | "configured" | "connected" | "error">()
    .notNull()
    .default("not_configured"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: updatedAt(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    level: text("level").$type<"info" | "success" | "warning" | "error">().notNull().default("info"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link"),
    read: boolean("read").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_created_idx").on(t.createdAt)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    date: date("date").notNull(),
    description: text("description").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("ZAR"),
    type: text("type").$type<"income" | "expense">().notNull(),
    category: text("category").notNull().default("uncategorised"),
    source: text("source").$type<"manual" | "agent" | "import">().notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [index("transactions_date_idx").on(t.date)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    agentId: uuid("agent_id"),
    taskId: uuid("task_id"),
    purpose: text("purpose").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("rate_limits_key_window").on(t.key, t.windowStart)],
);
