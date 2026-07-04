"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  IAudio,
  ICaption,
  IImage,
  IText,
  ITrackItem,
  ITrackItemAndDetails,
  IVideo,
} from "@designcombo/types";
import useStore from "./store/use-store";
import useLayoutStore from "./store/use-layout-store";
import BasicText from "./control-item/basic-text";
import BasicImage from "./control-item/basic-image";
import BasicVideo from "./control-item/basic-video";
import BasicAudio from "./control-item/basic-audio";
import BasicCaption from "./control-item/basic-caption";
import { PositionInspector } from "./control-item/common/position-inspector";
import { CaptionTimingInspector } from "./control-item/common/caption-timing";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { ProjectSettingsInspector } from "./project-settings-inspector";

const ActiveInspector = ({
  trackItem,
}: {
  trackItem: ITrackItemAndDetails;
}) => {
  const type = trackItem.type;
  return (
    <div className="space-y-2">
      {type !== "audio" && (
        <InspectorSection title="Transform" defaultOpen>
          <PositionInspector trackItem={trackItem} />
        </InspectorSection>
      )}
      {type === "caption" && (
        <InspectorSection title="Timing" defaultOpen>
          <CaptionTimingInspector trackItem={trackItem as ITrackItem & ICaption} />
        </InspectorSection>
      )}
      <InspectorSection title={type === "audio" ? "Audio" : "Appearance"} defaultOpen>
        {{
          text: <BasicText trackItem={trackItem as ITrackItem & IText} />,
          caption: <BasicCaption trackItem={trackItem as ITrackItem & ICaption} />,
          image: <BasicImage trackItem={trackItem as ITrackItem & IImage} />,
          video: <BasicVideo trackItem={trackItem as ITrackItem & IVideo} />,
          audio: <BasicAudio trackItem={trackItem as ITrackItem & IAudio} />,
        }[type as "text"]}
      </InspectorSection>
      {type !== "audio" && (
        <InspectorSection title="Crop">
          <p className="px-2 py-2 text-xs text-muted-foreground">Use canvas crop handles or media fit controls for this layer.</p>
        </InspectorSection>
      )}
      {type !== "audio" && (
        <InspectorSection title="Animation">
          <p className="px-2 py-2 text-xs text-muted-foreground">Animation controls appear here when supported by the selected layer.</p>
        </InspectorSection>
      )}
    </div>
  );
};

function InspectorSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-3 text-xs font-bold uppercase tracking-wide text-slate-700">
        {title}
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-100 p-2">{children}</div>
    </details>
  );
}

export function PropertyInspector() {
  const { activeIds, trackItemsMap, transitionsMap } = useStore();
  const [trackItem, setTrackItem] = useState<ITrackItem | null>(null);
  const { setTrackItem: setLayoutTrackItem } = useLayoutStore();

  useEffect(() => {
    if (activeIds.length === 1) {
      const [id] = activeIds;
      const item = trackItemsMap[id];
      if (item) {
        setTrackItem(item);
        setLayoutTrackItem(item);
      } else {
        setTrackItem(null);
        setLayoutTrackItem(null);
      }
    } else {
      setTrackItem(null);
      setLayoutTrackItem(null);
    }
  }, [activeIds, trackItemsMap, transitionsMap, setLayoutTrackItem]);

  return (
    <div className="flex h-full w-full flex-col bg-[#f8fafc]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <Label className="text-sm font-bold text-slate-900">
          {trackItem ? `Properties · ${trackItem.type}` : "Properties"}
        </Label>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
          Live
        </span>
      </div>
      <ScrollArea className="flex-1">
        {trackItem ? (
          <div className="flex flex-col gap-3 p-3">
            <ActiveInspector trackItem={trackItem} />
          </div>
        ) : (
          <div className="p-3">
            <ProjectSettingsInspector />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
