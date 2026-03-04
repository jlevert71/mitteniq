"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSetup() {
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/projects");
    } else {
      const data = await res.json();
      setError(data.error || "Setup failed");
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="mb-8">
          <div className="text-lg font-semibold">MittenIQ</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Set up your account</h1>
          <p className="mt-2 text-sm text-white/70">
            Enter your approved email address and choose a password.
          </p>
        </div>

        <div className="space-y-4">
          <label className="block">
            <div className="mb-1 text-sm text-white/80">Email</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-white/15 bg-black px-3 py-2 text-white outline-none focus:border-white/40"
              placeholder="you@company.com"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-sm text-white/80">Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-white/15 bg-black px-3 py-2 text-white outline-none focus:border-white/40"
              placeholder="••••••••"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-sm text-white/80">Confirm password</div>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSetup()}
              className="w-full rounded-md border border-white/15 bg-black px-3 py-2 text-white outline-none focus:border-white/40"
              placeholder="••••••••"
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="button"
            onClick={handleSetup}
            disabled={loading}
            className="block w-full rounded-md bg-white px-4 py-2 text-center text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Setting up..." : "Set up account"}
          </button>
        </div>

        <div className="mt-6 text-center">
          <a href="/login" className="text-xs text-white/40 hover:text-white/70">
            Already have an account? Log in
          </a>
        </div>
      </div>
    </main>
  );
}