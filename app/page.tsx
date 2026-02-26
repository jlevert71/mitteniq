"use client"

import { useState } from "react"

export default function HomePage() {
  const [status, setStatus] = useState<"idle" | "success" | "error" | "loading">("idle")
  const [statusMsg, setStatusMsg] = useState<string>("")

  const steps = [
    {
      n: "01",
      title: "Upload Drawings + Specs",
      desc: "Drop in the PDFs. We flag scan quality, vector vs raster, and scale trust before you waste time.",
    },
    {
      n: "02",
      title: "Get a Clean Intake Report",
      desc: "A structured summary so you know what you’ve got, what’s missing, and what needs a manual check.",
    },
    {
      n: "03",
      title: "Start Takeoff Without Chaos",
      desc: "Your project is organized and ready—no more PDF scavenger hunt before you even begin.",
    },
  ]

  const coming = [
    "File intake + automatic folder organization",
    "Spec section breakdown into individual PDFs",
    "Drawing separation by trade",
    "Electrical quantity extraction (starting with panels, feeders, gear, devices)",
    "Code / spec conflict review (flag scope risks early)",
    "Takeoff sheet generation (clean starting point for estimating)",
  ]

  const faqs = [
    {
      q: "Is MittenIQ live today?",
      a: "Not yet. This page is a waitlist. We’re building and testing the intake + organization workflow first.",
    },
    {
      q: "Do I need new computers or IT to use this?",
      a: "No. The goal is simple: log in and run the workflow. No new hardware, no IT projects, no training hell.",
    },
    {
      q: "What happens when I join the waitlist?",
      a: "You’ll get an email when early access opens. If you leave a note about the work you bid, we’ll prioritize the right workflows.",
    },
    {
      q: "Are you taking and storing my drawings right now?",
      a: "No. This is waitlist-only. When uploads go live, files will be processed securely and not used to train public AI systems.",
    },
    {
      q: "Is this replacing estimators?",
      a: "No. This is about cutting payroll-burdened grunt work before takeoff—organizing, splitting specs, sorting sheets, and flagging scope risk.",
    },
  ]

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus("loading")
    setStatusMsg("")

    const form = e.currentTarget
    const fd = new FormData(form)

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        body: fd,
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || data?.ok === false) {
        setStatus("error")
        setStatusMsg(data?.error || "Something went wrong. Try again.")
        return
      }

      setStatus("success")
      setStatusMsg("You’re on the waitlist. Check your email for confirmation.")
      form.reset()
    } catch {
      setStatus("error")
      setStatusMsg("Network error. Try again.")
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-zinc-100">
      {/* Top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-blueprint-700/20 to-transparent blur-2xl" />

      {/* NAV */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-300/20 to-orange-300/20 ring-1 ring-white/10" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide">MittenIQ</div>
            <div className="text-xs text-zinc-400">More bids. More wins. Same crew.</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/login"
            className="rounded-lg px-4 py-2 text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-white/5"
          >
            Log in
          </a>
          <a
            href="#waitlist"
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15"
          >
            Join Waitlist
          </a>
        </div>
      </header>

      {/* HERO */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-14 pb-20">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_30%,rgba(11,22,48,0.75),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(184,115,51,0.12),transparent_55%)]" />

        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-300 ring-1 ring-white/10 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-300/80" />
              Intake + workflow built for electrical contractors
            </div>

            <h1 className="mt-6 text-5xl font-bold tracking-tight leading-tight">
              <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                Stop paying estimators to organize PDFs.
              </span>
              <br />
              <span className="bg-gradient-to-r from-orange-200 to-orange-400 bg-clip-text text-transparent">
                Turn 2–4 hours of estimate prep into minutes.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-300">
              MittenIQ automates the grunt work before takeoff—intake, sorting, spec splitting, and scope flags—so your team
              starts clean and you push bid volume without adding headcount.
            </p>

            {/* “No new computer / no IT” highlight */}
            <div className="mt-6 max-w-xl rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
              <div className="text-sm font-semibold">No new computer stuff. No IT project.</div>
              <div className="mt-2 text-sm text-zinc-300 leading-relaxed">
                The goal is dead simple: you log in, upload the bid set, and the workflow runs. Your office can use it without
                training hell or chasing an IT department.
              </div>
            </div>

            {/* ROI math */}
            <div className="mt-6 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
              <div className="text-sm font-semibold">ROI math owners understand</div>
              <div className="mt-2 text-sm text-zinc-300 leading-relaxed">
                Typical intake + setup waste: <span className="font-semibold text-zinc-200">2–4 labor hours</span> per bid.
                At a <span className="font-semibold text-zinc-200">$75/hr payroll-burdened rate</span>, that’s{" "}
                <span className="font-semibold text-zinc-200">$150–$300</span> burned before takeoff starts.
              </div>
              <div className="mt-2 text-xs text-zinc-500">The goal: protect margins by cutting waste, not replacing judgment.</div>
            </div>

            {/* WAITLIST FORM */}
            <div id="waitlist" className="mt-10">
              <div className="mb-3 text-sm font-semibold">Join the waitlist</div>

              {/* Status banner */}
              {status !== "idle" && status !== "loading" && (
                <div
                  className={[
                    "mb-4 rounded-xl px-4 py-3 text-sm ring-1",
                    status === "success"
                      ? "bg-emerald-500/10 text-emerald-100 ring-emerald-300/20"
                      : "bg-red-500/10 text-red-100 ring-red-300/20",
                  ].join(" ")}
                >
                  {statusMsg}
                </div>
              )}

              <form onSubmit={onSubmit} className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400" htmlFor="name">
                      Name <span className="text-zinc-500">(required)</span>
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      placeholder="First/Last"
                      className="w-full rounded-xl bg-black/40 px-4 py-3 text-sm text-zinc-100 ring-1 ring-white/10 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-200/30"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-400" htmlFor="email">
                      Email <span className="text-zinc-500">(required)</span>
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      placeholder="you@company.com"
                      className="w-full rounded-xl bg-black/40 px-4 py-3 text-sm text-zinc-100 ring-1 ring-white/10 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-200/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-400" htmlFor="company">
                    Company <span className="text-zinc-500">(optional)</span>
                  </label>
                  <input
                    id="company"
                    name="company"
                    type="text"
                    placeholder="ACME Electric"
                    className="w-full rounded-xl bg-black/40 px-4 py-3 text-sm text-zinc-100 ring-1 ring-white/10 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-200/30"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-400" htmlFor="notes">
                    Notes / Message <span className="text-zinc-500">(optional)</span>
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={4}
                    placeholder="What kind of work do you bid? Any pain points you want fixed first?"
                    className="w-full rounded-xl bg-black/40 px-4 py-3 text-sm text-zinc-100 ring-1 ring-white/10 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-200/30"
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className={[
                      "inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold ring-1 transition",
                      status === "loading"
                        ? "bg-white/5 text-zinc-400 ring-white/10"
                        : "bg-orange-300/20 text-orange-100 ring-orange-200/30 hover:bg-orange-300/30",
                    ].join(" ")}
                  >
                    {status === "loading" ? "Sending..." : "Join Waitlist"}
                  </button>

                  <p className="text-xs text-zinc-500">
                    No spam. We’ll email when early access opens.
                  </p>
                </div>
              </form>
            </div>
          </div>

          {/* Report Preview Card */}
          <div className="relative">
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-blueprint-700/25 via-white/5 to-copper-500/20 blur-xl" />
            <div className="relative rounded-3xl bg-black/60 p-8 ring-1 ring-white/10 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-wider text-zinc-400">File Intake Report</div>
              <div className="mt-2 text-2xl font-semibold">Scale Confidence: High</div>

              <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl bg-black/40 p-4 ring-1 ring-white/10">
                  <div className="text-zinc-400">Content</div>
                  <div className="font-semibold">Vector + Text</div>
                </div>

                <div className="rounded-xl bg-black/40 p-4 ring-1 ring-white/10">
                  <div className="text-zinc-400">Scan Quality</div>
                  <div className="font-semibold">Pass</div>
                </div>

                <div className="rounded-xl bg-black/40 p-4 ring-1 ring-white/10">
                  <div className="text-zinc-400">Sheets</div>
                  <div className="font-semibold">24</div>
                </div>

                <div className="rounded-xl bg-black/40 p-4 ring-1 ring-white/10">
                  <div className="text-zinc-400">Calibration</div>
                  <div className="font-semibold">Not Required</div>
                </div>
              </div>

              <div className="mt-6 rounded-xl bg-black/40 p-4 text-xs text-zinc-300 ring-1 ring-white/10">
                Recommendation: proceed to takeoff. Flagged 2 sheets for manual scale check if field dimensions matter.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT'S COMING */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-4">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">What’s Coming</h2>
            <p className="mt-2 text-zinc-300">
              Built to cut prep time, tighten scope, and keep bids moving—without adding payroll.
            </p>
          </div>
          <div className="hidden text-sm text-zinc-400 md:block">Owner-first ROI. Estimator-approved workflow.</div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {coming.map((item) => (
            <div key={item} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2.5 w-2.5 rounded-full bg-orange-300/70" />
                <div className="text-sm text-zinc-200">{item}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
            <p className="mt-2 text-zinc-300">
              A clean intake process that sets you up to bid faster without sloppy misses.
            </p>
          </div>
          <div className="hidden text-sm text-zinc-400 md:block">Built for real contractor office workflow</div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 hover:bg-white/7.5">
              <div className="text-orange-200/80 text-sm font-bold mb-2">{s.n}</div>
              <h3 className="text-xl font-semibold mb-2">{s.title}</h3>
              <p className="text-zinc-300">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* VALUE STRIP */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-6">
        <div className="rounded-2xl bg-gradient-to-r from-blueprint-700/25 via-white/5 to-copper-500/15 p-6 ring-1 ring-white/10">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
              <div className="text-sm font-semibold">Scale confidence first</div>
              <div className="mt-1 text-sm text-zinc-300">Stop doing takeoff on garbage scans or unknown scale.</div>
            </div>
            <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
              <div className="text-sm font-semibold">Workflow that sticks</div>
              <div className="mt-1 text-sm text-zinc-300">Simple UI your office can run without training hell.</div>
            </div>
            <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
              <div className="text-sm font-semibold">More bids with same crew</div>
              <div className="mt-1 text-sm text-zinc-300">Push bid volume and protect margins without adding headcount.</div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 py-16">
        <h2 className="text-3xl font-bold tracking-tight text-center">Frequently Asked Questions</h2>
        <p className="mt-2 text-center text-zinc-300">Short answers. No hand-wavy nonsense.</p>

        <div className="mt-10 space-y-4">
          {faqs.map((item, index) => (
            <div key={index} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
              <h3 className="text-base font-semibold">{item.q}</h3>
              <p className="mt-2 text-sm text-zinc-300">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 mx-auto max-w-6xl px-6 pb-10 pt-2">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 md:flex-row">
          <div className="text-sm text-zinc-400">© {new Date().getFullYear()} MittenIQ. All rights reserved.</div>
          <div className="flex items-center gap-4 text-sm">
            <a className="text-zinc-300 hover:text-white" href="#waitlist">
              Join Waitlist
            </a>
            <a className="text-zinc-300 hover:text-white" href="#how">
              How it works
            </a>
            <a className="text-zinc-300 hover:text-white" href="/login">
              Log in
            </a>
          </div>
        </div>
      </footer>
    </main>
  )
}