import React from "react";
import Draggable from "@/_designcombo/shared/draggable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TRANSITIONS } from "../data/transitions";
import { useIsDraggingOverTimeline } from "../hooks/is-dragging-over-timeline";
import { cn } from "@/lib/utils";

const TRANSITION_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide" },
  { id: "wipe", label: "Wipe" },
  { id: "shape", label: "Shape" },
];

function getCategory(transition: (typeof TRANSITIONS)[number]) {
  if (transition.kind === "fade") return "fade";
  if (transition.kind === "slide") return "slide";
  if (transition.kind === "wipe") return "wipe";
  if (["flip", "clockWipe", "star", "circle", "rectangle"].includes(transition.kind)) return "shape";
  return "all";
}

export const Transitions = () => {
  const isDraggingOverTimeline = useIsDraggingOverTimeline();
  const [activeCategory, setActiveCategory] = React.useState("all");

  const filteredTransitions = activeCategory === "all"
    ? TRANSITIONS
    : TRANSITIONS.filter((t) => getCategory(t) === activeCategory);

  return (
    <div data-testid="panel-transitions" className="flex flex-1 flex-col max-h-full bg-[#f8fafc]">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">Transitions</h2>
        <p className="text-[11px] text-slate-500">Drag onto the timeline between clips</p>
      </div>

      {/* Category filter */}
      <div className="px-4 py-3 border-b border-slate-100 bg-white">
        <div className="flex gap-1.5 flex-wrap">
          {TRANSITION_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                activeCategory === cat.id
                  ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 py-3 max-h-full">
        <div className="grid grid-cols-2 gap-3 max-h-full pb-4">
          {filteredTransitions.map((transition, index) => (
            <TransitionsMenuItem
              key={index}
              transition={transition}
              shouldDisplayPreview={!isDraggingOverTimeline}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

const TransitionsMenuItem = ({
  transition,
  shouldDisplayPreview
}: {
  transition: Partial<any>;
  shouldDisplayPreview: boolean;
}) => {
  const style = React.useMemo(
    () => ({
      backgroundImage: `url(${transition.preview})`,
      backgroundSize: "cover",
      width: "70px",
      height: "70px"
    }),
    [transition.preview]
  );

  const displayName = transition.name || transition.kind || transition.type || "None";

  return (
    <Draggable
      data={transition}
      renderCustomPreview={<div style={style} className="rounded-lg" />}
      shouldDisplayPreview={shouldDisplayPreview}
    >
      <div className="group relative flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-100/50 cursor-grab active:cursor-grabbing">
        <div
          className="w-full aspect-square rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center"
          style={{
            backgroundImage: transition.preview ? `url(${transition.preview})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {!transition.preview && (
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">None</span>
          )}
        </div>
        <span className="text-xs font-medium text-slate-700 capitalize truncate w-full text-center">
          {displayName}
        </span>
        {transition.duration > 0 && (
          <span className="text-[10px] text-slate-400 -mt-1">{transition.duration}s</span>
        )}
      </div>
    </Draggable>
  );
};

export default TransitionsMenuItem;
