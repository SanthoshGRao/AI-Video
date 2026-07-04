"use client";

import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { TRANSITIONS } from "@/_designcombo/editor/data/transitions";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";

export function TransitionsView() {
  return (
    <PanelView title="Transitions">
      <div className="grid gap-2 grid-cols-2">
        {TRANSITIONS.map((transition, index) => {
          const style = {
            backgroundImage: `url(${transition.preview})`,
            backgroundSize: "cover",
            width: "100%",
            height: "100%"
          };
          
          return (
            <DraggableItem
              key={index}
              name={transition.name || transition.type || "Transition"}
              preview={
                <div className="bg-accent flex size-full items-center justify-center rounded">
                  <div style={style} draggable={false} />
                </div>
              }
              dragData={{
                id: `transition-${transition.id}`,
                name: transition.name || transition.type || "Transition",
                type: "transition",
                transitionType: (transition.kind && transition.kind !== "none" ? transition.kind : "fade") as any,
                durationMs: (transition.duration || 0.5) * 1000,
              }}
            />
          );
        })}
      </div>
    </PanelView>
  );
}
