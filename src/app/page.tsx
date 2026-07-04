"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Video,
  Sparkles,
  Mic,
  Hash,
  Play,
  ArrowRight,
  Check,
  Zap,
  MapPin,
  Trees,
  IndianRupee,
  Clock,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08 },
  }),
};

const features = [
  {
    icon: Sparkles,
    title: "AI Script Generator",
    description:
      "Five Kannada + English script styles — premium, investment, urgency, lifestyle, and luxury.",
    gradient: "from-indigo-500 to-violet-600",
    glow: "rgba(99, 102, 241, 0.35)",
  },
  {
    icon: Mic,
    title: "Kannada Voiceover",
    description:
      "Natural TTS with male, female, and premium voices — synced for karaoke subtitles.",
    gradient: "from-violet-500 to-purple-700",
    glow: "rgba(139, 92, 246, 0.35)",
  },
  {
    icon: Video,
    title: "Auto Video Editor",
    description:
      "AI builds your timeline from uploads — transitions, text layers, and export-ready reels.",
    gradient: "from-emerald-500 to-teal-700",
    glow: "rgba(16, 185, 129, 0.35)",
  },
  {
    icon: Hash,
    title: "Social Content Pack",
    description:
      "Instagram, WhatsApp, YouTube, and Telegram copies — hashtags and CTAs included.",
    gradient: "from-amber-500 to-orange-600",
    glow: "rgba(245, 158, 11, 0.35)",
  },
];

const steps = [
  {
    step: "01",
    title: "Paste property details",
    description:
      "Location, acreage, price, trees, water, legal — raw text is enough. AI structures every fact.",
    icon: MapPin,
  },
  {
    step: "02",
    title: "Generate everything",
    description:
      "Scripts, voiceovers, captions, hashtags, and SEO — one workflow, no copy-pasting between tools.",
    icon: Sparkles,
  },
  {
    step: "03",
    title: "Export & publish",
    description:
      "9:16 reels, 16:9 YouTube, 1:1 posts — with burnt-in subtitles and your brand kit.",
    icon: Video,
  },
];

const trustItems = [
  "Free to start",
  "No credit card",
  "Kannada + English",
  "Built for Karnataka real estate",
];

export default function LandingPage() {
  return (
    <div className="landing-page min-h-screen">
      {/* Nav */}
      <nav className="landing-nav fixed top-0 w-full z-50">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-700 flex items-center justify-center shadow-md shadow-indigo-500/25 group-hover:shadow-lg group-hover:shadow-indigo-500/30 transition-shadow">
              <Video className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[15px] font-bold tracking-tight text-slate-900">
                Video Generation
              </span>
              <span className="text-[10px] font-semibold text-indigo-600 tracking-widest uppercase">
                AI Studio
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/sign-in"
              className="hidden sm:inline-flex text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100/80 transition-colors"
            >
              Sign in
            </Link>
            <Button size="default" asChild className="rounded-xl shadow-md shadow-indigo-500/20">
              <Link href="/sign-up">
                Start free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-28 sm:pt-32 pb-16 sm:pb-24 px-5 sm:px-8">
        <div className="landing-mesh" aria-hidden />
        <div className="landing-grid" aria-hidden />

        <div className="relative max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Copy */}
            <div className="text-center lg:text-left">
              <motion.div
                custom={0}
                variants={fadeUp}
                initial="hidden"
                animate="show"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full landing-shimmer-badge border border-indigo-100 text-xs font-semibold text-indigo-700 mb-6"
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                100% free to start — no card required
              </motion.div>

              <motion.h1
                custom={1}
                variants={fadeUp}
                initial="hidden"
                animate="show"
                className="landing-hero-title text-slate-900 mb-5"
              >
                Turn property details into{" "}
                <span className="text-gradient">marketing videos</span> in minutes
              </motion.h1>

              <motion.p
                custom={2}
                variants={fadeUp}
                initial="hidden"
                animate="show"
                className="text-base sm:text-lg text-slate-600 max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed"
              >
                Paste raw farmland or layout info. Get professional scripts, Kannada
                voiceovers, Instagram reels, WhatsApp copies, and edited videos —
                automatically.
              </motion.p>

              <motion.div
                custom={3}
                variants={fadeUp}
                initial="hidden"
                animate="show"
                className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 mb-8"
              >
                <Button size="lg" asChild className="w-full sm:w-auto rounded-xl h-12 px-8 shadow-xl shadow-indigo-500/25">
                  <Link href="/sign-up">
                    Start creating free
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full sm:w-auto rounded-xl h-12 px-6 bg-white/80 backdrop-blur border-slate-200"
                >
                  <Play className="w-4 h-4 text-indigo-600" />
                  Watch demo
                </Button>
              </motion.div>

              <motion.ul
                custom={4}
                variants={fadeUp}
                initial="hidden"
                animate="show"
                className="flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2"
              >
                {trustItems.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-500"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </motion.ul>
            </div>

            {/* Product preview — pure CSS, no images */}
            <motion.div
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="relative landing-float"
            >
              <div className="absolute -inset-4 bg-gradient-to-r from-indigo-400/20 via-violet-400/15 to-teal-400/20 rounded-[2rem] blur-2xl" aria-hidden />
              <div className="landing-product-frame relative rounded-2xl overflow-hidden">
                {/* Window chrome */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-indigo-100/80 bg-slate-50/90">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-400 ml-2">
                    reel-estate.ai / new-project
                  </span>
                </div>

                <div className="p-4 sm:p-5 space-y-3 bg-gradient-to-b from-white to-indigo-50/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">
                        Coconut farm · Mysuru
                      </p>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">
                        1.22 acre · 65L/acre
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-100 text-emerald-700">
                      AI Ready
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { icon: Trees, label: "42 trees", sub: "Coconut" },
                      { icon: IndianRupee, label: "65L", sub: "Per acre" },
                      { icon: MapPin, label: "25 km", sub: "From Mysore" },
                    ].map((chip) => (
                      <div
                        key={chip.label}
                        className="rounded-xl bg-white border border-slate-100 p-2.5 shadow-sm"
                      >
                        <chip.icon className="w-3.5 h-3.5 text-indigo-500 mb-1" />
                        <p className="text-[11px] font-bold text-slate-800">{chip.label}</p>
                        <p className="text-[9px] text-slate-400">{chip.sub}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl bg-slate-900 p-3 text-white">
                    <div className="flex items-center gap-2 mb-2">
                      <Mic className="w-3 h-3 text-violet-300" />
                      <span className="text-[10px] font-medium text-slate-300">
                        Script preview
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-200 font-medium">
                      &quot;ಮೈಸೂರಿನಿಂದ ಕೇವಲ 25 ಕಿ.ಮೀ... 1.22 ಎಕರೆ ತೋಟ, 42 ತೆಂಗಿನ ಮರಗಳು...&quot;
                    </p>
                    <div className="flex gap-1 mt-2">
                      {[72, 45, 88, 60].map((w, i) => (
                        <div
                          key={i}
                          className="h-1 rounded-full bg-indigo-400/80"
                          style={{ width: `${w}%` }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 h-8 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white">Generate reel</span>
                    </div>
                    <div className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center">
                      <Hash className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 sm:py-28 px-5 sm:px-8 bg-white border-y border-slate-100">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">
              Platform
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
              Everything you need. Nothing you don&apos;t.
            </h2>
            <p className="text-slate-600 text-base sm:text-lg">
              One studio from raw property text to published reels — built for Indian
              real estate marketers.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="landing-feature-card rounded-2xl p-6"
              >
                <div
                  className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-5`}
                  style={{ boxShadow: `0 8px 24px -6px ${feature.glow}` }}
                >
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">
              Workflow
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Three steps. Ten minutes.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="landing-step-card rounded-2xl p-6 relative"
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="text-3xl font-black text-indigo-100">{step.step}</span>
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <step.icon className="w-5 h-5 text-indigo-600" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{step.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{step.description}</p>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-px bg-indigo-200" />
                )}
              </motion.div>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap justify-center gap-6 text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              ~10 min per property
            </span>
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-500" />
              Fact-checked scripts
            </span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24 px-5 sm:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="landing-cta rounded-3xl px-8 sm:px-14 py-12 sm:py-16 text-center relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: `radial-gradient(circle at 20% 50%, rgba(255,255,255,0.25) 0%, transparent 50%),
                  radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 40%)`,
              }}
              aria-hidden
            />
            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-4 text-white">
                Ready to transform your property marketing?
              </h2>
              <p className="text-base sm:text-lg mb-8 max-w-lg mx-auto leading-relaxed">
                Join agents and developers who ship professional Kannada reels 10×
                faster — start free today.
              </p>
              <Button
                size="lg"
                asChild
                className="rounded-xl h-12 px-8 bg-white text-indigo-700 hover:bg-slate-50 font-semibold shadow-lg border-0"
              >
                <Link href="/sign-up">
                  Get started free
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-5 sm:px-8 border-t border-slate-100 bg-white">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-700 flex items-center justify-center">
              <Video className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-800">Video Generation AI</span>
          </div>
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} Video Generation AI · Free tier available
          </p>
        </div>
      </footer>
    </div>
  );
}
