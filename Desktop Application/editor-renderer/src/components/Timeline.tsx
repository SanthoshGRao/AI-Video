import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useProjectStore } from "../store/useProjectStore";
import type { NativeClip, NativeTransition } from "../../../src/editor/model/types";
import { filterVisibleClips, type Viewport } from "../lib/virtualization";

const PX_PER_SEC = 60;
const TRACK_HEIGHT = 44;

/** How close two clips must be to count as "a cut" a transition can be
 * added to — small enough to not offer one across a deliberate gap. */
const ADJACENCY_EPS_SEC = 0.05;

const TRANSITION_HANDLE_SIZE = 16;

const TRACK_COLORS: Record<string, string> = {
  video: "#2d5f8a",
  image: "#2d5f8a",
  audio: "#3a7d5c",
  voiceover: "#3a7d5c",
  text: "#8a5f2d",
  subtitle: "#8a5f2d",
  overlay: "#6a4a8a",
};

type DragMode = "move" | "trim-start" | "trim-end";

export function Timeline() {
  const {
    timeline,
    selectedClipId,
    selectClip,
    updateClip,
    playheadSec,
    setPlayhead,
    isPlaying,
    setPlaying,
    selectedTransitionId,
    selectTransition,
    addTransition,
    removeTransition,
  } = useProjectStore();
  const dragState = useRef<{ clip: NativeClip; mode: DragMode; startX: number; origStart: number; origEnd: number } | null>(
    null
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ startPx: 0, endPx: 1200 });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewport({ startPx: el.scrollLeft, endPx: el.scrollLeft + el.clientWidth });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      resizeObserver.disconnect();
    };
  }, []);

  const onClipMouseDown = useCallback(
    (e: ReactMouseEvent, clip: NativeClip, mode: DragMode) => {
      e.stopPropagation();
      selectClip(clip.id);
      dragState.current = { clip, mode, startX: e.clientX, origStart: clip.startSec, origEnd: clip.endSec };

      const onMove = (ev: MouseEvent) => {
        const drag = dragState.current;
        if (!drag) return;
        const deltaSec = (ev.clientX - drag.startX) / PX_PER_SEC;
        if (drag.mode === "move") {
          const duration = drag.origEnd - drag.origStart;
          const newStart = Math.max(0, drag.origStart + deltaSec);
          updateClip(drag.clip.id, { startSec: newStart, endSec: newStart + duration });
        } else if (drag.mode === "trim-start") {
          const newStart = Math.min(drag.origEnd - 0.1, Math.max(0, drag.origStart + deltaSec));
          const mediaInDelta = newStart - drag.origStart;
          updateClip(drag.clip.id, {
            startSec: newStart,
            mediaInSec: Math.max(0, (drag.clip.mediaInSec ?? 0) + mediaInDelta),
          });
        } else {
          const newEnd = Math.max(drag.origStart + 0.1, drag.origEnd + deltaSec);
          updateClip(drag.clip.id, { endSec: newEnd });
        }
      };
      const onUp = () => {
        dragState.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [selectClip, updateClip]
  );

  if (!timeline) return null;

  const totalWidth = Math.max(800, timeline.durationSec * PX_PER_SEC + 200);
  const tracks = [...timeline.tracks].sort((a, b) => b.order - a.order);

  return (
    <div style={{ height: 220, background: "#111113", borderTop: "1px solid #232326", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid #1c1c1f" }}>
        <button onClick={() => setPlaying(!isPlaying)} style={{ background: "#232326", color: "#eee", border: "none", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <span style={{ fontSize: 12, color: "#8a8a90", fontVariantNumeric: "tabular-nums" }}>
          {playheadSec.toFixed(2)}s / {timeline.durationSec.toFixed(2)}s
        </span>
      </div>
      <div
        ref={scrollRef}
        style={{ flex: 1, overflow: "auto", position: "relative" }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const sec = (e.clientX - rect.left + e.currentTarget.scrollLeft) / PX_PER_SEC;
          setPlayhead(sec);
        }}
      >
        <div style={{ position: "relative", width: totalWidth }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: playheadSec * PX_PER_SEC,
              width: 2,
              background: "#3a7bfd",
              zIndex: 10,
              pointerEvents: "none",
            }}
          />
          {tracks.map((track) => (
            <div key={track.id} style={{ height: TRACK_HEIGHT, borderBottom: "1px solid #1c1c1f", position: "relative" }}>
              {filterVisibleClips(
                timeline.clips.filter((c) => c.trackId === track.id),
                PX_PER_SEC,
                viewport
              ).map((clip) => (
                  <div
                    key={clip.id}
                    onMouseDown={(e) => onClipMouseDown(e, clip, "move")}
                    style={{
                      position: "absolute",
                      left: clip.startSec * PX_PER_SEC,
                      width: Math.max(4, (clip.endSec - clip.startSec) * PX_PER_SEC),
                      top: 3,
                      bottom: 3,
                      background: TRACK_COLORS[track.kind] ?? "#444",
                      border: clip.id === selectedClipId ? "2px solid #fff" : "1px solid rgba(0,0,0,0.3)",
                      borderRadius: 4,
                      cursor: "grab",
                      display: "flex",
                      alignItems: "center",
                      overflow: "hidden",
                      fontSize: 11,
                      color: "#fff",
                      padding: "0 4px",
                    }}
                  >
                    <div
                      onMouseDown={(e) => onClipMouseDown(e, clip, "trim-start")}
                      style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, cursor: "ew-resize" }}
                    />
                    <span style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
                      {clip.text?.content ?? clip.kind}
                    </span>
                    <div
                      onMouseDown={(e) => onClipMouseDown(e, clip, "trim-end")}
                      style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "ew-resize" }}
                    />
                  </div>
                ))}
              <TransitionHandles
                clips={timeline.clips.filter((c) => c.trackId === track.id)}
                transitions={timeline.transitions}
                selectedTransitionId={selectedTransitionId}
                onAdd={addTransition}
                onSelect={selectTransition}
                onRemove={removeTransition}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TRANSITIONABLE_KINDS = new Set<NativeClip["kind"]>(["video", "image"]);

/** Renders a small handle at each cut between two adjacent video/image
 * clips on this track: a "+" to add a transition where none exists yet, or
 * a filled dot (click to remove) where one already does. Adding pulls the
 * incoming clip back by the transition's duration so the two genuinely
 * overlap — see addTransition() in useProjectStore.ts. */
function TransitionHandles({
  clips,
  transitions,
  selectedTransitionId,
  onAdd,
  onSelect,
  onRemove,
}: {
  clips: NativeClip[];
  transitions: NativeTransition[];
  selectedTransitionId: string | null;
  onAdd: (fromClipId: string, toClipId: string) => void;
  onSelect: (id: string | null) => void;
  onRemove: (id: string) => void;
}) {
  const sorted = clips.filter((c) => TRANSITIONABLE_KINDS.has(c.kind)).sort((a, b) => a.startSec - b.startSec);
  const transitionByPair = new Map(transitions.map((tr) => [`${tr.fromClipId}->${tr.toClipId}`, tr]));

  const handles = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const existing = transitionByPair.get(`${a.id}->${b.id}`);
    // Adjacent (a plain cut) if the clips touch, or already overlap by
    // exactly an existing transition's duration.
    const gap = b.startSec - a.endSec;
    if (!existing && Math.abs(gap) > ADJACENCY_EPS_SEC) continue;
    if (existing && Math.abs(gap + existing.durationSec) > ADJACENCY_EPS_SEC) continue;

    const selected = existing?.id === selectedTransitionId;
    handles.push(
      <div
        key={`${a.id}-${b.id}`}
        title={existing ? `${existing.type} transition (${existing.durationSec.toFixed(1)}s) — click to remove` : "Add transition"}
        onClick={(e) => {
          e.stopPropagation();
          if (existing) {
            selected ? onRemove(existing.id) : onSelect(existing.id);
          } else {
            onAdd(a.id, b.id);
          }
        }}
        style={{
          position: "absolute",
          left: a.endSec * PX_PER_SEC - TRANSITION_HANDLE_SIZE / 2,
          top: "50%",
          transform: "translateY(-50%)",
          width: TRANSITION_HANDLE_SIZE,
          height: TRANSITION_HANDLE_SIZE,
          borderRadius: "50%",
          background: existing ? (selected ? "#3a7bfd" : "#c98a2d") : "#232326",
          border: "1px solid rgba(255,255,255,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          lineHeight: 1,
          color: "#fff",
          cursor: "pointer",
          zIndex: 5,
        }}
      >
        {existing ? "◆" : "+"}
      </div>
    );
  }
  return <>{handles}</>;
}
