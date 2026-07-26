import { useProjectStore } from "../store/useProjectStore";

/**
 * PerfOverlay.tsx — dev-only performance HUD (original ask's "Profiling"
 * goal: preview FPS, frame latency, cache efficiency, memory). Only
 * rendered when `import.meta.env.DEV` (see App.tsx) — never shipped in a
 * packaged build.
 */
export function PerfOverlay() {
  const { previewStats, timeline, playheadSec } = useProjectStore();
  if (!previewStats) return null;

  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  const activeClipCount = timeline
    ? timeline.clips.filter((c) => c.startSec <= playheadSec && playheadSec < c.endSec).length
    : 0;

  return (
    <div
      style={{
        position: "fixed",
        top: 52,
        right: 12,
        zIndex: 200,
        background: "rgba(10,10,12,0.85)",
        border: "1px solid #2a2a2e",
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 11,
        fontFamily: "monospace",
        color: "#9ae6a0",
        pointerEvents: "none",
        lineHeight: 1.6,
        minWidth: 160,
      }}
    >
      <Row label="Preview FPS" value={previewStats.instantFps.toFixed(1)} />
      <Row label="Frame time" value={`${previewStats.lastRenderMs.toFixed(2)} ms`} />
      <Row label="Cache hit rate" value={`${(previewStats.cacheHitRate * 100).toFixed(0)}%`} />
      <Row label="Cached layers" value={String(previewStats.cachedLayers)} />
      <Row label="Active clips" value={String(activeClipCount)} />
      {memory && <Row label="JS heap" value={`${(memory.usedJSHeapSize / 1024 / 1024).toFixed(0)} MB`} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "#6a6a70" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
