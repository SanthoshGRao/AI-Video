import { Button, buttonVariants } from "@/components/ui/button";
import { ADD_ITEMS } from "@designcombo/state";
import { dispatch } from "@designcombo/events";
import { useIsDraggingOverTimeline } from "../hooks/is-dragging-over-timeline";
import Draggable from "@/_designcombo/shared/draggable";
import { TEXT_ADD_PAYLOAD } from "../constants/payload";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";

const TEXT_TRACK_CONFIG = {
  id: "track-text",
  items: [] as string[],
  type: "text" as const,
  name: "Text"
};

export const Texts = () => {
  const isDraggingOverTimeline = useIsDraggingOverTimeline();

  const handleAddText = () => {
    const id = nanoid();
    const trackItem = { ...TEXT_ADD_PAYLOAD, id };

    dispatch(ADD_ITEMS, {
      payload: {
        trackItems: [trackItem],
        tracks: [{ ...TEXT_TRACK_CONFIG, items: [id] }]
      }
    });
  };

  return (
    <div data-testid="panel-texts" className="flex flex-1 flex-col">
      <div className="flex flex-col gap-2 p-4">
        <Draggable
          data={TEXT_ADD_PAYLOAD}
          renderCustomPreview={
            <Button variant="secondary" className="w-60">
              Add text
            </Button>
          }
          shouldDisplayPreview={!isDraggingOverTimeline}
        >
          <div
            onClick={handleAddText}
            className={cn(
              buttonVariants({ variant: "default" }),
              "cursor-pointer"
            )}
          >
            Add text
          </div>
        </Draggable>
      </div>
    </div>
  );
};
