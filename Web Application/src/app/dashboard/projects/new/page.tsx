"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  TreePine,
  Palmtree,
  Citrus,
  Building2,
  Home,
  MapPin,
  Store,
  Mountain,
  Warehouse,
  Globe,
  Clock,
  Sparkles,
  Languages,
  Megaphone,
  Target,
  Briefcase,
  Clapperboard,
  Coffee,
  Zap,
  Gem,
  LineChart,
  MessagesSquare,
  Users,
  Film,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCreateProject } from "@/hooks/use-projects";
import { ApiError } from "@/lib/api/client";
import { TransliterateTextarea } from "@/components/ui/transliterate-textarea";
import { TTS_LANGUAGES } from "@/lib/tts/voices";
import { parseSkit } from "@/lib/skit/parse-script";
import { transliterationLang } from "@/lib/skit/project";

const propertyTemplates = [
  { slug: "farmland", name: "Farmland", icon: TreePine, color: "#059669", bg: "#ECFDF5" },
  { slug: "plantation", name: "Plantation", icon: Palmtree, color: "#16A34A", bg: "#F0FDF4" },
  { slug: "coconut_farm", name: "Coconut Farm", icon: Palmtree, color: "#15803D", bg: "#DCFCE7" },
  { slug: "arecanut_farm", name: "Arecanut Farm", icon: Citrus, color: "#CA8A04", bg: "#FEF9C3" },
  { slug: "farmhouse", name: "Farmhouse", icon: Home, color: "#9333EA", bg: "#F3E8FF" },
  { slug: "layout_site", name: "Layout Site", icon: MapPin, color: "#2563EB", bg: "#EFF6FF" },
  { slug: "villa_plot", name: "Villa Plot", icon: Building2, color: "#0891B2", bg: "#ECFEFF" },
  { slug: "commercial_land", name: "Commercial Land", icon: Store, color: "#DC2626", bg: "#FEF2F2" },
  { slug: "resort_property", name: "Resort Property", icon: Mountain, color: "#7C3AED", bg: "#EDE9FE" },
  { slug: "general", name: "General Property", icon: Globe, color: "#6366F1", bg: "#EEF2FF" },
];

const durations = [
  { value: 30, label: "30s", description: "Instagram Story" },
  { value: 60, label: "60s", description: "Instagram Reel" },
  { value: 90, label: "90s", description: "YouTube Short" },
  { value: 120, label: "2 min", description: "Full Video" },
];

const tones = [
  { value: "professional", label: "Professional", icon: Briefcase },
  { value: "premium", label: "Cinematic", icon: Clapperboard },
  { value: "casual", label: "Conversational", icon: Coffee },
  { value: "urgent", label: "High Energy", icon: Zap },
  { value: "luxury", label: "Exclusive", icon: Gem },
  { value: "investment", label: "Data-Driven", icon: LineChart },
];

const languages = [
  { value: "kannada_english", label: "Kannada + English", flag: "🇮🇳" },
  { value: "kannada", label: "Pure Kannada", flag: "🇮🇳" },
  { value: "english", label: "English", flag: "🌐" },
  { value: "hindi_english", label: "Hindi + English", flag: "🇮🇳" },
];

const sampleInput = `Location : 25 km from Mysore
5 km from Shooting Mahadevapura
120 km from Bangalore
28 km from T Narasipura
8 km from Bannur

Plot size : 1.22 acre

Price : 65 lakhs per acre

Road access : 30 feet road

Water : 1 borewell

Electricity : Available

Legal : RTC available

Plantation : 42 coconut trees

Drip irrigation : Done`;

const intentCopy: Record<string, { note: string; duration: number }> = {
  script: {
    note: "You'll write property details first — script generation is the next step after creating this project.",
    duration: 60,
  },
  tts: {
    note: "Once the project and script are ready, you'll generate the Kannada voiceover from here.",
    duration: 60,
  },
  social: {
    note: "Pre-selected a 30s duration for Instagram/social formats — change it below if needed.",
    duration: 30,
  },
};

export default function NewProjectPage() {
  return (
    <Suspense fallback={null}>
      <NewProjectPageInner />
    </Suspense>
  );
}

function NewProjectPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intent = searchParams.get("intent");
  const intentInfo = intent ? intentCopy[intent] : undefined;
  // "choose" shows the two workflow options first. An explicit ?intent (from a
  // dashboard shortcut) implies the standard property-video flow, so skip it.
  const [mode, setMode] = useState<"choose" | "standard" | "skit">(intent ? "standard" : "choose");
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState("");

  // Skit-flow state
  const [skitName, setSkitName] = useState("");
  const [skitLanguage, setSkitLanguage] = useState("kn-IN");
  const [skitScript, setSkitScript] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [propertyDetails, setPropertyDetails] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(intentInfo?.duration ?? 60);
  const [selectedTone, setSelectedTone] = useState("professional");
  const [selectedLanguage, setSelectedLanguage] = useState("kannada_english");
  const [targetAudience, setTargetAudience] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const createProject = useCreateProject();

  const totalSteps = 3;

  const canNext =
    step === 1
      ? projectName.trim().length > 0 && selectedTemplate !== null
      : step === 2
        ? propertyDetails.trim().length > 0
        : true;

  const handleCreate = async () => {
    if (!selectedTemplate) return;
    setCreateError(null);
    try {
      const project = await createProject.mutateAsync({
        title: projectName.trim(),
        templateSlug: selectedTemplate,
        propertyDetails: propertyDetails.trim(),
        targetAudience: targetAudience.trim() || undefined,
        durationSeconds: selectedDuration,
        tone: selectedTone,
        language: selectedLanguage,
        ctaStyle: "standard",
      });
      router.push(`/dashboard/projects/${project.id}/content`);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? typeof err.details === "string" && err.details
            ? `${err.message}: ${err.details}`
            : err.message
          : "Failed to create project. Check your database connection.";
      setCreateError(message);
    }
  };

  const handleCreateSkit = async () => {
    setCreateError(null);
    try {
      const project = await createProject.mutateAsync({
        kind: "skit",
        title: skitName.trim(),
        skitLanguage,
        skitScript: skitScript.trim() || undefined,
        durationSeconds: selectedDuration,
        tone: selectedTone,
      });
      router.push(`/dashboard/projects/${project.id}/content`);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? typeof err.details === "string" && err.details
            ? `${err.message}: ${err.details}`
            : err.message
          : "Failed to create project. Check your database connection.";
      setCreateError(message);
    }
  };

  const skitParsed = parseSkit(skitScript);

  // ---- Screen 1: choose a workflow --------------------------------------
  if (mode === "choose") {
    return (
      <div className="max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Button>

        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6">
          What are you making?
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => { setMode("standard"); setStep(1); }}
            className="text-left p-6 rounded-2xl border-2 border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--primary-500)] hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-[var(--primary-50)] flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <Film className="w-6 h-6 text-[var(--primary-600)]" />
            </div>
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">Property Video</h3>
            <p className="text-sm text-[var(--text-secondary)]">AI script + voiceover</p>
          </button>

          <button
            onClick={() => setMode("skit")}
            className="text-left p-6 rounded-2xl border-2 border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-indigo-500 hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <MessagesSquare className="w-6 h-6 text-indigo-600" />
            </div>
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">Skit / Conversation</h3>
            <p className="text-sm text-[var(--text-secondary)]">Multi-character, your script</p>
          </button>
        </div>
      </div>
    );
  }

  // ---- Screen: create a skit project ------------------------------------
  if (mode === "skit") {
    const canCreateSkit = skitName.trim().length > 0;
    return (
      <div className="max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => setMode("choose")}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Clapperboard className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">New skit</h2>
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] mb-2 block">Project Name</label>
            <Input
              value={skitName}
              onChange={(e) => setSkitName(e.target.value)}
              placeholder="Project name"
              className="h-12 text-base"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] mb-2 block">Language</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {TTS_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setSkitLanguage(l.code)}
                  className={cn(
                    "p-3 rounded-xl border-2 text-sm font-medium transition-all",
                    skitLanguage === l.code
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-hover)] text-[var(--text-primary)]"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] mb-2 block">
              Script <span className="font-normal text-[var(--text-tertiary)]">(optional)</span>
            </label>
            <TransliterateTextarea
              value={skitScript}
              onChange={setSkitScript}
              language={transliterationLang(skitLanguage)}
              placeholder={'Name:\n"their line"'}
              className="min-h-[200px] font-mono text-sm leading-relaxed"
            />
            {skitParsed.characters.length > 0 && (
              <p className="mt-2 text-xs text-[var(--text-tertiary)] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Detected: {skitParsed.characters.join(", ")}
              </p>
            )}
          </div>

          {createError && (
            <p className="text-sm text-[var(--error-600)] bg-[var(--error-50)] border border-[var(--error-100)] rounded-lg px-4 py-3">
              {createError}
            </p>
          )}

          <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
            <Button onClick={handleCreateSkit} disabled={!canCreateSkit || createProject.isPending}>
              {createProject.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Create skit
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Screens 1–3: standard property-video wizard ----------------------
  return (
    <div className="max-w-3xl mx-auto">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-6"
        onClick={() => (step > 1 ? setStep(step - 1) : intent ? router.back() : setMode("choose"))}
      >
        <ArrowLeft className="w-4 h-4" />
        {step > 1 ? "Back" : intent ? "Dashboard" : "Back"}
      </Button>

      {intentInfo && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-[var(--primary-50)] border border-[var(--primary-200)] text-sm text-[var(--primary-700)]">
          {intentInfo.note}
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center gap-3 mb-8">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 flex-1">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                i + 1 < step
                  ? "bg-[var(--success-500)] text-white"
                  : i + 1 === step
                    ? "bg-[var(--primary-600)] text-white shadow-lg shadow-[rgba(217,119,87,0.3)]"
                    : "bg-[var(--neutral-100)] text-[var(--neutral-400)]"
              )}
            >
              {i + 1 < step ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                i + 1
              )}
            </div>
            {i < totalSteps - 1 && (
              <div
                className={cn(
                  "flex-1 h-[2px] rounded-full transition-colors",
                  i + 1 < step ? "bg-[var(--success-500)]" : "bg-[var(--neutral-100)]"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
              Name your project
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Give your project a name and select the property type.
            </p>

            <div className="mb-8">
              <label className="text-sm font-medium text-[var(--text-primary)] mb-2 block">
                Project Name
              </label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter name for this project"
                className="h-12 text-base"
                autoFocus
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[var(--text-primary)] mb-3 block">
                Property Type
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {propertyTemplates.map((tpl) => (
                  <button
                    key={tpl.slug}
                    onClick={() => setSelectedTemplate(tpl.slug)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center group hover:shadow-sm",
                      selectedTemplate === tpl.slug
                        ? "border-[var(--primary-500)] bg-[var(--primary-50)] shadow-sm"
                        : "border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-hover)]"
                    )}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                      style={{ backgroundColor: tpl.bg }}
                    >
                      <tpl.icon
                        className="w-5 h-5"
                        style={{ color: tpl.color }}
                      />
                    </div>
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {tpl.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
              Property Details
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Paste your raw property information. Our AI will extract and structure all facts
              automatically.
            </p>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  Property Information
                </label>
                {/* <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setPropertyDetails(sampleInput)}
                >
                  <Sparkles className="w-3 h-3" />
                  Use sample
                </Button> */}
              </div>
              <Textarea
                value={propertyDetails}
                onChange={(e) => setPropertyDetails(e.target.value)}
                placeholder={`Enter the Property Details...`}
                className="min-h-[240px] text-sm font-mono leading-relaxed"
              />
              <p className="text-xs text-[var(--text-tertiary)] mt-2">
                Include: location, distance, plot size, price, road access, water,
                electricity, legal status, plantation details, and any other features.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-[var(--text-primary)] mb-2 block">
                Target Audience (Optional)
              </label>
              <Input
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g., NRI investors, weekend farmers, retirees"
              />
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
              Content Settings
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Choose how you want your content to sound.
            </p>

            {/* Duration */}
            <div className="mb-8">
              <label className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--neutral-400)]" />
                Video Duration
              </label>
              <div className="grid grid-cols-4 gap-3">
                {durations.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setSelectedDuration(d.value)}
                    className={cn(
                      "flex flex-col items-center p-4 rounded-xl border-2 transition-all",
                      selectedDuration === d.value
                        ? "border-[var(--primary-500)] bg-[var(--primary-50)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-hover)]"
                    )}
                  >
                    <span className="text-lg font-bold text-[var(--text-primary)]">
                      {d.label}
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] mt-1">
                      {d.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tone */}
            <div className="mb-8">
              <label className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-[var(--neutral-400)]" />
                Tone
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {tones.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setSelectedTone(t.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                      selectedTone === t.value
                        ? "border-[var(--primary-500)] bg-[var(--primary-50)] text-[var(--primary-600)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-hover)] text-[var(--neutral-500)]"
                    )}
                  >
                    <t.icon className="w-5 h-5 mb-1" />
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <Languages className="w-4 h-4 text-[var(--neutral-400)]" />
                Language
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {languages.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setSelectedLanguage(l.value)}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-xl border-2 transition-all",
                      selectedLanguage === l.value
                        ? "border-[var(--primary-500)] bg-[var(--primary-50)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-hover)]"
                    )}
                  >
                    <span className="text-base">{l.flag}</span>
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {l.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {createError && (
        <p className="mt-4 text-sm text-[var(--error-600)] bg-[var(--error-50)] border border-[var(--error-100)] rounded-lg px-4 py-3">
          {createError}
        </p>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between mt-10 pt-6 border-t border-[var(--border-subtle)]">
        <Button
          variant="ghost"
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
        >
          <ArrowLeft className="w-4 h-4" />
          Previous
        </Button>

        {step < totalSteps ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canNext}
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            disabled={createProject.isPending}
            className="shadow-lg shadow-[rgba(79,70,229,0.2)]"
          >
            {createProject.isPending ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Create Project
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
