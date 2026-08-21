"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Hash,
  Mic,
  Captions,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clapperboard,
  MonitorSmartphone,
  Send,
  Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { TransliterateTextarea } from "@/components/ui/transliterate-textarea";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { FactsValidationPanel } from "@/components/content-studio/facts-validation-panel";
import { ContentPackPanel } from "@/components/content-studio/content-pack-panel";
import { VoiceoverPanel } from "@/components/content-studio/voiceover-panel";
import { SubtitleStudioPanel } from "@/components/content-studio/subtitle-studio-panel";
import { VideoEditorPanel } from "@/components/content-studio/video-editor-panel";
import { FinalPostPanel } from "@/components/content-studio/final-post-panel";

import { cn } from "@/lib/utils";
import { MediaPanel } from "@/components/content-studio/media-panel";
import { ScriptHistoryPanel } from "@/components/content-studio/script-history-panel";
import {
  getLatestBatch,
  pickDefaultScriptId,
  scriptsInBatch,
} from "@/lib/scripts/utils";
import { useProject } from "@/hooks/use-projects";
import { postProjectAction } from "@/lib/api/project-actions";
import { useUIStore } from "@/stores/ui-store";

const CANVAS_SIZE_OPTIONS = [
  { label: "Landscape 16:9", width: 1920, height: 1080 },
  { label: "Reels 9:16", width: 1080, height: 1920 },
  { label: "Square 1:1", width: 1080, height: 1080 },
  { label: "Classic 4:3", width: 1440, height: 1080 },
];

const tabs = [
  { id: "details", label: "Details", icon: FileText },
  { id: "scripts", label: "Scripts", icon: Sparkles },
  { id: "social", label: "Social", icon: Hash },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "subtitles", label: "Subtitles", icon: Captions },
  { id: "editor", label: "Editor", icon: Clapperboard },
  { id: "final", label: "Final", icon: Send },
] as const;

type TabId = (typeof tabs)[number]["id"];

interface ContentStudioShellProps {
  projectId: string;
}

export function ContentStudioShell({ projectId }: ContentStudioShellProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab") as TabId | null;
      if (t && tabs.some(tb => tb.id === t)) return t;
    }
    return "details";
  });

  const updateTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const sp = new URLSearchParams(window.location.search);
    sp.set("tab", tab);
    router.replace(`/dashboard/projects/${projectId}/content?${sp.toString()}`, { scroll: false });
  }, [router, projectId]);
  const { data: project, isLoading, isError, refetch } = useProject(projectId);

  const addToast = useUIStore((s) => s.addToast);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editedRawText, setEditedRawText] = useState("");
  const [refinePrompt, setRefinePrompt] = useState("");
  const [canvasSize, setCanvasSize] = useState({ width: 1080, height: 1920 });
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const [editedScriptContent, setEditedScriptContent] = useState("");
  const allScripts = project?.scriptVersions ?? [];
  const latestBatch = useMemo(() => getLatestBatch(allScripts), [allScripts]);
  const latestBatchScripts = useMemo(
    () => (latestBatch != null ? scriptsInBatch(allScripts, latestBatch) : []),
    [allScripts, latestBatch]
  );

  useEffect(() => {
    if (!allScripts.length) return;
    const stillValid = allScripts.some((s) => s.id === selectedScriptId);
    if (!selectedScriptId || !stillValid) {
      const id = pickDefaultScriptId(allScripts);
      if (id) setSelectedScriptId(id);
    }
  }, [allScripts, selectedScriptId]);

  const selectScript = async (scriptId: string) => {
    setSelectedScriptId(scriptId);
    try {
      await fetch(`/api/projects/${projectId}/scripts/${scriptId}/activate`, {
        method: "POST",
      });
    } catch {
      /* non-blocking */
    }
  };

  const { data: promptChips = [] } = useQuery({
    queryKey: ["prompt-chips"],
    queryFn: () =>
      fetch("/api/prompt-chips").then((r) =>
        r.json().then((d: { chips: { id: string; label: string; prompt: string }[] }) => d.chips)
      ),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    await refetch();
  };

  const toast = (type: "success" | "error" | "info", title: string, description?: string) => {
    addToast({ type, title, description });
  };

  const rawText =
    project?.propertyData &&
    typeof project.propertyData === "object" &&
    "rawText" in project.propertyData &&
    typeof (project.propertyData as { rawText?: unknown }).rawText === "string"
      ? (project.propertyData as { rawText: string }).rawText
      : "";

  const latestAudio = project?.audioAssets?.[0];
  const activePack = project?.contentPacks?.[0];
  const selectedScript = allScripts.find((script) => script.id === selectedScriptId) ?? null;

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/timeline/settings`);
        const json = await res.json();
        if (!cancelled && res.ok && json.settings?.width && json.settings?.height) {
          setCanvasSize({ width: json.settings.width, height: json.settings.height });
        }
      } catch {
        /* use default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleCanvasSizeChange = async (value: string) => {
    const selected = CANVAS_SIZE_OPTIONS.find((option) => `${option.width}x${option.height}` === value);
    if (!selected) return;
    setCanvasSize({ width: selected.width, height: selected.height });
    setBusy("canvas_size");
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ width: selected.width, height: selected.height }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save canvas size");
      toast("success", "Project size saved");
      await refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save project size");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveDetails = async () => {
    setBusy("save");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyData: { rawText: editedRawText } }),
      });
      if (!res.ok) throw new Error("Save failed");
      setIsEditingDetails(false);
      toast("success", "Property details saved");
      await refresh();
    } catch {
      toast("error", "Failed to save details");
    } finally {
      setBusy(null);
    }
  };

  const handleExtract = async () => {
    setBusy("extract");
    try {
      await postProjectAction(`/api/projects/${projectId}/extract`);
      toast("success", "Facts extracted successfully");
      await refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateScripts = async () => {
    if (!project?.extractedFacts) {
      toast("error", "Extract facts first", "Use Extract facts in the Details tab.");
      updateTab("details");
      return;
    }
    setBusy("scripts");
    try {
      const data = await postProjectAction<{
        scripts: { id: string }[];
        generationBatch: number;
      }>(`/api/projects/${projectId}/generate-script`, {});
      if (data.scripts?.[0]) {
        await selectScript(data.scripts[0].id);
      }
      updateTab("scripts");
      toast(
        "success",
        `3 new script variations saved (generation ${data.generationBatch ?? ""})`
      );
      await refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Script generation failed");
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateSocial = async (prompt?: string) => {
    if (!selectedScriptId) {
      toast("error", "Select a script variation first");
      updateTab("scripts");
      return;
    }
    setBusy("social");
    try {
      await postProjectAction(`/api/projects/${projectId}/generate-social`, {
        scriptVersionId: selectedScriptId,
        ...(prompt ? { prompt } : {}),
      });
      updateTab("social");
      toast("success", "Social content pack created");
      await refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Social generation failed");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveScript = async () => {
    if (!editingScriptId) return;
    setBusy("save_script");
    try {
      const res = await fetch(`/api/projects/${projectId}/scripts/${editingScriptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editedScriptContent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Script save failed");
      setEditingScriptId(null);
      toast("success", "Script saved");
      await refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save script");
    } finally {
      setBusy(null);
    }
  };

   const handleVoiceover = async (
     voicePersona: string,
     languageCode: string,
     styleId?: string,
     customInstructions?: string
   ) => {
     if (!selectedScriptId) {
       toast("error", "Select a script first");
       return;
     }
     setBusy("voice");
     try {
       const data = await postProjectAction<{
         ttsProvider?: "google" | "edge";
         syncSource?: string;
       }>(`/api/projects/${projectId}/generate-voiceover`, {
         scriptVersionId: selectedScriptId,
         voicePersona,
         languageCode,
         styleId,
         customInstructions,
       });
       updateTab("voice");
       toast(
         "success",
         "Voiceover generated",
         data.ttsProvider === "google"
           ? "Google Cloud TTS"
           : "Microsoft Edge TTS (free fallback)"
       );
       await refresh();
       
       // Auto-initialize timeline with audio and subtitles after voiceover generation
       try {
         const initRes = await fetch(`/api/projects/${projectId}/editor/initialize`, {
           method: "POST",
         });
         if (initRes.ok) {
           // Timeline is now ready, but we no longer automatically navigate.
           toast("info", "Editor initialized", "Subtitles and audio synced successfully");
         }
       } catch (initError) {
         // Non-blocking - user can still manually navigate to editor
         console.warn("Auto-initialization failed:", initError);
         toast(
           "info",
           "Voiceover ready",
           "Couldn't auto-sync subtitles/audio — open the editor to sync manually."
         );
       }
     } catch (e) {
       toast("error", e instanceof Error ? e.message : "Voiceover failed");
     } finally {
       setBusy(null);
     }
   };

  const activeTabIndex = tabs.findIndex((t) => t.id === activeTab);
  const prevTab = activeTabIndex > 0 ? tabs[activeTabIndex - 1] : null;
  const nextTab =
    activeTabIndex < tabs.length - 1 ? tabs[activeTabIndex + 1] : null;

  const goToPrevTab = () => {
    if (prevTab) updateTab(prevTab.id);
  };

  const goToNextTab = () => {
    if (nextTab) updateTab(nextTab.id);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="lg" label="Loading project..." />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <AlertCircle className="w-10 h-10 text-[var(--error-500)] mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Project not found</h2>
          <Button onClick={() => router.push("/dashboard/projects")}>
            Back to Projects
          </Button>
        </CardContent>
      </Card>
    );
  }

  const workflow = [
    { label: "Property saved", done: !!rawText },
    { label: "Facts extracted", done: !!project.extractedFacts },
    { label: "Scripts ready", done: (project._count?.scriptVersions ?? 0) > 0 },
    { label: "Social pack", done: (project._count?.contentPacks ?? 0) > 0 },
    { label: "Voiceover", done: (project._count?.audioAssets ?? 0) > 0 },
    {
      label: "Subtitles",
      done:
        ((project._count as { subtitleTracks?: number } | undefined)
          ?.subtitleTracks ?? 0) > 0,
    },
    {
      label: "Editor",
      done:
        ((project._count as { timelines?: number } | undefined)?.timelines ?? 0) >
        0,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-3 -ml-2"
            onClick={() => router.push("/dashboard/projects")}
          >
            <ArrowLeft className="w-4 h-4" />
            Projects
          </Button>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {project.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {project.template && (
              <Badge variant="secondary">{project.template.name}</Badge>
            )}
            <Badge variant="default" className="capitalize">
              {project.status.toLowerCase().replace(/_/g, " ")}
            </Badge>
            <span className="text-xs text-slate-500">
              {project.durationSeconds}s · {project.language.replace(/_/g, " ")} ·{" "}
              {project.tone}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => updateTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all border",
              activeTab === tab.id
                ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === "details" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Property input
                  </h2>
                  {!isEditingDetails ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditedRawText(rawText);
                        setIsEditingDetails(true);
                      }}
                    >
                      Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setIsEditingDetails(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveDetails} disabled={busy === "save"}>
                        Save
                      </Button>
                    </div>
                  )}
                </div>

                <Textarea
                  readOnly={!isEditingDetails}
                  value={isEditingDetails ? editedRawText : rawText}
                  onChange={(e) => setEditedRawText(e.target.value)}
                  className="min-h-[220px] font-mono text-sm"
                />

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    onClick={handleExtract}
                    disabled={!!busy || !rawText}
                  >
                    {busy === "extract" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {project.extractedFacts ? "Re-extract facts" : "Extract facts"}
                  </Button>
                  {!rawText && (
                    <p className="text-xs text-slate-500">
                      Add property details above to extract facts.
                    </p>
                  )}
                  {project.extractedFacts && !isEditingDetails && (
                    <Badge variant="default" className="text-xs">
                      Facts ready
                    </Badge>
                  )}
                </div>

                {project.extractedFacts && !isEditingDetails && rawText && (
                  <div className="mt-8 pt-6 border-t border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      Property facts
                    </h2>
                    <FactsValidationPanel
                      projectId={projectId}
                      extractedFacts={
                        project.extractedFacts as unknown as Record<string, unknown>
                      }
                      rawText={rawText}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm h-fit">
              <CardContent className="p-6 space-y-4">
                <h2 className="text-sm font-semibold text-slate-900">Progress</h2>
                {workflow.map((step) => (
                  <div key={step.label} className="flex items-center gap-2 text-sm">
                    <CheckCircle2
                      className={cn(
                        "w-4 h-4",
                        step.done ? "text-emerald-500" : "text-slate-300"
                      )}
                    />
                    <span className={step.done ? "text-slate-900" : "text-slate-500"}>
                      {step.label}
                    </span>
                  </div>
                ))}
                <div className="pt-4 space-y-2">
                  <Button className="w-full" onClick={handleGenerateScripts} disabled={!!busy}>
                    {busy === "scripts" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Generate scripts
                  </Button>
                </div>
              </CardContent>
            </Card>



          </div>
        )}

        {activeTab === "scripts" && (
          <div className="space-y-6">
            {latestBatchScripts.length > 0 ? (
              <>
                {latestBatch != null && (
                  <p className="text-xs text-slate-500">
                    Showing latest generation (batch {latestBatch}). Older versions
                    are kept in history below.
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {latestBatchScripts.map((script, idx) => {
                    const selected = selectedScriptId === script.id;
                    return (
                      <Card
                        key={script.id}
                        className={cn(
                          "cursor-pointer transition-all shadow-sm",
                          selected && "ring-2 ring-indigo-500 border-indigo-200"
                        )}
                        onClick={() => selectScript(script.id)}
                      >
                        <CardContent className="p-5">
                          <div className="flex justify-between mb-3 flex-wrap gap-1">
                            <Badge variant={selected ? "default" : "secondary"}>
                              v{script.versionNumber}
                            </Badge>
                            <span className="text-xs text-slate-400">
                              ~{script.estimatedDuration}s
                            </span>
                          </div>
                          <h3 className="font-semibold text-slate-900 mb-2 text-sm">
                            {script.variationStyle}
                          </h3>
                           {editingScriptId === script.id ? (
                             <div onClick={(e) => e.stopPropagation()}>
                               <TransliterateTextarea
                                 value={editedScriptContent}
                                 onChange={setEditedScriptContent}
                                 language={project.language}
                                 className="min-h-[260px] text-sm"
                               />
                             </div>
                           ) : (
                             <div className="max-h-[min(420px,50vh)] overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                               <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                                 {script.content}
                               </p>
                             </div>
                           )}
                           <div className="grid grid-cols-2 gap-2 mt-4">
                             {editingScriptId === script.id ? (
                               <>
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     setEditingScriptId(null);
                                   }}
                                 >
                                   Cancel
                                 </Button>
                                 <Button
                                   size="sm"
                                   disabled={busy === "save_script"}
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     void handleSaveScript();
                                   }}
                                 >
                                   Save
                                 </Button>
                               </>
                             ) : (
                               <>
                                 <Button
                                   variant="outline"
                                   size="sm"
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     setEditingScriptId(script.id);
                                     setEditedScriptContent(script.content);
                                   }}
                                 >
                                   Edit
                                 </Button>
                                 <Button
                                   variant={selected ? "secondary" : "outline"}
                                   size="sm"
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     selectScript(script.id);
                                   }}
                                 >
                                   {selected ? "Selected" : "Use this script"}
                                 </Button>
                               </>
                             )}
                           </div>
                         </CardContent>
                       </Card>
                    );
                  })}
                </div>

                <ScriptHistoryPanel
                  projectId={projectId}
                  scripts={allScripts}
                  selectedScriptId={selectedScriptId}
                  latestBatch={latestBatch}
                  onSelect={(id) => void selectScript(id)}
                  onRefresh={refresh}
                  toast={toast}
                />
                <Card className="border-indigo-100 bg-indigo-50/40">
                  <CardContent className="p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> Refine with AI
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {promptChips.slice(0, 6).map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => setRefinePrompt(chip.prompt)}
                          className="text-xs px-3 py-1.5 rounded-full bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="e.g. Make it more energetic, add urgency..."
                        value={refinePrompt}
                        onChange={(e) => setRefinePrompt(e.target.value)}
                        className="min-h-[60px] bg-white resize-none"
                      />
                      <Button
                        disabled={!refinePrompt.trim() || !selectedScriptId || !!busy}
                        onClick={async () => {
                          setBusy("refine");
                          try {
                            const res = await fetch(
                              `/api/projects/${projectId}/refine-script`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  scriptVersionId: selectedScriptId,
                                  instruction: refinePrompt,
                                }),
                              }
                            );
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error);
                            toast("success", "Script refined");
                            setRefinePrompt("");
                            await refresh();
                          } catch (e) {
                            toast(
                              "error",
                              e instanceof Error ? e.message : "Refine failed"
                            );
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        Refine
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex flex-wrap gap-3 justify-end">
                  <Button variant="secondary" onClick={handleGenerateScripts} disabled={!!busy}>
                    {busy === "scripts" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    Generate new batch (keeps history)
                  </Button>
                </div>
              </>
            ) : allScripts.length > 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center space-y-4">
                  <p className="text-sm text-slate-500">
                    No scripts in the latest batch. Open version history or generate
                    a new batch.
                  </p>
                  <ScriptHistoryPanel
                    projectId={projectId}
                    scripts={allScripts}
                    selectedScriptId={selectedScriptId}
                    latestBatch={latestBatch}
                    onSelect={(id) => void selectScript(id)}
                    onRefresh={refresh}
                    toast={toast}
                  />
                  <Button onClick={handleGenerateScripts} disabled={!!busy}>
                    Generate scripts
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <Sparkles className="w-10 h-10 text-indigo-400 mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No scripts yet</h3>
                  <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                    Extract facts, then generate three script styles for your reel.
                  </p>
                  <Button onClick={handleGenerateScripts} disabled={!!busy}>
                    Generate scripts
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}



        {activeTab === "voice" && (
          <VoiceoverPanel
            audio={latestAudio ?? null}
            projectId={projectId}
            selectedScriptId={selectedScriptId}
            busy={busy === "voice"}
            onGenerate={handleVoiceover}
          />
        )}



        {activeTab === "subtitles" && (
          <SubtitleStudioPanel
            projectId={projectId}
            audio={latestAudio ?? null}
            onNext={() => updateTab("editor")}
          />
        )}

        {activeTab === "editor" && (
          <div className="-mx-1 lg:-mx-2">
            <VideoEditorPanel
              projectId={projectId}
              projectTitle={project.title}
              audio={latestAudio ?? null}
              mediaCount={project._count?.mediaAssets ?? 0}
              mediaAssets={project.mediaAssets ?? []}
              extractedFacts={project.extractedFacts}
              onBackToSubtitles={() => updateTab("subtitles")}
              onNext={() => updateTab("final")}
            />
          </div>
        )}

        {activeTab === "social" && (
          <div className="space-y-6">
            {activePack ? (
              <ContentPackPanel
                projectId={projectId}
                pack={activePack as unknown as Record<string, unknown>}
                regenerating={busy === "social"}
                onRegenerate={handleGenerateSocial}
                onSave={refresh}
              />
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <Hash className="w-10 h-10 text-indigo-400 mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No content pack yet</h3>
                  <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                    Generate Instagram, Facebook, WhatsApp, YouTube, SEO, hashtags,
                    Telegram, Google Business, and CTA copy from your active script.
                  </p>
                  <Button
                    onClick={() => handleGenerateSocial()}
                    disabled={!!busy || !selectedScriptId}
                  >
                    {busy === "social" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    Generate content pack
                  </Button>
                  {!selectedScriptId && (
                    <p className="text-xs text-amber-600 mt-3">
                      Select a script in the Scripts tab first.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {activeTab === "final" && (
          <FinalPostPanel
            projectId={projectId}
            script={selectedScript}
            pack={activePack as unknown as Record<string, unknown> | null | undefined}
            audio={latestAudio ?? null}
            onGoToEditor={() => updateTab("editor")}
          />
        )}


        <div className="flex items-center justify-between gap-4 pt-6 mt-6 border-t border-slate-200">
          <Button
            variant="secondary"
            onClick={goToPrevTab}
            disabled={!prevTab}
            className="min-w-[140px]"
          >
            <ChevronLeft className="w-4 h-4" />
            {prevTab ? `Previous: ${prevTab.label}` : "Previous"}
          </Button>

          <span className="text-xs text-slate-500 tabular-nums">
            Step {activeTabIndex + 1} of {tabs.length}
          </span>

          <Button
            onClick={goToNextTab}
            disabled={!nextTab}
            className="min-w-[140px]"
          >
            {nextTab ? `Next: ${nextTab.label}` : "Next"}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
