import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public, secret-free deployment diagnostics. Reports which configuration is present
 * and classifies database errors into plain-language causes. Never echoes values.
 */
export async function GET() {
  const checks: Record<string, string> = {};
  const url = process.env.DATABASE_URL;
  checks.DATABASE_URL = url ? "set" : "MISSING — add it in Vercel → Settings → Environment Variables, then redeploy";
  checks.JARVIS_ENCRYPTION_KEY = process.env.JARVIS_ENCRYPTION_KEY
    ? /^[0-9a-f]{64}$/i.test(process.env.JARVIS_ENCRYPTION_KEY) || Buffer.from(process.env.JARVIS_ENCRYPTION_KEY, "base64").length === 32
      ? "set"
      : "INVALID — must be 64 hex characters (generate with the node command)"
    : "MISSING";
  checks.CRON_SECRET = process.env.CRON_SECRET ? "set" : "MISSING";
  checks.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ? (process.env.ANTHROPIC_API_KEY.startsWith("sk-ant-") ? "set" : "set (unexpected format — should start with sk-ant-)") : "not set (can be added in the app)";
  checks.DEMO_MODE = process.env.JARVIS_DEMO_MODE === "true" ? "ON (placeholder AI)" : "off";

  let database = "not tested";
  if (url) {
    try {
      const u = new URL(url);
      checks.DATABASE_HOST = `${u.hostname}:${u.port || "5432"}`;
      if (u.password.includes("[") || u.password.toUpperCase().includes("YOUR-PASSWORD")) database = "PLACEHOLDER PASSWORD — replace [YOUR-PASSWORD] with your real database password (no brackets)";
    } catch {
      database = "INVALID DATABASE_URL — if your password contains special characters (@ # / ? : %), reset it in Supabase to one with only letters and numbers";
    }
    if (database === "not tested") {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: url, ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false }, connectionTimeoutMillis: 8000, max: 1 });
      try {
        await pool.query("select 1");
        try {
          const r = await pool.query("select count(*)::int as n from agents");
          database = `connected · tables present · ${r.rows[0].n} agents`;
        } catch (e) {
          const code = (e as { code?: string }).code;
          database = code === "42P01" ? "connected, but TABLES MISSING — run `npm run db:migrate` with this DATABASE_URL" : `connected, query failed (code ${code ?? "unknown"})`;
        }
      } catch (e) {
        const err = e as { code?: string; message?: string };
        const m = err.message ?? "";
        database =
          err.code === "28P01" || /password authentication failed/i.test(m)
            ? "WRONG PASSWORD in DATABASE_URL"
            : err.code === "ENOTFOUND" || err.code === "EAI_AGAIN"
              ? "HOST NOT FOUND — copy the Transaction pooler string from Supabase → Connect"
              : /Tenant or user not found/i.test(m)
                ? "WRONG USERNAME — the pooler user must look like postgres.<project-ref>"
                : err.code === "ETIMEDOUT" || /timeout/i.test(m)
                  ? "CONNECTION TIMED OUT — use the Transaction pooler (port 6543), not the direct connection"
                  : `connection failed (code ${err.code ?? "unknown"})`;
      } finally {
        await pool.end().catch(() => {});
      }
    }
  }
  return NextResponse.json({ ok: database.startsWith("connected · tables present") && checks.JARVIS_ENCRYPTION_KEY === "set", database, checks });
}
