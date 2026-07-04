import React from "react";
import useStore from "../store/use-store";

export const useResizbleTimeline = () => {
  const [isResizing, setIsResizing] = React.useState(false);
  const timelineContainerRef = React.useRef<HTMLDivElement>(null);
  const [timelineHeight, setTimelineHeight] = React.useState(280);
  const { timeline } = useStore();

  const onMouseDown = (ev: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    const timelineEl = timelineContainerRef.current;
    if (!timelineEl) return;

    const { y } = timelineEl.getBoundingClientRect();
    const cursorPosition = ev.clientY - y;
    if (cursorPosition > 15 || cursorPosition < -15) return;
    setIsResizing(true);

    const startY = ev.clientY;
    const timelineHeight = timelineEl.offsetHeight;
    let currentHeight = 0;

    const onMouseMove = (ev: MouseEvent) => {
      const timelineEl = timelineContainerRef.current;
      if (!timelineEl) return;

      currentHeight = timelineHeight + startY - ev.clientY;

      if (currentHeight < 50 || currentHeight >= window.innerHeight * 0.5) {
        ev.preventDefault();
        return;
      }
      timelineEl.style.height = `${currentHeight}px`;
      timelineEl.style.borderTopColor = "#2B64EB";
      timelineEl.style.cursor = "row-resize";
      const containerHeight =
        (document.getElementById("playhead")?.clientHeight || 0) -
        (document.getElementById("playhead-handle")?.clientHeight || 0);
      timeline?.resize({
        height: containerHeight
      });
      setTimelineHeight(currentHeight);
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setIsResizing(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onMouseMove = (ev: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (isResizing) return;
    const timelineEl = timelineContainerRef.current;
    if (!timelineEl) return;

    const { y } = timelineEl.getBoundingClientRect();
    const cursorPosition = ev.clientY - y;

    if (cursorPosition <= 15 && cursorPosition >= -15) {
      timelineEl.style.cursor = "row-resize";
      timelineEl.style.borderTopColor = "#2B64EB";
    } else {
      timelineEl.style.borderTopColor = "transparent";
      timelineEl.style.cursor = "default";
    }
  };

  const onMouseOut = () => {
    if (isResizing) return;
    const timelineEl = timelineContainerRef.current;
    if (!timelineEl) return;

    timelineEl.style.borderTopColor = "transparent";
    timelineEl.style.cursor = "default";
  };

  React.useEffect(() => {
    const timelineEl = timelineContainerRef.current;
    if (!timelineEl) return;

    setTimelineHeight(timelineEl.clientHeight);
  }, []);

  return {
    timelineContainerRef,
    onMouseDown,
    onMouseMove,
    onMouseOut,
    timelineHeight
  };
};
