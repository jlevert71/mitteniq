"use client";
import { useRouter } from "next/navigation";

import Link from "next/link";
export default function LoginPage() {
      const router = useRouter();
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="mb-8">
          <div className="text-lg font-semibold">MittenIQ</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Log in</h1>
          <p className="mt-2 text-sm text-white/70">
            This is a placeholder login screen. Next step will wire real auth.
          </p>
        </div>

        <form action="/api/login" method="POST" className="space-y-4">
          <label className="block">
            <div className="mb-1 text-sm text-white/80">Email</div>
            <input
              type="email"
              className="w-full rounded-md border border-white/15 bg-black px-3 py-2 text-white outline-none focus:border-white/40"
              placeholder="you@company.com"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-sm text-white/80">Password</div>
            <input
              type="password"
              className="w-full rounded-md border border-white/15 bg-black px-3 py-2 text-white outline-none focus:border-white/40"
              placeholder="••••••••"
            />
          </label>

        <button
  type="button"
  className="block w-full rounded-md bg-white px-4 py-2 text-center text-sm font-medium text-black hover:opacity-90"
  onClick={async () => {
    await fetch("/api/login", { method: "POST" });
    router.push("/dashboard");
  }}
>
  Log in
</button>  
        </form>

        <div className="mt-8 text-xs text-white/50">
          Next: we’ll add real authentication + sessions and protect the dashboard.
        </div>
      </div>
    </main>
  );
}