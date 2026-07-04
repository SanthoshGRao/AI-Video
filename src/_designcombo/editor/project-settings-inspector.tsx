import { editorStateManager } from "./state-manager";
import useStore from "./store/use-store";
import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT } from "@designcombo/state";
import { Label } from "@/components/ui/label";
import { Monitor, Smartphone, Square } from "lucide-react";

export function ProjectSettingsInspector() {
  const { size } = useStore();
  
  const isPortrait = size.width === 1080 && size.height === 1920;
  const isLandscape = size.width === 1920 && size.height === 1080;
  const isSquare = size.width === 1080 && size.height === 1080;
  
  const value = isPortrait ? "portrait" : isLandscape ? "landscape" : isSquare ? "square" : "custom";

  const handleSizeChange = (val: string) => {
    let newSize = { width: 1080, height: 1920 };
    if (val === "portrait") newSize = { width: 1080, height: 1920 };
    if (val === "landscape") newSize = { width: 1920, height: 1080 };
    if (val === "square") newSize = { width: 1080, height: 1080 };

    const oldWidth = size.width;
    const oldHeight = size.height;
    const newWidth = newSize.width;
    const newHeight = newSize.height;

    editorStateManager.updateState({ size: newSize });

    const state = editorStateManager.getState();
    const payload: Record<string, any> = {};
    
    for (const [id, item] of Object.entries(state.trackItemsMap)) {
      if (item.type === "caption") {
        const currentTopStr = item.details?.top as string | undefined;
        let currentTop = 0;
        if (currentTopStr && typeof currentTopStr === "string") {
          currentTop = parseFloat(currentTopStr.replace("px", "")) || 0;
        } else if (typeof currentTopStr === "number") {
          currentTop = currentTopStr;
        } else {
          currentTop = oldHeight * 0.78;
        }
        
        const ratio = oldHeight > 0 ? currentTop / oldHeight : 0.78;
        const newTop = `${Math.round(ratio * newHeight)}px`;

        const currentLeftStr = item.details?.left as string | undefined;
        let currentLeft = 0;
        if (currentLeftStr && typeof currentLeftStr === "string") {
          currentLeft = parseFloat(currentLeftStr.replace("px", "")) || 0;
        } else if (typeof currentLeftStr === "number") {
          currentLeft = currentLeftStr;
        } else {
          currentLeft = 0;
        }

        let newLeft = "0px";
        let newWidthVal = newWidth;

        if (currentLeft !== 0 && oldWidth > 0) {
          const ratioX = currentLeft / oldWidth;
          newLeft = `${Math.round(ratioX * newWidth)}px`;
          
          const currentWidth = parseFloat((item.details?.width || oldWidth).toString()) || oldWidth;
          const widthRatio = currentWidth / oldWidth;
          newWidthVal = Math.round(widthRatio * newWidth);
        } else {
          // If it was centered (left = 0, width = oldWidth), keep it centered/full-width
          newLeft = "0px";
          newWidthVal = newWidth;
        }
        
        payload[id] = {
          details: {
            ...(item.details || {}),
            top: newTop,
            left: newLeft,
            width: newWidthVal,
          }
        };
      }
    }

    if (Object.keys(payload).length > 0) {
      dispatch(EDIT_OBJECT, { payload });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
        <Label className="text-sm font-bold uppercase tracking-wide text-slate-700 mb-4 block">Video Orientation</Label>
        
        <div className="grid grid-cols-1 gap-3">
          <div>
            <input type="radio" name="orientation" value="portrait" id="portrait" className="peer sr-only" checked={value === "portrait"} onChange={() => handleSizeChange("portrait")} />
            <Label
              htmlFor="portrait"
              className="flex cursor-pointer flex-col items-center justify-between rounded-md border-2 border-slate-100 bg-white p-4 hover:bg-slate-50 hover:text-slate-900 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-600"
            >
              <Smartphone className="mb-2 h-6 w-6" />
              <span className="font-semibold text-xs">Portrait (9:16)</span>
              <span className="text-[10px] text-muted-foreground mt-1">1080 × 1920</span>
            </Label>
          </div>

          <div>
            <input type="radio" name="orientation" value="landscape" id="landscape" className="peer sr-only" checked={value === "landscape"} onChange={() => handleSizeChange("landscape")} />
            <Label
              htmlFor="landscape"
              className="flex cursor-pointer flex-col items-center justify-between rounded-md border-2 border-slate-100 bg-white p-4 hover:bg-slate-50 hover:text-slate-900 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-600"
            >
              <Monitor className="mb-2 h-6 w-6" />
              <span className="font-semibold text-xs">Landscape (16:9)</span>
              <span className="text-[10px] text-muted-foreground mt-1">1920 × 1080</span>
            </Label>
          </div>

          <div>
            <input type="radio" name="orientation" value="square" id="square" className="peer sr-only" checked={value === "square"} onChange={() => handleSizeChange("square")} />
            <Label
              htmlFor="square"
              className="flex cursor-pointer flex-col items-center justify-between rounded-md border-2 border-slate-100 bg-white p-4 hover:bg-slate-50 hover:text-slate-900 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-600"
            >
              <Square className="mb-2 h-6 w-6" />
              <span className="font-semibold text-xs">Square (1:1)</span>
              <span className="text-[10px] text-muted-foreground mt-1">1080 × 1080</span>
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}
