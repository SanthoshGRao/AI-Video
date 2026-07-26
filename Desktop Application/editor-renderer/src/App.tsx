import { useEffect, useRef, useState, type ReactNode } from "react";
import { useProjectStore } from "./store/useProjectStore";
import { TopNav } from "./components/TopNav";
import { AssetPanel } from "./components/AssetPanel";
import { CanvasStage } from "./components/CanvasStage";
import { Timeline } from "./components/Timeline";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ExportDialog } from "./components/ExportDialog";
import { PerfOverlay } from "./components/PerfOverlay";

function getProjectIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("projectId");
}

export default function App() {
  const {
    timeline,
    isLoading,
    error,
    isPlaying,
    playheadSec,
    setPlayhead,
    setPlaying,
    save,
    isDirty,
    snapshotLocal,
    recoveryAvailable,
    restoreRecovery,
    dismissRecovery,
  } = useProjectStore();
  const [exportOpen, setExportOpen] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    const projectId = getProjectIdFromUrl();
    if (projectId) void useProjectStore.getState().load(projectId);
  }, []);

  // Playback clock: advances the playhead while isPlaying, matching the
  // duration of the timeline. Video elements sync to playheadSec in
  // CanvasStage rather than driving it themselves.
  useEffect(() => {
    if (!isPlaying || !timeline) {
      lastTsRef.current = null;
      return;
    }
    const tick = (ts: number) => {
      if (lastTsRef.current !== null) {
        const dt = (ts - lastTsRef.current) / 1000;
        const next = playheadSec + dt;
        if (next >= timeline.durationSec) {
          setPlayhead(0);
          setPlaying(false);
        } else {
          setPlayhead(next);
        }
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, timeline]);

  // Autosave to the DB every 20s when dirty.
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirty) void save({ isAutosave: true });
    }, 20_000);
    return () => clearInterval(interval);
  }, [isDirty, save]);

  // Cheap local-disk-only recovery snapshot every 5s when dirty — a much
  // tighter safety net than the 20s DB autosave, since it doesn't need a
  // DB round trip and survives a crash between DB autosaves.
  useEffect(() => {
    const interval = setInterval(() => snapshotLocal(), 5_000);
    return () => clearInterval(interval);
  }, [snapshotLocal]);

  if (isLoading) {
    return <Centered>Loading project…</Centered>;
  }
  if (error) {
    return <Centered>Failed to load project: {error}</Centered>;
  }
  if (!timeline) {
    return <Centered>No project loaded.</Centered>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <TopNav onExportClick={() => setExportOpen(true)} />
      {recoveryAvailable && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 14px",
            background: "#3a2f14",
            borderBottom: "1px solid #5a4a1f",
            fontSize: 12,
            color: "#f0d090",
          }}
        >
          <span style={{ flex: 1 }}>
            Found unsaved changes from a previous session that weren&apos;t saved to the project. Restore them?
          </span>
          <button onClick={restoreRecovery} style={{ background: "#5a4a1f", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>
            Restore
          </button>
          <button onClick={dismissRecovery} style={{ background: "transparent", color: "#f0d090", border: "1px solid #5a4a1f", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>
            Discard
          </button>
        </div>
      )}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <AssetPanel />
        <CanvasStage />
        <PropertiesPanel />
      </div>
      <Timeline />
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
      {import.meta.env.DEV && <PerfOverlay />}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8a8a90", fontSize: 13 }}>
      {children}
    </div>
  );
}
