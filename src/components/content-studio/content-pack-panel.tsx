"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Globe,
  Hash,
  Loader2,
  MessageCircle,
  Save,
  Sparkles,
  Video,
} from "lucide-react";

const InstagramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const FacebookIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useUIStore } from "@/stores/ui-store";
import {
  draftToUpdatePayload,
  packToDraft,
  type ContentPackDraft,
} from "@/lib/content-pack/schema";
import { cn } from "@/lib/utils";

type SectionId =
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "youtube"
  | "seo"
  | "hashtags"
  | "telegram"
  | "google";

const SECTIONS: { id: SectionId; label: string; icon: any; isPlatform?: boolean }[] = [
  { id: "instagram", label: "Instagram", icon: InstagramIcon, isPlatform: true },
  { id: "facebook", label: "Facebook", icon: FacebookIcon, isPlatform: true },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, isPlatform: true },
  { id: "youtube", label: "YouTube", icon: Video, isPlatform: true },
  { id: "telegram", label: "Telegram", icon: MessageCircle, isPlatform: true },
  { id: "google", label: "Google Business", icon: Globe, isPlatform: true },
  { id: "seo", label: "SEO", icon: Globe },
  { id: "hashtags", label: "Hashtags", icon: Hash },
];

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8"
      onClick={async () => {
        await copyText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {label}
    </Button>
  );
}

function StringListEditor({
  label,
  items,
  onChange,
  placeholder,
  platformId,
  isPlatform,
  isSelected,
  onSelectVariant,
  onDeselectPlatform,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  platformId?: string;
  isPlatform?: boolean;
  isSelected?: boolean;
  onSelectVariant?: (index: number) => void;
  onDeselectPlatform?: () => void;
}) {
  const displayItems = items.length > 0 ? items : [""];

  const update = (index: number, value: string) => {
    const next = [...displayItems];
    next[index] = value;
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {isPlatform && isSelected && (
           <Button
             type="button"
             variant="ghost"
             size="sm"
             className="h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
             onClick={() => onDeselectPlatform?.()}
           >
             Turn off channel
           </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4">
        {displayItems.map((item, i) => {
          const isPrimary = i === 0;
          const isPublished = isPlatform && isSelected && isPrimary;

          return (
            <div
              key={i}
              className={cn(
                "relative group rounded-xl border bg-white p-4 shadow-sm flex flex-col min-h-[160px] transition-all",
                isPublished ? "border-emerald-500 ring-1 ring-emerald-500 shadow-md" : "border-slate-200"
              )}
            >
              <Textarea
                value={item}
                placeholder={placeholder ?? `Variation ${i + 1}`}
                className={cn(
                  "min-h-[120px] text-[13px] leading-relaxed flex-1 border-slate-200 resize-y focus:bg-white transition-colors",
                  isPublished ? "bg-emerald-50/30" : "bg-slate-50/50"
                )}
                onChange={(e) => update(i, e.target.value)}
              />
              <div className="flex items-center justify-between mt-3 gap-2">
                <span className={cn(
                  "text-[11px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider",
                  isPublished ? "bg-emerald-100 text-emerald-700" : "text-slate-400 bg-slate-100"
                )}>
                  Variation #{i + 1}
                </span>

                {isPlatform && !isPublished && (
                   <Button
                     type="button"
                     variant="outline"
                     size="sm"
                     className="h-7 text-xs shadow-sm bg-white border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                     onClick={() => onSelectVariant?.(i)}
                   >
                     Select this variant
                   </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ContentPackPanel({
  projectId,
  pack,
  onRegenerate,
  regenerating,
  onSave,
}: {
  projectId: string;
  pack: Record<string, unknown>;
  onRegenerate: (prompt?: string) => Promise<void>;
  regenerating?: boolean;
  onSave?: () => Promise<void>;
}) {
  const addToast = useUIStore((s) => s.addToast);
  const [section, setSection] = useState<SectionId>("instagram");
  const [draft, setDraft] = useState<ContentPackDraft>(() => packToDraft(pack));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(packToDraft(pack));
    setDirty(false);
  }, [pack]);

  const markDirty = useCallback(
    (updater: (d: ContentPackDraft) => ContentPackDraft) => {
      setDraft(updater);
      setDirty(true);
    },
    []
  );

  const save = useCallback(async (currentDraft: ContentPackDraft) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/content-pack`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToUpdatePayload(currentDraft)),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setDirty(false);
      onSave?.();
    } catch (e) {
      addToast({
        type: "error",
        title: "Save failed",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }, [projectId, addToast]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      void save(draft);
    }, 1500);
    return () => clearTimeout(t);
  }, [draft, dirty, save]);

  const handleSelectVariant = useCallback((platform: string, variantIndex: number, fieldName: keyof ContentPackDraft) => {
    markDirty((d) => {
      const next = { ...d };
      const currentList = [...(next[fieldName] as string[])];
      if (variantIndex > 0 && currentList.length > variantIndex) {
        // Swap the selected variant to index 0 so it becomes the primary
        const temp = currentList[0];
        currentList[0] = currentList[variantIndex];
        currentList[variantIndex] = temp;
        (next as any)[fieldName] = currentList;
      }
      
      const platforms = next.selectedPlatforms || [];
      if (!platforms.includes(platform)) {
        next.selectedPlatforms = [...platforms, platform];
      }
      return next;
    });
  }, [markDirty]);

  const handleDeselectPlatform = useCallback((platform: string) => {
    markDirty((d) => {
      const platforms = d.selectedPlatforms || [];
      return { ...d, selectedPlatforms: platforms.filter(p => p !== platform) };
    });
  }, [markDirty]);

  const sectionContent = useMemo(() => {
    switch (section) {
      case "instagram":
        return (
          <StringListEditor
            label="Instagram captions"
            items={draft.instagramCaptions}
            onChange={(items) => markDirty((d) => ({ ...d, instagramCaptions: items }))}
            placeholder="Hook + emojis + CTA…"
            isPlatform={true}
            platformId="instagram"
            isSelected={draft.selectedPlatforms?.includes("instagram")}
            onSelectVariant={(i) => handleSelectVariant("instagram", i, "instagramCaptions")}
            onDeselectPlatform={() => handleDeselectPlatform("instagram")}
          />
        );
      case "facebook":
        return (
          <StringListEditor
            label="Facebook posts"
            items={draft.facebookCopies}
            onChange={(items) => markDirty((d) => ({ ...d, facebookCopies: items }))}
            placeholder="Longer story-driven post…"
            isPlatform={true}
            platformId="facebook"
            isSelected={draft.selectedPlatforms?.includes("facebook")}
            onSelectVariant={(i) => handleSelectVariant("facebook", i, "facebookCopies")}
            onDeselectPlatform={() => handleDeselectPlatform("facebook")}
          />
        );
      case "whatsapp":
        return (
          <StringListEditor
            label="WhatsApp forwards"
            items={draft.whatsappCopies}
            onChange={(items) => markDirty((d) => ({ ...d, whatsappCopies: items }))}
            placeholder="Short punchy forward with *bold*…"
            isPlatform={true}
            platformId="whatsapp"
            isSelected={draft.selectedPlatforms?.includes("whatsapp")}
            onSelectVariant={(i) => handleSelectVariant("whatsapp", i, "whatsappCopies")}
            onDeselectPlatform={() => handleDeselectPlatform("whatsapp")}
          />
        );
      case "youtube":
        return (
          <StringListEditor
            label="YouTube Shorts descriptions"
            items={draft.youtubeDescriptions}
            onChange={(items) => markDirty((d) => ({ ...d, youtubeDescriptions: items }))}
            placeholder="Description + keywords line…"
            isPlatform={true}
            platformId="youtube"
            isSelected={draft.selectedPlatforms?.includes("youtube")}
            onSelectVariant={(i) => handleSelectVariant("youtube", i, "youtubeDescriptions")}
            onDeselectPlatform={() => handleDeselectPlatform("youtube")}
          />
        );
      case "seo":
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm font-semibold text-slate-900">SEO metadata</p>
              <CopyButton
                text={`Title: ${draft.seoMetadata.title}\n\nDescription: ${draft.seoMetadata.description}\n\nKeywords: ${draft.seoMetadata.keywords.join(", ")}`}
                label="Copy SEO"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Title</label>
              <Input
                value={draft.seoMetadata.title}
                maxLength={120}
                className="mt-1"
                onChange={(e) =>
                  markDirty((d) => ({
                    ...d,
                    seoMetadata: { ...d.seoMetadata, title: e.target.value },
                  }))
                }
              />
              <p className="text-[10px] text-slate-400 mt-1">
                {draft.seoMetadata.title.length}/60 recommended
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Meta description</label>
              <Textarea
                value={draft.seoMetadata.description}
                className="mt-1 min-h-[80px] text-sm"
                onChange={(e) =>
                  markDirty((d) => ({
                    ...d,
                    seoMetadata: { ...d.seoMetadata, description: e.target.value },
                  }))
                }
              />
              <p className="text-[10px] text-slate-400 mt-1">
                {draft.seoMetadata.description.length}/160 recommended
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Keywords</label>
              <Input
                value={draft.seoMetadata.keywords.join(", ")}
                className="mt-1"
                placeholder="farmland, mysore, plantation"
                onChange={(e) =>
                  markDirty((d) => ({
                    ...d,
                    seoMetadata: {
                      ...d.seoMetadata,
                      keywords: e.target.value
                        .split(",")
                        .map((k) => k.trim())
                        .filter(Boolean),
                    },
                  }))
                }
              />
            </div>
          </div>
        );
      case "telegram": {
        const isPublished = draft.selectedPlatforms?.includes("telegram");
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm font-semibold text-slate-900">Telegram post</p>
              {isPublished && (
                 <Button
                   type="button"
                   variant="ghost"
                   size="sm"
                   className="h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                   onClick={() => handleDeselectPlatform("telegram")}
                 >
                   Turn off channel
                 </Button>
              )}
            </div>
            <div className={cn(
              "relative rounded-xl border bg-white p-4 shadow-sm flex flex-col min-h-[160px] transition-all",
              isPublished ? "border-emerald-500 ring-1 ring-emerald-500 shadow-md" : "border-slate-200"
            )}>
              <Textarea
                value={draft.telegramCopy}
                className={cn(
                  "min-h-[160px] text-[13px] leading-relaxed flex-1 border-slate-200 resize-y focus:bg-white transition-colors",
                  isPublished ? "bg-emerald-50/30" : "bg-slate-50/50"
                )}
                onChange={(e) =>
                  markDirty((d) => ({ ...d, telegramCopy: e.target.value }))
                }
              />
              <div className="flex items-center justify-between mt-3 gap-2">
                <span className={cn(
                  "text-[11px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider",
                  isPublished ? "bg-emerald-100 text-emerald-700" : "text-slate-400 bg-slate-100"
                )}>
                  Single Variation
                </span>
                {!isPublished && (
                   <Button
                     type="button"
                     variant="outline"
                     size="sm"
                     className="h-7 text-xs shadow-sm bg-white border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                     onClick={() => handleSelectVariant("telegram", 0, "telegramCopy" as any)}
                   >
                     Select for publishing
                   </Button>
                )}
              </div>
            </div>
          </div>
        );
      }
      case "google": {
        const isPublished = draft.selectedPlatforms?.includes("google");
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm font-semibold text-slate-900">Google Business post</p>
              {isPublished && (
                 <Button
                   type="button"
                   variant="ghost"
                   size="sm"
                   className="h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                   onClick={() => handleDeselectPlatform("google")}
                 >
                   Turn off channel
                 </Button>
              )}
            </div>
            <div className={cn(
              "relative rounded-xl border bg-white p-4 shadow-sm flex flex-col min-h-[160px] transition-all",
              isPublished ? "border-emerald-500 ring-1 ring-emerald-500 shadow-md" : "border-slate-200"
            )}>
              <Textarea
                value={draft.googleBusinessPost}
                className={cn(
                  "min-h-[160px] text-[13px] leading-relaxed flex-1 border-slate-200 resize-y focus:bg-white transition-colors",
                  isPublished ? "bg-emerald-50/30" : "bg-slate-50/50"
                )}
                onChange={(e) =>
                  markDirty((d) => ({ ...d, googleBusinessPost: e.target.value }))
                }
              />
              <div className="flex items-center justify-between mt-3 gap-2">
                <span className={cn(
                  "text-[11px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider",
                  isPublished ? "bg-emerald-100 text-emerald-700" : "text-slate-400 bg-slate-100"
                )}>
                  Single Variation
                </span>
                {!isPublished && (
                   <Button
                     type="button"
                     variant="outline"
                     size="sm"
                     className="h-7 text-xs shadow-sm bg-white border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                     onClick={() => handleSelectVariant("google", 0, "googleBusinessPost" as any)}
                   >
                     Select for publishing
                   </Button>
                )}
              </div>
            </div>
          </div>
        );
      }
      case "hashtags":
        return (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-900">Hashtag Sets</p>
            <p className="text-xs text-slate-500 mb-4">Select a hashtag variant and dynamically add it to your currently selected publishing channels.</p>
            
            {(["set10", "set20", "set30"] as const).map((setKey) => {
               const tags = draft.hashtagSets?.[setKey] || [];
               if (tags.length === 0) return null;
               const tagString = tags.join(" ");
               
               return (
                 <div key={setKey} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                   <div className="flex items-center justify-between mb-3">
                     <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-wider">{tags.length} Hashtags</span>
                     <Button
                       type="button"
                       size="sm"
                       className="bg-indigo-600 hover:bg-indigo-700 h-8 gap-1.5 text-xs shadow-sm shadow-indigo-200 text-white"
                       disabled={!(draft.selectedPlatforms?.length)}
                       onClick={() => {
                         const platforms = draft.selectedPlatforms || [];
                         if (platforms.length === 0) return;
                         
                         const stripTrailingHashtags = (text: string) => {
                           // Removes all consecutive hashtags and whitespace at the very end of the text
                           return text.replace(/(?:\s*#[a-zA-Z0-9_]+)+\s*$/, "").trim();
                         };
                         
                         const appendTags = (text: string) => {
                           const cleaned = stripTrailingHashtags(text);
                           return cleaned + "\n\n" + tagString;
                         };

                         markDirty(d => {
                           const next = { ...d };
                           if (platforms.includes("instagram") && next.instagramCaptions.length > 0) {
                             next.instagramCaptions[0] = appendTags(next.instagramCaptions[0]);
                           }
                           if (platforms.includes("facebook") && next.facebookCopies.length > 0) {
                             next.facebookCopies[0] = appendTags(next.facebookCopies[0]);
                           }
                           if (platforms.includes("youtube") && next.youtubeDescriptions.length > 0) {
                             next.youtubeDescriptions[0] = appendTags(next.youtubeDescriptions[0]);
                           }
                           if (platforms.includes("google") && next.googleBusinessPost) {
                             next.googleBusinessPost = appendTags(next.googleBusinessPost);
                           }
                           if (platforms.includes("telegram") && next.telegramCopy) {
                             next.telegramCopy = appendTags(next.telegramCopy);
                           }
                           if (platforms.includes("whatsapp") && next.whatsappCopies.length > 0) {
                             next.whatsappCopies[0] = appendTags(next.whatsappCopies[0]);
                           }
                           return next;
                         });
                         addToast({ type: "success", title: "Hashtags added to selected channels!" });
                       }}
                     >
                       Add to Selected Channels
                     </Button>
                   </div>
                   <Textarea
                     value={tagString}
                     readOnly
                     className="min-h-[80px] text-[13px] leading-relaxed bg-slate-50 border-slate-200 resize-none text-indigo-600 focus-visible:ring-0"
                   />
                 </div>
               );
            })}
          </div>
        );
      default:
        return null;
    }
  }, [section, draft, markDirty]);

  return (
    <div className="flex flex-col md:flex-row gap-6 items-start">
      {/* Sidebar Navigation */}
      <div className="w-full md:w-64 shrink-0 flex flex-col gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-2.5">
          <Button
            type="button"
            variant="outline"
            className="w-full bg-white h-10 border-slate-200 hover:bg-slate-50 text-slate-700"
            disabled={regenerating}
            onClick={() => void onRegenerate()}
          >
            {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
            Regenerate pack
          </Button>
          {saving && (
             <div className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1.5 mt-1 font-medium">
                <Loader2 className="w-3 h-3 animate-spin" /> Auto-saving...
             </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Publish Channels</p>
          </div>
          <div className="p-2 space-y-0.5">
            {SECTIONS.filter(s => s.isPlatform).map(({ id, label, icon: Icon }) => {
              const isSelected = draft.selectedPlatforms?.includes(id);
              return (
                <div
                  key={id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if(e.key === "Enter" || e.key === " ") setSection(id); }}
                  onClick={() => setSection(id)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left cursor-pointer",
                    section === id
                      ? "bg-indigo-50 text-indigo-800"
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    {label}
                  </div>
                  {isSelected && (
                    <div className="bg-emerald-500 rounded-full p-0.5 shadow-sm">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-3 bg-slate-50 border-y border-slate-100 mt-2 flex items-center justify-between">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Metadata</p>
          </div>
          <div className="p-2 space-y-0.5">
            {SECTIONS.filter(s => !s.isPlatform).map(({ id, label, icon: Icon }) => (
              <div
                key={id}
                role="button"
                tabIndex={0}
                onClick={() => setSection(id)}
                onKeyDown={(e) => { if(e.key === "Enter" || e.key === " ") setSection(id); }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left cursor-pointer",
                  section === id
                    ? "bg-indigo-50 text-indigo-800"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-6">
            {sectionContent}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
