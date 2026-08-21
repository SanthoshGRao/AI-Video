"use client";

import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Download,
  Play,
  Sparkles,
  FileText,
  Mic,
  Film,
  Share2,
  Database,
  Type,
  ShieldCheck,
  Workflow,
  Cpu,
  KeyRound,
  Menu,
  X,
  Code2,
  Mail,
  Wand2,
  Zap,
  Globe2,
} from "lucide-react";

/** Single source of truth for every "download the installer" link on the page. */
const DOWNLOAD_HREF = "/api/download/windows";

type BuildMeta = { version: string; sizeBytes: number | null };

/**
 * Reads the real installer version/size from the download route so the CTA
 * never advertises a stale "1.0.0 · 500MB". Falls back to nothing rendered
 * while loading, and to a generic line if the installer is not published yet.
 */
function useBuildMeta(): BuildMeta | null {
  const [meta, setMeta] = useState<BuildMeta | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${DOWNLOAD_HREF}?meta=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setMeta({ version: d.version, sizeBytes: d.sizeBytes ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return meta;
}

function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <div
      className={`${className} ls-grad-brand rounded-xl grid place-items-center shadow-[0_8px_24px_-8px_rgba(139,92,246,0.6)]`}
    >
      <Film className="h-4 w-4 text-white" strokeWidth={2.5} />
    </div>
  );
}

function Navbar() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#features", label: "Features" },
    { href: "#how", label: "How it Works" },
    { href: "#download", label: "Download" },
  ];
  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <div className="ls-glass-strong flex items-center justify-between rounded-2xl px-4 py-3">
          <a href="#" className="flex items-center gap-3">
            <LogoMark />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Video Studio</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                AI Desktop
              </div>
            </div>
          </a>
          <nav className="hidden md:flex items-center gap-8">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/sign-in"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href={DOWNLOAD_HREF}
              className="ls-grad-brand hidden sm:inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(139,92,246,0.6)] hover:scale-[1.03] transition-transform"
            >
              <Download className="h-4 w-4" />
              Download for Windows
            </a>
            <button
              className="md:hidden rounded-lg p-2 hover:bg-white/5"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <div className="ls-glass mt-2 md:hidden rounded-2xl p-4 flex flex-col gap-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/sign-in"
              onClick={() => setOpen(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Link>
            <a
              href={DOWNLOAD_HREF}
              onClick={() => setOpen(false)}
              className="ls-grad-brand inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white"
            >
              <Download className="h-4 w-4" /> Download for Windows
            </a>
          </div>
        )}
      </div>
    </header>
  );
}

function ProductMockup() {
  return (
    <div className="relative">
      {/* floating blobs */}
      <div className="ls-blob-indigo ls-float-slow absolute -top-10 -left-10 h-40 w-40 rounded-full blur-3xl" />
      <div
        className="ls-blob-violet ls-float-slow absolute -bottom-10 -right-10 h-48 w-48 rounded-full blur-3xl"
        style={{ animationDelay: "2s" }}
      />
      <div className="ls-glass-strong ls-glow-ring relative rounded-2xl p-4 shadow-2xl">
        {/* window chrome */}
        <div className="flex items-center gap-1.5 pb-3 border-b border-white/5">
          <span className="h-3 w-3 rounded-full bg-red-500/70" />
          <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
          <span className="h-3 w-3 rounded-full bg-green-500/70" />
          <div className="ml-3 text-[11px] text-muted-foreground">
            Video Studio — 3-acre farmland.vsproj
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3 pt-3">
          {/* sidebar */}
          <div className="col-span-2 space-y-2">
            <div className="rounded-lg bg-white/5 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Property
              </div>
              <div className="mt-1 text-xs font-medium">3-acre farmland</div>
              <div className="text-[11px] text-muted-foreground">Chikkaballapur · ₹45L/acre</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {["Borewell", "220 trees", "A-Khata"].map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-white/5 p-3 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Script — Premium
              </div>
              <div className="ls-grad-brand h-1.5 rounded-full" />
              <div className="h-1.5 rounded-full bg-white/10 w-4/5" />
              <div className="h-1.5 rounded-full bg-white/10 w-3/5" />
            </div>
          </div>

          {/* preview */}
          <div className="col-span-3 space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-lg bg-gradient-to-br from-slate-500/25 via-indigo-500/20 to-slate-400/15">
              <div className="ls-mesh absolute inset-0 opacity-40" />
              <div className="absolute inset-0 grid place-items-center">
                <div className="ls-pulse-glow h-12 w-12 rounded-full bg-white/90 grid place-items-center">
                  <Play className="h-5 w-5 text-black ml-0.5" fill="currentColor" />
                </div>
              </div>
              <div className="absolute bottom-2 left-2 right-2 rounded-md bg-black/50 px-2 py-1 text-[10px] text-white/90 backdrop-blur">
                ಸುಂದರ 3 ಎಕರೆ ಜಮೀನು • ಬೋರ್‌ವೆಲ್ ಲಭ್ಯ
              </div>
            </div>
            {/* waveform */}
            <div className="rounded-lg bg-white/5 p-2 flex items-end gap-0.5 h-14">
              {Array.from({ length: 48 }).map((_, i) => (
                <span
                  key={i}
                  className="ls-wave-bar ls-grad-brand flex-1 rounded-sm"
                  style={{
                    height: `${20 + Math.abs(Math.sin(i * 0.6)) * 80}%`,
                    animation: `ls-waveform ${1 + (i % 5) * 0.15}s ease-in-out infinite`,
                    animationDelay: `${i * 0.03}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-24 md:pt-24 md:pb-32">
      <div className="ls-mesh absolute inset-0 pointer-events-none" />
      <div className="ls-blob-violet absolute top-1/3 left-1/2 -translate-x-1/2 h-[500px] w-[900px] rounded-full opacity-50 blur-[120px] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <Reveal>
            <span className="ls-glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted-foreground">
              <Sparkles className="ls-violet h-3.5 w-3.5" />
              100% Offline — Runs on your PC
            </span>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
              Turn property details into <span className="ls-text-grad">marketing videos</span> with
              AI
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed">
              Paste raw farmland or layout info. Get professional Kannada scripts, natural
              voiceovers, Instagram reels, WhatsApp copies, and fully-edited videos — all on your
              desktop. No cloud. No subscription.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={DOWNLOAD_HREF}
                className="ls-grad-brand group inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-white shadow-[0_20px_50px_-25px_rgba(120,130,160,0.6)] hover:scale-[1.02] hover:shadow-[0_25px_60px_-25px_rgba(120,130,160,0.8)] transition-all"
              >
                <Download className="h-5 w-5 group-hover:translate-y-0.5 transition-transform" />
                Download for Windows (Free)
              </a>
              <a
                href="#how"
                className="ls-glass inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-medium hover:bg-white/10 transition-colors"
              >
                <Play className="h-4 w-4" />
                See How it Works
              </a>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              {[
                "Free forever",
                "No internet needed",
                "Kannada + English",
                "Built for Karnataka real estate",
              ].map((t, i) => (
                <span key={t} className="flex items-center gap-2">
                  {i > 0 && <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />}
                  {t}
                </span>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.2}>
          <ProductMockup />
        </Reveal>
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof FileText;
  title: string;
  body: string;
}) {
  return (
    <div className="ls-glass ls-glow-ring-hover group rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1">
      <div className="ls-grad-brand h-12 w-12 rounded-xl grid place-items-center shadow-[0_10px_30px_-10px_rgba(139,92,246,0.7)] group-hover:scale-110 transition-transform">
        <Icon className="h-5 w-5 text-white" />
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function Features() {
  const features = [
    {
      icon: FileText,
      title: "AI Script Generator",
      body: "Five Kannada + English script styles — premium, investment, urgency, lifestyle, and luxury. AI extracts property facts (location, price, acreage, amenities) and writes persuasive marketing scripts automatically.",
    },
    {
      icon: Mic,
      title: "Natural Kannada Voiceover",
      body: "Text-to-speech with Gemini and Edge TTS — male, female, and premium voices with style presets. Word-level timestamps for perfectly synced karaoke-style subtitles.",
    },
    {
      icon: Film,
      title: "Pro Video Editor & Timeline",
      body: "Full multi-track timeline editor — drag-and-drop media, transitions, text overlays, Ken Burns zoom effects. GPU-accelerated compositing. Export in 9:16, 16:9, and 1:1 with hardware-encoded MP4.",
    },
    {
      icon: Share2,
      title: "Social Content Pack",
      body: "Auto-generated marketing copies for Instagram, WhatsApp, YouTube, and Telegram — with hashtags and CTAs. One-click export of everything you need to publish across platforms.",
    },
  ];
  return (
    <section id="features" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-4">
        <Reveal>
          <div className="max-w-2xl">
            <div className="ls-violet text-xs uppercase tracking-[0.24em] font-medium">Platform</div>
            <h2 className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight">
              Everything you need.{" "}
              <span className="text-muted-foreground">Nothing you don&apos;t.</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              One studio from raw property text to published reels — built for Indian real estate.
            </p>
          </div>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.06}>
              <FeatureCard {...f} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Highlights() {
  const items = [
    {
      icon: Database,
      title: "Embedded Database",
      body: "Built-in PostgreSQL runs locally — your project data never leaves your machine. No cloud database setup needed.",
    },
    {
      icon: Type,
      title: "Subtitle Studio",
      body: "Animated karaoke-style subtitles with word-level highlighting. Multiple preset styles. ASS/SRT export for manual editing.",
    },
    {
      icon: ShieldCheck,
      title: "Fact Extraction & Verification",
      body: "AI parses raw text to extract structured property facts — location, area, price, trees, water source, legal status — and cross-checks script accuracy.",
    },
    {
      icon: Workflow,
      title: "Content Studio Workflow",
      body: "Step-by-step wizard: paste details → generate scripts → record voiceover → edit timeline → export video → copy social posts. All in one window.",
    },
    {
      icon: Cpu,
      title: "GPU-Accelerated Export",
      body: "Hardware-encoded video export with NVENC, QSV, and AMF support. Renders 1080p reels in seconds, not minutes.",
    },
    {
      icon: KeyRound,
      title: "Google Sign-In & AI Relay",
      body: "Sign in with Google for zero-config setup. AI calls route through a hosted relay — no API keys needed to get started.",
    },
  ];
  return (
    <section className="relative py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid gap-6 md:grid-cols-2">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={(i % 2) * 0.05}>
              <div className="ls-glass flex gap-4 rounded-2xl p-6 hover:bg-white/[0.06] transition-colors">
                <div className="shrink-0 h-11 w-11 rounded-xl bg-white/5 border border-white/10 grid place-items-center">
                  <it.icon className="ls-violet h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-base font-semibold tracking-tight">{it.title}</h4>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{it.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Paste property details",
      body: "Location, acreage, price, trees, water, legal — raw text is enough. AI structures every fact.",
    },
    {
      n: "02",
      title: "Generate everything",
      body: "Scripts, voiceovers, subtitles, hashtags, social copies — one click, no copy-pasting between tools.",
    },
    {
      n: "03",
      title: "Export & publish",
      body: "9:16 reels, 16:9 YouTube, 1:1 posts — with burnt-in karaoke subtitles and your property branding.",
    },
  ];
  return (
    <section id="how" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-4">
        <Reveal>
          <div className="max-w-2xl">
            <div className="ls-violet text-xs uppercase tracking-[0.24em] font-medium">Workflow</div>
            <h2 className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight">
              Three steps. <span className="ls-text-grad">Ten minutes.</span>
            </h2>
          </div>
        </Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <div className="ls-glass relative h-full rounded-2xl p-6 overflow-hidden">
                <div className="ls-text-grad absolute -right-4 -top-6 text-8xl font-bold opacity-20 select-none">
                  {s.n}
                </div>
                <div className="relative">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">
                    Step {s.n}
                  </div>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.15}>
          <div className="ls-glass mt-10 rounded-2xl px-6 py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Zap className="ls-teal h-4 w-4" /> ~10 min per property
            </div>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40 hidden sm:block" />
            <div className="flex items-center gap-2">
              <ShieldCheck className="ls-teal h-4 w-4" /> Fact-checked scripts
            </div>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40 hidden sm:block" />
            <div className="flex items-center gap-2">
              <Globe2 className="ls-teal h-4 w-4" /> Works 100% offline
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TechStack() {
  const stack = [
    "Built with Electron + Next.js",
    "Embedded PostgreSQL — zero setup",
    "Remotion + WebGL rendering engine",
    "FFmpeg with hardware encoding",
    "Prisma ORM for local data",
    "OpenAI + Google AI for script generation",
  ];
  return (
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <div className="text-center">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Under the Hood
            </div>
            <h3 className="mt-2 text-xl md:text-2xl font-medium text-muted-foreground">
              Serious engineering, quietly running in the background.
            </h3>
          </div>
        </Reveal>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {stack.map((s, i) => (
            <Reveal key={s} delay={i * 0.04}>
              <span className="ls-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Wand2 className="ls-violet h-3.5 w-3.5" />
                {s}
              </span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function WindowsIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M3 5.5 10.5 4.4v7.1H3zM11.5 4.25 21 3v8.5h-9.5zM3 12.5h7.5v7.1L3 18.5zM11.5 12.5H21V21l-9.5-1.25z" />
    </svg>
  );
}

function DownloadCTA() {
  const meta = useBuildMeta();
  const size = formatSize(meta?.sizeBytes ?? null);
  const specs = [
    meta ? `Version ${meta.version}` : null,
    "Windows 10/11",
    "64-bit",
    size,
  ].filter(Boolean);

  return (
    <section id="download" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl p-10 md:p-16 text-center">
            <div className="ls-grad-brand absolute inset-0" />
            <div className="ls-mesh absolute inset-0 opacity-30" />
            <div className="ls-float-slow absolute -top-24 -left-24 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
            <div
              className="ls-blob-teal ls-float-slow absolute -bottom-24 -right-24 h-72 w-72 rounded-full blur-3xl"
              style={{ animationDelay: "3s" }}
            />
            <div className="relative">
              <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-white">
                Ready to transform your property marketing?
              </h2>
              <p className="mt-4 text-white/85 max-w-2xl mx-auto text-base md:text-lg">
                Download Video Studio for Windows — free, offline, and ready in under 2 minutes.
              </p>
              <a
                href={DOWNLOAD_HREF}
                className="mt-10 inline-flex items-center gap-3 rounded-2xl bg-black/90 px-8 py-5 text-lg md:text-xl font-semibold text-white ring-1 ring-white/20 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] hover:scale-[1.03] hover:bg-black transition-all"
              >
                <WindowsIcon className="h-6 w-6" />
                Download for Windows (.exe)
              </a>
              <div className="mt-5 text-sm text-white/80">{specs.join(" · ")}</div>
              <div className="mt-2 text-xs text-white/70">
                Free forever. No account required. No internet needed after install.
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-10">
      <div className="mx-auto max-w-7xl px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <LogoMark className="h-7 w-7" />
          <div className="text-sm">
            <div className="font-semibold">Video Studio</div>
            <div className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} · Made for Karnataka real estate agents
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5 text-sm text-muted-foreground">
          <a
            href="https://github.com"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Code2 className="h-4 w-4" /> GitHub
          </a>
          <a
            href="mailto:hello@example.com"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Mail className="h-4 w-4" /> Contact
          </a>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="landing-root min-h-screen">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Highlights />
        <HowItWorks />
        <TechStack />
        <DownloadCTA />
      </main>
      <Footer />
    </div>
  );
}
