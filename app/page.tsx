"use client"

import { useEffect, useRef, useState } from "react"

function JumpMenu() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onClickOutside)
      document.removeEventListener("keydown", onEsc)
    }
  }, [])

  const items = [
    { label: "Overview", href: "#overview" },
    { label: "What’s coming first", href: "#coming-first" },
    { label: "Pricing", href: "#pricing" },
    { label: "Usage model", href: "#usage" },
    { label: "Annual projections", href: "#projections" },
    { label: "FAQ", href: "#faq" },
    { label: "Waitlist", href: "#waitlist" },
  ]

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-white/5"
      >
        <span className="mr-2 hidden sm:inline">Menu</span>
        <span className="grid gap-1">
          <span className="block h-[2px] w-5 bg-white/90" />
          <span className="block h-[2px] w-5 bg-white/90" />
          <span className="block h-[2px] w-5 bg-white/90" />
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]/95 shadow-2xl backdrop-blur">
          <div className="p-2">
            {items.map((it) => (
              <a
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm text-white/90 hover:bg-white/10"
              >
                {it.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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

  const comingFirst = [
    "Estimating Assistant: file intake + folder structuring",
    "Estimating Assistant: spec section separation into individual PDFs",
    "Estimating Assistant: searchable docs + structured intake report",
    "Estimating Assistant: upload routing + outgoing RFQ/RFI/vendor emails (human approval required)",
    "Junior Estimator: electrical quantity extraction (starting with panels, feeders, gear, devices)",
    "Junior Estimator: human-in-the-loop checkpoint required",
  ]

  const faqs = [
    {
      q: "Is MittenIQ live today?",
      a: "Not yet. This page is a waitlist. The first release focuses on intake + organization and early electrical quantity workflows.",
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
      a: "No. MittenIQ handles the repetitive workflow around estimating so your team can focus on judgment and scope. When you remove the tedious parts, you can push more bids through the pipeline without increasing staff and give yourself more chances to land work. You know the old saying — you’ve got to bid ’em to git ’em.",
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

      {/* NAV (fixed so dropdown never covers hero text) */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            {/* Placeholder logo square (swap when logo is ready) */}
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-300/20 to-orange-300/20 ring-1 ring-white/10" />
            <div className="leading-tight">
              <div className="text-base font-semibold tracking-wide">MittenIQ</div>
              <div className="text-xs text-zinc-400">More bids. More wins. Same crew.</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <JumpMenu />
            <a
              href="/login"
              className="hidden rounded-lg px-4 py-2 text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-white/5 sm:inline-flex"
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
        </div>
      </header>

      {/* Spacer so content starts below fixed header */}
      <div className="h-24" />

      {/* HERO / OVERVIEW (no file intake mock) */}
      <section id="overview" className="relative z-10 mx-auto max-w-6xl px-6 pt-8 pb-10">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_30%,rgba(11,22,48,0.75),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(184,115,51,0.12),transparent_55%)]" />

        <div className="mx-auto max-w-3xl">
          <h1 className="mt-12 text-5xl font-bold tracking-tight leading-tight">
            <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">MittenIQ</span>
            <br />
            <span className="bg-gradient-to-r from-orange-200 to-orange-400 bg-clip-text text-transparent">
              An estimating workflow platform for electrical contractors.
            </span>
          </h1>

          <p className="mt-6 text-base leading-relaxed text-zinc-300">
            Built with over 30 years of construction trade experience—field and office—in mind.
          </p>

          <p className="mt-4 text-base leading-relaxed text-zinc-300">
            The first release focuses on intake, organization, searchable docs, and early electrical quantity workflows—so you start
            clean and keep bids moving without adding headcount.
          </p>

          <div className="mt-8 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
            <div className="text-sm font-semibold">No new computer stuff. No IT project.</div>
            <div className="mt-2 text-sm text-zinc-300 leading-relaxed">
              The goal is dead simple: you log in, upload the bid set (drag and drop), and the workflow runs. Your office can use it
              without training hell or chasing an IT department.
            </div>
          </div>
        </div>
      </section>

      {/* WAITLIST */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-14">
        <div className="mx-auto max-w-3xl">
          <div id="waitlist" className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
            <div className="mb-3 text-sm font-semibold">Join the waitlist</div>

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

                <p className="text-xs text-zinc-500">No spam. We’ll email when early access opens.</p>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* WHAT'S COMING FIRST */}
      <section id="coming-first" className="relative z-10 mx-auto max-w-6xl px-6 pb-6">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">What’s coming first</h2>
            <p className="mt-2 text-zinc-300">Early access starts with intake + organization, then the first Junior Estimator workflows.</p>
          </div>
          <div className="hidden text-sm text-zinc-400 md:block">Built for contractor office workflow</div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {comingFirst.map((item) => (
            <div key={item} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2.5 w-2.5 rounded-full bg-orange-300/70" />
                <div className="text-sm text-zinc-200">{item}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10">
          <h2 className="text-3xl font-bold tracking-tight">Pricing</h2>
          <p className="mt-2 text-zinc-300">Straight facts. No games.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
            <div className="text-sm font-semibold">Standard</div>
            <div className="mt-2 text-3xl font-bold">
              $149<span className="text-base font-semibold text-zinc-400">/month</span>
            </div>
            <div className="mt-3 text-sm text-zinc-300">Portal access + workflow tools. Usage charges apply when you run tools.</div>
          </div>

          <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
            <div className="text-sm font-semibold">Founding Member</div>
            <div className="mt-2 text-3xl font-bold">
              $49<span className="text-base font-semibold text-zinc-400"> lifetime</span>
            </div>
            <div className="mt-3 text-sm text-zinc-300">Limited spots. Public counter will show remaining availability.</div>
          </div>
        </div>
      </section>

      {/* USAGE MODEL */}
      <section id="usage" className="relative z-10 mx-auto max-w-6xl px-6 pb-6">
        <div className="rounded-2xl bg-gradient-to-r from-blueprint-700/25 via-white/5 to-copper-500/15 p-6 ring-1 ring-white/10">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
              <div className="text-sm font-semibold">Usage pricing</div>
              <div className="mt-1 text-sm text-zinc-300">Usage is billed at 20% of labor-equivalent cost.</div>
            </div>
            <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
              <div className="text-sm font-semibold">Scaling</div>
              <div className="mt-1 text-sm text-zinc-300">Scaled by electrical-relevant PDF page count only.</div>
            </div>
            <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
              <div className="text-sm font-semibold">Efficiency meter</div>
              <div className="mt-1 text-sm text-zinc-300">A non-intrusive savings meter stays visible on the dashboard.</div>
            </div>
          </div>
        </div>
      </section>

      {/* PROJECTIONS TABLE */}
      <section id="projections" className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight">Projected Annual Savings</h2>
          <p className="mt-2 text-zinc-300">Estimating Assistant + Junior Estimator tools only.</p>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead className="bg-black/40">
                <tr>
                  <th className="px-5 py-4 font-semibold text-zinc-200"> </th>
                  <th className="px-5 py-4 font-semibold text-zinc-200">Small Contractor</th>
                  <th className="px-5 py-4 font-semibold text-zinc-200">Medium Contractor</th>
                  <th className="px-5 py-4 font-semibold text-zinc-200">Large Contractor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                <tr>
                  <td className="px-5 py-4 text-zinc-300">Assumed Bids / Year</td>
                  <td className="px-5 py-4 text-zinc-200">20–60</td>
                  <td className="px-5 py-4 text-zinc-200">120</td>
                  <td className="px-5 py-4 text-zinc-200">240</td>
                </tr>

                <tr>
                  <td className="px-5 py-4 text-zinc-300">Traditional Labor Equivalent</td>
                  <td className="px-5 py-4 text-zinc-200">$4,350 – $13,050</td>
                  <td className="px-5 py-4 text-zinc-200">$26,100</td>
                  <td className="px-5 py-4 text-zinc-200">$52,200</td>
                </tr>

                <tr>
                  <td className="px-5 py-4 text-zinc-300">MittenIQ Usage (20%)</td>
                  <td className="px-5 py-4 text-zinc-200">$870 – $2,610</td>
                  <td className="px-5 py-4 text-zinc-200">$5,220</td>
                  <td className="px-5 py-4 text-zinc-200">$10,440</td>
                </tr>

                <tr>
                  <td className="px-5 py-4 text-zinc-300">Subscription (Annual)</td>
                  <td className="px-5 py-4 text-zinc-200">$1,788</td>
                  <td className="px-5 py-4 text-zinc-200">$1,788</td>
                  <td className="px-5 py-4 text-zinc-200">$1,788</td>
                </tr>

                <tr>
                  <td className="px-5 py-4 text-zinc-300 font-semibold">Total Annual Cost (Usage + Subscription)</td>
                  <td className="px-5 py-4 text-zinc-100 font-semibold">$2,658 – $4,398</td>
                  <td className="px-5 py-4 text-zinc-100 font-semibold">$7,008</td>
                  <td className="px-5 py-4 text-zinc-100 font-semibold">$12,228</td>
                </tr>

                <tr>
                  <td className="px-5 py-4 text-zinc-300 font-semibold">Projected Net Savings</td>
                  <td className="px-5 py-4 text-zinc-100 font-semibold">$1,692 – $8,652</td>
                  <td className="px-5 py-4 text-zinc-100 font-semibold">$19,092</td>
                  <td className="px-5 py-4 text-zinc-100 font-semibold">$39,972</td>
                </tr>

                <tr>
                  <td className="px-5 py-4 text-zinc-300 font-semibold">Hours Reclaimed / Year</td>
                  <td className="px-5 py-4 text-zinc-100 font-semibold">90 – 270 hrs</td>
                  <td className="px-5 py-4 text-zinc-100 font-semibold">540 hrs</td>
                  <td className="px-5 py-4 text-zinc-100 font-semibold">1,080 hrs</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="px-6 py-5">
            <p className="text-xs text-zinc-400 italic">
              *If you’re an owner and do your own estimating, those reclaimed hours are time returned to your life — or time put back
              into running jobs, walking sites, and staying close to the work.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
            <p className="mt-2 text-zinc-300">A clean intake process that sets you up to bid faster without sloppy misses.</p>
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

      {/* FAQ */}
      <section id="faq" className="relative z-10 mx-auto max-w-4xl px-6 py-16">
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
            <a className="text-zinc-300 hover:text-white" href="#projections">
              Annual projections
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