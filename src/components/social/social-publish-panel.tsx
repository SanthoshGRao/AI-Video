"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Share2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ContentPackDraft } from "@/lib/content-pack/schema";
import {
  SOCIAL_PLATFORMS,
  buildShareUrl,
  type SocialPlatformId,
} from "@/lib/social/platforms";
import { toast } from "sonner";

type ConnectedAccount = { platform: string; accountName: string | null };
type ExportJob = { id: string; status: string; downloadUrl: string | null; renderProgress: number };

function captionForPlatform(draft: ContentPackDraft, platformId: SocialPlatformId): string {
  const hashtags = draft.hashtagSets.set20.slice(0, 8).join(" ");
  switch (platformId) {
    case "instagram":
      return [draft.instagramCaptions[0] ?? "", hashtags].filter(Boolean).join("\n\n");
    case "facebook":
      return [draft.facebookCopies[0] ?? "", hashtags].filter(Boolean).join("\n\n");
    case "whatsapp":
      return draft.whatsappCopies[0] ?? "";
    case "youtube":
      return [draft.youtubeDescriptions[0] ?? "", hashtags].filter(Boolean).join("\n\n");
    case "telegram":
      return [draft.telegramCopy, hashtags].filter(Boolean).join("\n\n");
    default:
      return "";
  }
}

export function SocialPublishPanel({
  projectId,
  draft,
}: {
  projectId: string;
  draft: ContentPackDraft;
}) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [socialRes, exportRes] = await Promise.all([
        fetch("/api/integrations/social", { cache: "no-store" }),
        fetch(`/api/projects/${projectId}/export`, { cache: "no-store" }),
      ]);
      const socialJson = await socialRes.json();
      const exportJson = await exportRes.json();
      setAccounts(socialRes.ok ? socialJson.accounts ?? [] : []);
      const jobs = (exportJson.jobs ?? []) as ExportJob[];
      setExportJob(jobs.find((j) => j.status === "DONE" && j.downloadUrl) ?? jobs[0] ?? null);
    } catch {
      setAccounts([]);
      setExportJob(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const connectedIds = useMemo(() => {
    return new Set(
      accounts
        .map((a) => SOCIAL_PLATFORMS.find((p) => p.dbPlatform === a.platform)?.id)
        .filter(Boolean) as SocialPlatformId[],
    );
  }, [accounts]);

  const publish = async (platformId: SocialPlatformId) => {
    const text = captionForPlatform(draft, platformId);
    const videoUrl = exportJob?.downloadUrl ?? undefined;
    try {
      await navigator.clipboard.writeText(videoUrl ? `${text}\n\n${videoUrl}` : text);
      toast.success("Caption copied to clipboard");
    } catch {
      toast.error("Could not copy caption");
    }
    const url = buildShareUrl(platformId, text, videoUrl);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading publish workspace...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-indigo-100 bg-indigo-50/20">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Video className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Exported video</p>
              {exportJob?.status === "DONE" && exportJob.downloadUrl ? (
                <a
                  href={exportJob.downloadUrl}
                  className="text-xs text-indigo-600 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Download latest export
                </a>
              ) : (
                <p className="text-xs text-slate-500">
                  Export your video in the Editor tab first — captions will include the download link when ready.
                </p>
              )}
            </div>
          </div>
          {exportJob?.downloadUrl ? (
            <Button size="sm" variant="outline" asChild>
              <a href={exportJob.downloadUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="w-3.5 h-3.5" /> Open video
              </a>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SOCIAL_PLATFORMS.map((platform) => {
          const connected = connectedIds.has(platform.id);
          const preview = captionForPlatform(draft, platform.id);
          return (
            <Card key={platform.id} className="shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: platform.color }} />
                    <p className="text-sm font-semibold">{platform.label}</p>
                  </div>
                  {connected ? (
                    <span className="text-[10px] font-semibold uppercase text-emerald-700">Auto</span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase text-slate-400">Not linked</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 line-clamp-4 whitespace-pre-wrap">{preview || "No caption yet."}</p>
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  disabled={!connected}
                  onClick={() => void publish(platform.id)}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {connected ? "Copy & share" : "Connect in Settings"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
