# JARVIS — Architecture & Decisions

## Overview

```
Browser (Next.js React UI, PWA manifest, Web Speech API for voice)
   │  same-origin JSON API (session cookie, RBAC, CSRF origin check, rate limits)
   ▼
Next.js server (App Router route handlers + server components)
   ├── Orchestrator (JARVIS)  ── plans → creates tasks with dependencies
   ├── Task engine            ── dependency graph, checkpoints, retries, cancellation
   ├── Agent runner           ── tool-use loop, permission enforcement, RAG, logging
   ├── Approval engine        ── the ONLY path to consequential side effects
   ├── Integrations           ── encrypted credentials, connection tests, executors
   ├── Knowledge (RAG)        ── chunking, embeddings, pgvector + full-text hybrid search
   └── Audit log              ── append-only, hash-chained, DB-trigger protected
   │
   ▼
PostgreSQL + pgvector (Supabase in production · embedded PGlite in dev/tests)
   ▲
Background worker (DB job queue, FOR UPDATE SKIP LOCKED) — in-process, `npm run worker`, or Vercel Cron
```

## Key decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Single Next.js (TypeScript) codebase** for UI + API + orchestration | One language, one deploy unit on Vercel, shared types between UI and backend. The orchestration lives in `src/server/*` — framework-independent modules that the worker script also imports. |
| 2 | **Drizzle ORM + PostgreSQL + pgvector** | Works identically on Supabase and on embedded PGlite. SQL migrations are in `drizzle/`. |
| 3 | **Embedded PGlite for development & tests** | Zero setup; tests run against a real Postgres engine (not mocks), including pgvector and triggers. |
| 4 | **Own session auth instead of Supabase Auth** | Keeps auth inside the same transaction/audit model, works with any Postgres, no client-side DB keys. Supabase Auth can be added later as an identity provider. The browser never talks to the database directly. |
| 5 | **DB-backed job queue** | No extra infrastructure (Redis). `SKIP LOCKED` makes it safe for multiple workers; stale locks are recovered. |
| 6 | **Human-approval model enforced structurally** | Consequential tools never perform side effects: they write an approval row. Executors (`src/server/approvals/executors.ts`) re-read the approval and refuse unless it is `approved`. Decisions are single-use (`UPDATE … WHERE status='pending'`). Consequential actions cannot be added to auto-approval rules (validated server-side). |
| 7 | **Provider abstraction** (`src/server/ai`) | Claude via the official Anthropic SDK (primary, with server-side refusal fallbacks and Claude-hosted web search). OpenAI and Gemini via REST adapters. Per-agent provider/model/effort. |
| 8 | **Prompt-injection posture** | Retrieved knowledge, uploads, dependency outputs and web content are wrapped in delimited tags and labelled as data; agents only get tools they are granted; and — most importantly — even a fully hijacked model can at most *request* a consequential action. |
| 9 | **Hybrid retrieval** | pgvector cosine similarity + Postgres full-text search, fused with reciprocal-rank fusion. Local hashing embeddings work offline; OpenAI embeddings optional. |
| 10 | **Demo mode is explicit** | `JARVIS_DEMO_MODE=true` swaps in a deterministic offline provider and shows a banner on every page. Production never silently fakes AI output. |

## Data model (main tables)

`users, sessions, settings, credentials (encrypted), agents, projects, project_agents, commands, tasks, task_logs, jobs, approvals, audit_log, knowledge_documents, knowledge_chunks (vector(384)), workflows, workflow_runs, integrations, notifications, transactions, ai_usage, rate_limits`.

## Request flow: "JARVIS, research competitors and email me a summary"

1. `POST /api/commands` → `commands` row (status `planning`) + `plan_command` job.
2. Worker → orchestrator asks Claude for a JSON plan (structured output constrained to active agent slugs).
3. Tasks are created with dependencies (research → personal assistant). Ready tasks are enqueued.
4. Each agent runs a tool-use loop: retrieves knowledge, may web-search, may call tools. `send_email` files an approval → task becomes `awaiting_approval`.
5. When all agent work is done, JARVIS synthesises a consolidated response.
6. The owner approves in the queue → executor sends via the configured integration, or reports honestly that it is not configured. Everything is audit-logged.

## Security & privacy (POPIA)

- Purpose limitation & minimality: only business data the owner enters/uploads is stored; no third-party tracking.
- Access: RBAC (owner/admin/operator/viewer); data-subject export at `/api/account/export`.
- Security safeguards (POPIA s19): encryption of credentials at rest, hashed sessions, lock-out, rate limits, audit trail, security headers.
- Retention: temporary memory expires automatically; expired sessions purged hourly.
- Cross-border transfer: AI prompts are sent to the configured AI provider (e.g. Anthropic, US). Document this in your privacy notice and avoid uploading special personal information unless you have a lawful basis.
- Production hardening checklist is in `README.md`.
