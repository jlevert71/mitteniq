import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import Link from "next/link";

export default async function DashboardPage() {
const cookieStore = await cookies();
const auth = cookieStore.get("mitten-auth");

  if (!auth) {
    redirect("/login");
  }
  return (
    <main className="min-h-screen bg-black text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="text-lg font-semibold tracking-tight">Dashboard</div>
        <Link
          href="/"
          className="rounded-md border border-white/20 px-4 py-2 text-sm hover:border-white/40"
        >
          Back to site
        </Link>
        <form action="/api/logout" method="POST">
  <button
    type="submit"
    className="rounded-md border border-white/20 px-4 py-2 text-sm hover:border-white/40"
  >
    Log out
  </button>
</form>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome</h1>
        <p className="mt-3 text-white/70">
          This is the protected area (next step will require login).
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 p-5">
            <div className="font-medium">File Intake</div>
            <div className="mt-2 text-sm text-white/70">
              Start a new intake report from uploaded drawings.
            </div>
          </div>
          <div className="rounded-lg border border-white/10 p-5">
            <div className="font-medium">Agents</div>
            <div className="mt-2 text-sm text-white/70">
              Choose Estimating Assistant → Chief.
            </div>
          </div>
          <div className="rounded-lg border border-white/10 p-5">
            <div className="font-medium">Savings</div>
            <div className="mt-2 text-sm text-white/70">
              Track ROI and time saved.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}