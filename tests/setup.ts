// Each test file runs in its own process with a fresh in-memory Postgres (PGlite + pgvector).
process.env.JARVIS_PGLITE_DIR = "memory://";
process.env.JARVIS_DEMO_MODE = "true";
delete process.env.DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;
