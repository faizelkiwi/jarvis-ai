import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Use — JARVIS AI" };

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 prose-jarvis">
      <h1>Terms of Use</h1>
      <p><em>Last updated: 14 November 2026.</em></p>
      <p>JARVIS AI is a private business assistant for its owner and invited users only. By using it you agree to use it lawfully and only for the owner&apos;s business purposes.</p>
      <p>AI-generated content may contain errors and should be reviewed. Consequential actions (sending messages or email, publishing, payments) are performed only after explicit human approval.</p>
      <p>The service is provided as-is, without warranties. Access may be withdrawn by the owner at any time.</p>
      <p>See also the <a href="/privacy">Privacy Policy</a>.</p>
    </main>
  );
}
