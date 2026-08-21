"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/hooks/use-projects";
import { Sparkles, CheckCircle2, ChevronRight, Share2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ContentStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const { data: project, isLoading } = useProject(resolvedParams.id);
  const router = useRouter();

  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExtractFacts = async () => {
    setIsExtracting(true);
    try {
      await fetch(`/api/projects/${resolvedParams.id}/extract`, { method: "POST" });
      // Reload logic or invalidate query
      window.location.reload();
    } catch (err) {
      console.error(err);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleGenerateScripts = async () => {
    setIsGenerating(true);
    try {
      await fetch(`/api/projects/${resolvedParams.id}/generate-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      alert("Scripts generated successfully! (UI integration pending)");
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return <div className="p-10 text-center text-[var(--neutral-500)]">Loading Studio...</div>;
  }

  if (!project) {
    return <div className="p-10 text-center text-red-500">Project not found.</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[var(--bg-secondary)]">
      {/* Studio Header */}
      <header className="flex-shrink-0 px-6 py-4 bg-white border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {project.title}
          </h1>
          <span className="px-2.5 py-1 text-xs font-medium bg-[var(--primary-50)] text-[var(--primary-700)] rounded-full">
            {project.status.replace("_", " ")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
            Save & Exit
          </Button>
          <Button size="sm" className="bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white">
            Continue to Video Editor
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </header>

      {/* Studio Workspace */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {/* Fact Extraction Card */}
          <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">1. Property Facts</h2>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  We'll extract the core details from your description to ensure accuracy.
                </p>
              </div>
              {!project.extractedFacts ? (
                <Button 
                  onClick={handleExtractFacts} 
                  disabled={isExtracting}
                  className="bg-gradient-to-r from-[var(--primary-600)] to-[var(--accent-600)] text-white"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {isExtracting ? "Extracting..." : "Auto-Extract Facts"}
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-[var(--success-600)] font-medium text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  Facts Extracted
                </div>
              )}
            </div>

            {project.extractedFacts && (
              <div className="bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border-subtle)] text-sm">
                <pre className="whitespace-pre-wrap font-mono text-[var(--neutral-700)]">
                  {JSON.stringify(project.extractedFacts, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Script Generation Card */}
          <div className={`bg-white rounded-2xl border border-[var(--border-subtle)] p-6 shadow-sm transition-opacity ${!project.extractedFacts ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">2. AI Script Generation</h2>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  Generate high-converting voiceover scripts based on your facts.
                </p>
              </div>
              <Button 
                onClick={handleGenerateScripts} 
                disabled={isGenerating || !project.extractedFacts}
                variant="outline"
                className="border-[var(--primary-200)] text-[var(--primary-700)] hover:bg-[var(--primary-50)]"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {isGenerating ? "Generating Variations..." : "Generate Scripts"}
              </Button>
            </div>
            {/* Future: Render the 3 script variation cards here */}
            <div className="py-8 text-center text-[var(--neutral-400)] text-sm border-2 border-dashed border-[var(--border-subtle)] rounded-xl">
              Click "Generate Scripts" to create your 3 AI variations.
            </div>
          </div>

          {/* Actions Preview */}
          <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-6 opacity-50 flex items-center justify-between cursor-not-allowed">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[var(--primary-50)] flex items-center justify-center text-[var(--primary-600)]">
                <PlayCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--text-primary)]">Text-to-Speech</h3>
                <p className="text-xs text-[var(--text-secondary)]">Available after script approval</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
