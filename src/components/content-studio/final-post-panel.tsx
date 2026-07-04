"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { packToDraft } from "@/lib/content-pack/schema";
import type { ScriptVersion, AudioAsset } from "@/types";
import { WaveformPlayer } from "@/components/content-studio/waveform-player";


function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {label}
    </Button>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <CopyButton text={text} />
        </div>
        <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm leading-relaxed text-slate-700 font-sans">
          {text || "Not generated yet."}
        </pre>
      </CardContent>
    </Card>
  );
}

export function FinalPostPanel({
  projectId,
  script,
  pack,
  audio,
  onGoToEditor,
}: {
  projectId: string;
  script: ScriptVersion | null;
  pack: Record<string, unknown> | null | undefined;
  audio: AudioAsset | null;
  onGoToEditor?: () => void;
}) {
  const draft = useMemo(() => (pack ? packToDraft(pack) : null), [pack]);

  const sections = useMemo(() => {
    if (!draft) return [];
    const allSections = [
      { id: "selected_script", title: "Selected script", text: script?.content ?? "" },
      { id: "instagram", title: "Instagram", text: draft.instagramCaptions[0] ?? "" },
      { id: "facebook", title: "Facebook", text: draft.facebookCopies[0] ?? "" },
      { id: "whatsapp", title: "WhatsApp", text: draft.whatsappCopies[0] ?? "" },
      { id: "youtube", title: "YouTube", text: draft.youtubeDescriptions[0] ?? "" },
      { id: "telegram", title: "Telegram", text: draft.telegramCopy },
      { id: "google", title: "Google Business", text: draft.googleBusinessPost },
      { id: "highlights", title: "Highlights", text: draft.propertyHighlights.join("\n") },
      {
        id: "seo",
        title: "SEO",
        text: `Title: ${draft.seoMetadata.title}\nDescription: ${draft.seoMetadata.description}\nKeywords: ${draft.seoMetadata.keywords.join(", ")}`,
      },
    ];

    const baseSections = ["selected_script", "highlights", "seo"];

    return allSections.filter(
      (section) =>
        baseSections.includes(section.id) ||
        (draft.selectedPlatforms && draft.selectedPlatforms.includes(section.id))
    );
  }, [draft, script]);

  if (!draft) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center text-sm text-slate-500">
          Generate and save a social content pack to see final ready-to-post output.
        </CardContent>
      </Card>
    );
  }

  const allText = sections.map((section) => `## ${section.title}\n${section.text}`).join("\n\n---\n\n");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Final saved output, ready to copy per platform.</p>
        <CopyButton text={allText} label="Copy all" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {audio && (
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Generated Voice</h3>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <WaveformPlayer 
                  audioUrl={audio.r2Url} 
                  waveformData={audio.waveformData as number[]} 
                  durationMs={audio.durationMs}
                  projectId={audio.projectId}
                  audioId={audio.id}
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-sm border-indigo-100">
          <CardContent className="p-5 flex flex-col justify-center items-center text-center h-full space-y-3 bg-indigo-50/30">
            <h3 className="text-sm font-semibold text-indigo-900">Edited Video</h3>
            <p className="text-xs text-slate-600 max-w-[250px]">
              The video is rendered securely on your device. Go back to the Editor to export the final MP4.
            </p>
            {onGoToEditor && (
              <Button size="sm" variant="outline" className="mt-2 bg-white" onClick={onGoToEditor}>
                Go to Editor
              </Button>
            )}
          </CardContent>
        </Card>

        {sections.map((section) => (
          <Section key={section.title} title={section.title} text={section.text} />
        ))}
      </div>
    </div>
  );
}
