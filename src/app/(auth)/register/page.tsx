import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { userCount } from "@/server/auth/service";
import { getSetting } from "@/server/settings/service";
import { currentUser } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await currentUser()) redirect("/dashboard");
  const first = (await userCount()) === 0;
  if (!first && !(await getSetting("auth.settings")).allowRegistration)
    return (
      <div className="panel p-5 text-sm">
        <p className="font-semibold mb-2">Registration is closed</p>
        <p className="text-muted">Ask the JARVIS owner to enable registration in Settings → Security, or to create your account.</p>
        <a href="/login" className="mt-4 inline-block text-accent">Back to sign in</a>
      </div>
    );
  return <AuthForm mode="register" firstUser={first} />;
}
