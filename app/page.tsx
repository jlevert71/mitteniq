export default function HomePage() {
  const steps = [
    {
      n: "01",
      title: "Upload Drawings",
      desc: "The system analyzes file quality and scale reliability instantly.",
    },
    {
      n: "02",
      title: "Generate Intake Report",
      desc: "A structured breakdown prepares you for execution.",
    },
    {
      n: "03",
      title: "Execute with Precision",
      desc: "Move into takeoff and vendor workflows without missing scope.",
    },
  ]

  const faqs = [
    {
      q: "Is this replacing estimators?",
      a: "No. MittenIQ enhances your estimating team by structuring intake and workflow. It does not replace judgment.",
    },
    {
      q: "How secure are our drawing files?",
      a: "Files are processed securely and are not used to train public AI systems.",
    },
    {
      q: "What do I get with portal access?",
      a: "A secure client dashboard, file intake, structured reporting, and workflow tools that support higher bid volume with the same crew.",
    },
  ]

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
            href="/dashboard"
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15"
          >
            Dashboard
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
        Premium intake + estimating workflow
      </div>

      <h1 className="mt-6 text-5xl font-bold tracking-tight leading-tight">
        <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
          Blueprint-grade intake.
        </span>
        <br />
        <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
          Steel-strong workflow.
        </span>
        <br />
        <span className="bg-gradient-to-r from-orange-200 to-orange-400 bg-clip-text text-transparent">
          Copper-fast output.
        </span>
      </h1>

      <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-300">
        Upload plans. Get an instant File Intake Report: scan quality, vector vs raster,
        text searchability, and a scale confidence score — so you stop guessing before takeoff.
      </p>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
        <a
          href="/file-intake"
          className="inline-flex items-center justify-center rounded-xl bg-orange-300/20 px-6 py-3 text-sm font-semibold text-orange-100 ring-1 ring-orange-200/30 hover:bg-orange-300/30 transition"
        >
          Start with File Intake
        </a>

        <a
          href="#how"
          className="inline-flex items-center justify-center rounded-xl bg-white/5 px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/10 transition"
        >
          See how it works
        </a>
      </div>

      <p className="mt-5 text-xs text-zinc-500">
        $99/month is less than printing a set of drawings for a bid.
      </p>
    </div>

    {/* Report Preview Card */}
    <div className="relative">
      <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-blueprint-700/25 via-white/5 to-copper-500/20 blur-xl" />
      <div className="relative rounded-3xl bg-black/60 p-8 ring-1 ring-white/10 backdrop-blur-xl">
        <div className="text-xs uppercase tracking-wider text-zinc-400">
          File Intake Report
        </div>
        <div className="mt-2 text-2xl font-semibold">
          Scale Confidence: High
        </div>

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
          Recommendation: proceed to takeoff. Flagged 2 sheets for manual
          scale check if field dimensions matter.
        </div>
      </div>
    </div>
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
          <div className="hidden text-sm text-zinc-400 md:block">
            Built for real contractor office workflow
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 hover:bg-white/7.5"
            >
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
              <div className="mt-1 text-sm text-zinc-300">
                Stop doing takeoff on garbage scans or unknown scale.
              </div>
            </div>
            <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
              <div className="text-sm font-semibold">Workflow that sticks</div>
              <div className="mt-1 text-sm text-zinc-300">
                Simple UI that your office can use without training hell.
              </div>
            </div>
            <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
              <div className="text-sm font-semibold">More bids with same crew</div>
              <div className="mt-1 text-sm text-zinc-300">
                Push volume without adding headcount.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 py-16">
        <h2 className="text-3xl font-bold tracking-tight text-center">Frequently Asked Questions</h2>
        <p className="mt-2 text-center text-zinc-300">
          Short answers. No hand-wavy nonsense.
        </p>

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
          <div className="text-sm text-zinc-400">
            © {new Date().getFullYear()} MittenIQ. All rights reserved.
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a className="text-zinc-300 hover:text-white" href="/file-intake">
              File Intake
            </a>
            <a className="text-zinc-300 hover:text-white" href="/dashboard">
              Dashboard
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