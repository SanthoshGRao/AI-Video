import useLayoutStore from "../store/use-layout-store";
import { Transitions } from "./transitions";
import { Audios } from "./audios";
import { Images } from "./images";
import { Videos } from "./videos";
import { Uploads } from "./uploads";
import { AiVoice } from "./ai-voice";
import { SFX } from "./sfx";
import { Layers } from "./layers";
import { LibraryPanel } from "./library";

const ActiveMenuItem = () => {
  const { activeMenuItem } = useLayoutStore();

  switch (activeMenuItem) {
    case "layers":
      return <Layers />;
    case "transitions":
      return <Transitions />;
    case "videos":
      return <Videos />;
    case "audio":
      return <Audios />;
    case "images":
      return <Images />;
    case "uploads":
      return <Uploads />;
    case "ai-voice":
      return <AiVoice />;
    case "sfx":
      return <SFX />;
    case "library":
      return <LibraryPanel />;
    default:
      return null;
  }
};

export const MenuItem = () => {
  return (
    <div className="flex h-full w-full flex-1 overflow-hidden rounded-r-2xl bg-[#f8fafc] shadow-[inset_-1px_0_0_rgba(15,23,42,0.06)]">
      <ActiveMenuItem />
    </div>
  );
};
