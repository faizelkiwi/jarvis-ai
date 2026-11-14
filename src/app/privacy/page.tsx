import type { Metadata } from "next";
import { getSetting } from "@/server/settings/service";

export const metadata: Metadata = { title: "Privacy Policy — JARVIS AI" };
export const dynamic = "force-dynamic";

export default async function Privacy() {
  const p = await getSetting("business.profile");
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 prose-jarvis">
      <h1>Privacy Policy</h1>
      <p><em>JARVIS AI — private business assistant operated by {p.name}. Last updated: 14 November 2026.</em></p>
      <p>JARVIS is a private application used only by its owner and the people the owner invites. It is not offered to the public.</p>
      <h2>Information we process</h2>
      <ul>
        <li>Account details of invited users (name, email, hashed password).</li>
        <li>Instructions, tasks, documents and records that users enter or upload.</li>
        <li>Data from services the owner connects (for example Gmail, WhatsApp, Telegram), only to perform tasks the owner requests.</li>
      </ul>
      <h2>Google user data</h2>
      <p>When the owner connects Gmail, JARVIS uses the Gmail API to read messages the owner asks it to search or summarise, and to send emails the owner has explicitly approved. Google data is not sold, not used for advertising, not used to train general AI models, and not shared with third parties except the AI provider that processes the specific request on the owner&apos;s behalf.</p>
      <p>JARVIS&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
      <h2>Storage and security</h2>
      <p>Data is stored in the owner&apos;s own database. Access tokens and API keys are encrypted at rest. Access is restricted by role, and actions are recorded in an audit log.</p>
      <h2>Your rights (POPIA / GDPR)</h2>
      <p>Users can export their personal data from Settings → Data &amp; backup, and may ask the owner to correct or delete it. Google access can be revoked at any time in JARVIS (Integrations → Gmail → Disconnect) or at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>
      <h2>Contact</h2>
      <p>Questions about this policy: contact the JARVIS owner{p.name ? ` (${p.name})` : ""}.</p>
    </main>
  );
}
