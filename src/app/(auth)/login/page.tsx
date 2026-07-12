import type { Metadata } from "next";
import { Printer } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-brand-700 p-6">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl sm:p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <Printer aria-hidden="true" />
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-brand-600">
          PrintFlow
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in to manage your printing workspace.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
