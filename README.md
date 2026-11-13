# JARVIS AI — Autonomous Business Operating System

**Your Business. Your Intelligence. Your Control.**

JARVIS is a multi-agent AI business operating system. A central orchestrator (JARVIS) interprets your instructions — typed or spoken — delegates work to twelve specialised agents, collects their results and reports back. Anything consequential (publishing, sending, paying, advertising, triggering external workflows, deleting information) waits in an approval queue for your decision.

- **Stack:** Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Drizzle ORM · PostgreSQL + pgvector (Supabase) · Anthropic Claude (primary), OpenAI & Gemini (optional)
- **Architecture & decisions:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **What's done / what's next:** [`DEVELOPMENT_STATUS.md`](DEVELOPMENT_STATUS.md)

## Quick start (local)

Requirements: Node.js 20+.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Add your Anthropic key to `.env.local` (`ANTHROPIC_API_KEY=sk-ant-…`) — or enter it later under **Integrations**.

```bash
npm run dev
```

Open http://localhost:3000. The first account you register becomes the **owner**. No database setup is needed locally: an embedded PostgreSQL (with pgvector) is created in `.data/`, migrations run automatically and the background worker runs inside the dev server.

**Try without an API key:** `JARVIS_DEMO_MODE=true npm run dev` runs the full system (delegation, tasks, approvals, workflows, logging) with a placeholder AI. Every page shows a DEMO banner; nothing it produces is real AI output.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server + in-process worker |
| `npm test` | Automated tests (real embedded Postgres) |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run build` / `npm start` | Production build / server |
| `npm run worker` | Standalone background worker (needs `DATABASE_URL`) |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:generate` | Generate a migration after editing `src/server/db/schema.ts` |

## Deploying to production (Supabase + Vercel)

1. **Supabase:** create a project. Under *Database → Extensions* enable `vector`. Copy the *Session pooler* connection string.
2. **Migrate:** `DATABASE_URL=… npm run db:migrate`
3. **Vercel:** import the GitHub repository and set environment variables:
   - `DATABASE_URL` — Supabase connection string
   - `JARVIS_ENCRYPTION_KEY` — `openssl rand -hex 32` (store a copy safely)
   - `CRON_SECRET` — a long random string
   - `ANTHROPIC_API_KEY` — optional (can be entered in the app instead)
   - `JARVIS_INPROCESS_WORKER=false`
4. **Background worker** — choose one:
   - **Recommended:** run `npm run worker` on an always-on host (Railway, Render, Fly.io) with the same `DATABASE_URL` and `JARVIS_ENCRYPTION_KEY`. Agents start within ~2 seconds.
   - **Vercel-only:** `vercel.json` schedules `/api/cron/worker` every minute (requires a Vercel plan that allows per-minute crons). Tasks then start within a minute.
5. **Domain:** add it in Vercel → *Domains*. HTTPS is automatic.
6. **Backups:** enable Supabase point-in-time recovery; owners can also download a JSON export in *Settings → Data & backup*.
7. **Monitoring:** *Settings → System health* shows database, worker heartbeat, failed jobs, integration status, token use and estimated cost. Add Vercel/Supabase alerting for uptime.

### Production hardening checklist
- Use a dedicated Postgres role for the app; never expose Supabase keys to the browser (JARVIS does not use them client-side).
- Keep registration closed (default) and grant roles deliberately.
- Use restricted, least-privilege API keys (e.g. Stripe read-only restricted key).
- Rotate `CRON_SECRET` and provider keys periodically; `JARVIS_ENCRYPTION_KEY` rotation requires re-entering stored credentials.

## Credentials you need to provide

| What | Where to get it | Unlocks |
|---|---|---|
| **Anthropic API key** (required for live AI) | platform.claude.com → API keys | JARVIS, all agents, web research |
| Supabase project | supabase.com | Production database |
| Vercel account | vercel.com | Hosting |
| Resend API key + verified domain | resend.com | Approved outbound email |
| Telegram bot token | @BotFather | Approved Telegram messages |
| WhatsApp Cloud API token + phone number ID | Meta for Developers | Approved customer messages |
| Facebook Page access token + page ID | Meta for Developers | Approved Facebook posts |
| Make.com / n8n webhook URL | Your scenario/workflow | Approved automation triggers |
| Stripe restricted key (read-only) | Stripe dashboard | Connection check (finance data import is planned) |
| OpenAI / Gemini keys (optional) | Provider consoles | Alternative models, OpenAI embeddings |

Google (Gmail, Calendar, Drive, Analytics), Microsoft 365, Instagram, TikTok and YouTube connectors are **planned** — credentials can be stored now, and actions that need them report "not implemented" instead of pretending to succeed. See `DEVELOPMENT_STATUS.md`.

## Using JARVIS

- **Dashboard** — your morning view: what's running, what needs approval, what was completed, recent activity, quick commands.
- **JARVIS Command** — natural-language instructions (text or 🎤 voice). Watch agents work and read the consolidated response; voice instructions are answered aloud.
- **AI Agents** — edit instructions, models, effort, tools/permissions, delegation graph, knowledge scopes and project assignments; create new agents.
- **Approvals** — approve, reject or request changes. Requesting changes sends the work back to the agent with your feedback.
- **Workflows** — chain agent steps, approval checkpoints and external actions; start from the content-pipeline template.
- **Knowledge Base** — upload PDFs, text, Markdown, CSV and JSON; add verified facts and preferences; inspect and correct what JARVIS remembers.
