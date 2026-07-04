import { useEffect, useRef, useState } from "react";
import Header from "./header";
import Ruler from "./ruler";
import { timeMsToUnits, unitsToTimeMs } from "../utils/timeline";
import CanvasTimeline from "./items/timeline";
import useStore from "../store/use-store";
import Playhead from "./playhead";
import { useTheme } from "next-themes";
import { useCurrentPlayerFrame } from "../hooks/use-current-frame";
import {
  Audio,
  Image,
  Text,
  Video,
  Caption,
  Helper,
  Track,
  LinealAudioBars,
  RadialAudioBars,
  WaveAudioBars,
  HillAudioBars
} from "./items";
import StateManager from "@designcombo/state";
import {
  TIMELINE_OFFSET_CANVAS_LEFT,
  TIMELINE_OFFSET_CANVAS_RIGHT
} from "../constants/constants";
import PreviewTrackItem from "./items/preview-drag-item";
import { useTimelineOffsetX } from "../hooks/use-timeline-offset";
import { useStateManagerEvents } from "../hooks/use-state-manager-events";
import { useResizbleTimeline } from "../hooks/use-resizable-timeline";
import { TimelineTrackLabels } from "./timeline-track-labels";
import { useTimelineHotkeys } from "../hooks/use-timeline-hotkeys";
import { TIMELINE_SCALE_CHANGED } from "@designcombo/state";
import { dispatch } from "@designcombo/events";
import { getNextZoomLevel, getPreviousZoomLevel } from "../utils/timeline";

CanvasTimeline.registerItems({
  Text,
  Image,
  Audio,
  Video,
  Caption,
  Helper,
  Track,
  PreviewTrackItem,
  LinealAudioBars,
  RadialAudioBars,
  WaveAudioBars,
  HillAudioBars
});

const EMPTY_SIZE = { width: 0, height: 0 };
const Timeline = ({ stateManager }: { stateManager: StateManager }) => {
  useTimelineHotkeys();
  const [scrollLeft, setScrollLeft] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<CanvasTimeline | null>(null);
  const horizontalScrollbarVpRef = useRef<HTMLDivElement>(null);
  const { scale, fps, duration, timeline } = useStore();
  const currentFrame = useCurrentPlayerFrame(null);
  const [canvasSize, setCanvasSize] = useState(EMPTY_SIZE);
  const timelineOffsetX = useTimelineOffsetX();
  const {
    timelineContainerRef,
    timelineHeight,
    onMouseDown,
    onMouseMove,
    onMouseOut
  } = useResizbleTimeline();
  const { theme } = useTheme();

  const { setTimeline } = useStore();

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const nextScale = event.deltaY < 0 ? getNextZoomLevel(scale) : getPreviousZoomLevel(scale);
    dispatch(TIMELINE_SCALE_CHANGED, { payload: { scale: nextScale } });
  };

  // Use the extracted state manager events hook
  useStateManagerEvents(stateManager);

  useEffect(() => {
    const timeout = setTimeout(() => {
      timeline?.requestRenderAll();
    }, 5);
    return () => clearTimeout(timeout);
  }, [theme, timeline]);

  useEffect(() => {
    const canvasEl = canvasElRef.current;
    const horizontalScrollbar = horizontalScrollbarVpRef.current;

    if (!canvasEl || !horizontalScrollbar || !canvasEl.isConnected) return;
    const position = timeMsToUnits((currentFrame / fps) * 1000, scale.zoom);

    const canvasBoudingX =
      canvasEl.getBoundingClientRect().x + canvasEl.clientWidth;
    const playHeadPos = position - scrollLeft + 40;
    if (playHeadPos >= canvasBoudingX) {
      const scrollDivWidth = horizontalScrollbar.clientWidth;
      const totalScrollWidth = horizontalScrollbar.scrollWidth;
      const currentPosScroll = horizontalScrollbar.scrollLeft;
      const availableScroll =
        totalScrollWidth - (scrollDivWidth + currentPosScroll);
      const scaleScroll = availableScroll / scrollDivWidth;
      if (scaleScroll >= 0) {
        if (scaleScroll > 1)
          horizontalScrollbar.scrollTo({
            left: currentPosScroll + scrollDivWidth
          });
        else
          horizontalScrollbar.scrollTo({
            left: totalScrollWidth - scrollDivWidth
          });
      }
    }
  }, [currentFrame, fps, scale.zoom, scrollLeft]);

  const onResizeCanvas = (payload: { width: number; height: number }) => {
    setCanvasSize({
      width: payload.width,
      height: payload.height
    });
  };

  useEffect(() => {
    const canvasEl = canvasElRef.current;
    const timelineContainerEl = timelineContainerRef.current;

    if (!canvasEl || !timelineContainerEl) return;

    const containerWidth =
      (document.getElementById("timeline-header")?.clientWidth || 0) - 70;
    const containerHeight =
      (document.getElementById("playhead")?.clientHeight || 0) -
      (document.getElementById("playhead-handle")?.clientHeight || 0) -
      40;
    const canvas = new CanvasTimeline(canvasEl, {
      width: containerWidth,
      height: containerHeight,
      bounding: {
        width: containerWidth,
        height: 0
      },
      selectionColor: "rgba(0, 216, 214,0.1)",
      selectionBorderColor: "rgba(0, 216, 214,1.0)",
      onResizeCanvas,
      scale: scale,
      state: stateManager,
      duration,
      spacing: {
        left: TIMELINE_OFFSET_CANVAS_LEFT,
        right: TIMELINE_OFFSET_CANVAS_RIGHT
      },
      sizesMap: {
        caption: 32,
        text: 32,
        audio: 36,
        customTrack: 40,
        customTrack2: 40,
        linealAudioBars: 40,
        radialAudioBars: 40,
        waveAudioBars: 40,
        hillAudioBars: 40
      },
      itemTypes: [
        "text",
        "image",
        "audio",
        "video",
        "caption",
        "helper",
        "track",
        "composition",
        "template",
        "linealAudioBars",
        "radialAudioBars",
        "progressFrame",
        "progressBar",
        "waveAudioBars",
        "hillAudioBars"
      ],
      acceptsMap: {
        text: ["text"],
        image: ["image", "video"],
        video: ["video", "image"],
        audio: ["audio"],
        caption: ["caption"],
        template: ["template"],
        customTrack: ["video", "image"],
        customTrack2: ["video", "image"],
        main: ["video", "image"],
        linealAudioBars: ["audio", "linealAudioBars"],
        radialAudioBars: ["audio", "radialAudioBars"],
        waveAudioBars: ["audio", "waveAudioBars"],
        hillAudioBars: ["audio", "hillAudioBars"]
      },
      guideLineColor: "#ffffff"
    });

    canvas.initScrollbars({
      offsetX: 16,
      offsetY: 0,
      extraMarginX: 50,
      extraMarginY: 0,
      scrollbarWidth: 8,
      scrollbarColor: "rgba(255, 255, 255, 1)"
    });

    canvas.onViewportChange((left: number) => {
      setScrollLeft(left + 16);
    });

    canvasRef.current = canvas;

    setCanvasSize({ width: containerWidth, height: containerHeight });
    setTimeline(canvas);

    return () => {
      canvas.purge();
    };
  }, []);

  const onClickRuler = (units: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const time = unitsToTimeMs(units, scale.zoom);
    useStore.getState().setCurrentTime(time);
  };

  const onRulerScroll = (newScrollLeft: number) => {
    // Update the timeline canvas scroll position


    const canvas = canvasRef.current;
    if (canvas) {
      canvas.scrollTo({ scrollLeft: newScrollLeft });
    }

    // Update the horizontal scrollbar position
    if (horizontalScrollbarVpRef.current) {
      horizontalScrollbarVpRef.current.scrollLeft = newScrollLeft;
    }

    // Update the local scroll state
    setScrollLeft(newScrollLeft);
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    canvasRef.current.setScale(scale);
    canvasRef.current.requestRenderAll();
  }, [scale]);

  return (
    <div
      ref={timelineContainerRef}
      id="timeline-container"
      className="relative flex w-full flex-col overflow-hidden bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.06)]"
      style={{
        height: `${timelineHeight}px`,
        minHeight: 220,
        borderTopWidth: "1px",
        borderTopStyle: "solid",
        borderTopColor: "transparent"
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseOut={onMouseOut}
      onWheel={handleWheel}
    >
      <Header />
      <Ruler
        onClick={onClickRuler}
        scrollLeft={scrollLeft}
        onScroll={onRulerScroll}
      />
      <Playhead scrollLeft={scrollLeft} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <TimelineTrackLabels
          height={canvasSize.height}
          offsetX={timelineOffsetX}
        />
        <div
          style={{ height: canvasSize.height }}
          className="relative min-w-0 flex-1 overflow-hidden"
        >
          <div
            style={{ height: canvasSize.height }}
            ref={containerRef}
            className="absolute top-0 w-full"
            data-timeline-drop-zone="true"
          >
            <canvas id="designcombo-timeline-canvas" ref={canvasElRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Timeline;
