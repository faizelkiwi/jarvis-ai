/** Starts the in-process background worker on Node.js servers (dev / self-hosted). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startNode } = await import("./instrumentation-node");
    await startNode();
  }
}
