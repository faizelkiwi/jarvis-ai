import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { userCount } from "@/server/auth/service";
import { currentUser } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");
  if ((await userCount()) === 0) redirect("/register");
  return <AuthForm mode="login" />;
}
