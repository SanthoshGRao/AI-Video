import { PlayerRef } from "@remotion/player";
import useStore from "../store/use-store";

export const useCurrentPlayerFrame = (
  ref: React.RefObject<PlayerRef> | null
) => {
  const currentTime = useStore((s) => s.currentTime);
  const fps = useStore((s) => s.fps);
  return Math.round((currentTime / 1000) * fps);
};
