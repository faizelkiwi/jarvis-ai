"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorText, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";

export function AuthForm({ mode, firstUser }: { mode: "login" | "register"; firstUser?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const f = new FormData(e.currentTarget);
    try {
      await api(`/api/auth/${mode}`, { body: Object.fromEntries(f.entries()) });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }
  return (
    <form onSubmit={submit} className="panel p-5 space-y-4">
      <h2 className="font-semibold">{mode === "login" ? "Sign in to the command centre" : firstUser ? "Create the owner account" : "Create an account"}</h2>
      {mode === "register" && firstUser && <p className="text-xs text-muted">The first account becomes the owner with full authority over JARVIS.</p>}
      {mode === "register" && (
        <Field label="Name">
          <Input name="name" required autoComplete="name" maxLength={100} />
        </Field>
      )}
      <Field label="Email">
        <Input name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Password" hint={mode === "register" ? "At least 10 characters with upper- and lower-case letters and a number." : undefined}>
        <Input name="password" type="password" required autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 10 : 1} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-xs text-muted">
        {mode === "login" ? (
          <>No account yet? <Link className="text-accent" href="/register">Register</Link></>
        ) : (
          <>Already registered? <Link className="text-accent" href="/login">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
