import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useProjectStore } from "../store/useProjectStore";

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { projectId, timeline, subtitleTrackId } = useProjectStore();
  const [format, setFormat] = useState<"mp4" | "mov" | "webm">("mp4");
  const [resolution, setResolution] = useState("1080p");
  const [subtitleBurnIn, setSubtitleBurnIn] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "rendering" | "done" | "failed">("idle");
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const unsubscribe = window.editorAPI.onExportProgress((id, pct) => {
      if (id !== jobId) return;
      setProgress(pct);
    });
    const interval = setInterval(async () => {
      const s = await window.editorAPI.exportStatus(jobId);
      if (!s) return;
      if (s.status === "DONE") {
        setStatus("done");
        setResultPath(s.downloadUrl);
        clearInterval(interval);
      } else if (s.status === "FAILED") {
        setStatus("failed");
        setErrorMessage(s.errorMessage);
        clearInterval(interval);
      }
    }, 1000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [jobId]);

  if (!timeline || !projectId) return null;

  const startExport = async () => {
    setStatus("rendering");
    setProgress(0);
    const { jobId: id } = await window.editorAPI.exportStart({
      projectId,
      format,
      aspectRatio: `${timeline.width}:${timeline.height}`,
      resolution,
      subtitleBurnIn,
      subtitleTrackId: subtitleTrackId ?? undefined,
      project: timeline,
    });
    setJobId(id);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 360, background: "#151517", border: "1px solid #232326", borderRadius: 10, padding: 16 }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#eee" }}>Export</div>

        {status === "idle" && (
          <>
            <Row label="Format">
              <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} style={selectStyle}>
                <option value="mp4">MP4</option>
                <option value="mov">MOV</option>
                <option value="webm">WebM</option>
              </select>
            </Row>
            <Row label="Resolution">
              <select value={resolution} onChange={(e) => setResolution(e.target.value)} style={selectStyle}>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="1440p">1440p</option>
                <option value="2160p">2160p (4K)</option>
              </select>
            </Row>
            <Row label="Burn in subtitles">
              <input type="checkbox" checked={subtitleBurnIn} onChange={(e) => setSubtitleBurnIn(e.target.checked)} />
            </Row>
            <button onClick={() => void startExport()} style={primaryButtonStyle}>
              Start export
            </button>
          </>
        )}

        {status === "rendering" && (
          <>
            <div style={{ fontSize: 12, color: "#8a8a90", marginBottom: 8 }}>Rendering… {progress.toFixed(0)}%</div>
            <div style={{ height: 8, background: "#232326", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "#3a7bfd" }} />
            </div>
            <button
              onClick={async () => {
                if (jobId) await window.editorAPI.exportCancel(jobId);
                setStatus("idle");
              }}
              style={{ ...primaryButtonStyle, background: "#3a2626" }}
            >
              Cancel
            </button>
          </>
        )}

        {status === "done" && (
          <>
            <div style={{ fontSize: 12, color: "#4ade80", marginBottom: 8 }}>Export complete.</div>
            <div style={{ fontSize: 11, color: "#8a8a90", wordBreak: "break-all", marginBottom: 12 }}>{resultPath}</div>
            <button onClick={onClose} style={primaryButtonStyle}>
              Done
            </button>
          </>
        )}

        {status === "failed" && (
          <>
            <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>Export failed.</div>
            <div style={{ fontSize: 11, color: "#8a8a90", marginBottom: 12 }}>{errorMessage}</div>
            <button onClick={() => setStatus("idle")} style={primaryButtonStyle}>
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: "#ccc" }}>{label}</span>
      {children}
    </div>
  );
}

const selectStyle: CSSProperties = {
  background: "#18181b",
  border: "1px solid #2a2a2e",
  borderRadius: 4,
  color: "#eee",
  padding: "4px 8px",
  fontSize: 12,
};

const primaryButtonStyle: CSSProperties = {
  width: "100%",
  background: "#3a7bfd",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "8px 0",
  fontSize: 13,
  cursor: "pointer",
};
