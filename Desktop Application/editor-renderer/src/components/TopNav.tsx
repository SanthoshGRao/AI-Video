import type { CSSProperties } from "react";
import { useProjectStore } from "../store/useProjectStore";

export function TopNav({ onExportClick }: { onExportClick: () => void }) {
  const { projectTitle, isDirty, isSaving, save } = useProjectStore();

  return (
    <div
      style={
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          height: 44,
          background: "#151517",
          borderBottom: "1px solid #232326",
          WebkitAppRegion: "drag",
        } as CSSProperties
      }
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#e6e6e6" }}>{projectTitle || "Video Studio"}</div>
      <div style={{ display: "flex", gap: 8, WebkitAppRegion: "no-drag" } as CSSProperties}>
        <span style={{ fontSize: 12, color: "#8a8a90", alignSelf: "center" }}>
          {isSaving ? "Saving…" : isDirty ? "Unsaved changes" : "Saved"}
        </span>
        <button onClick={() => void save({ bumpVersion: false })} style={buttonStyle}>
          Save
        </button>
        <button onClick={onExportClick} style={{ ...buttonStyle, background: "#3a7bfd", color: "#fff" }}>
          Export
        </button>
        <button onClick={() => window.editorAPI.windowControls.minimize()} style={chromeButtonStyle}>
          –
        </button>
        <button onClick={() => window.editorAPI.windowControls.toggleMaximize()} style={chromeButtonStyle}>
          ▢
        </button>
        <button onClick={() => window.editorAPI.windowControls.close()} style={chromeButtonStyle}>
          ✕
        </button>
      </div>
    </div>
  );
}

const buttonStyle: CSSProperties = {
  background: "#232326",
  color: "#e6e6e6",
  border: "1px solid #2f2f33",
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 12,
  cursor: "pointer",
};

const chromeButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "transparent",
  border: "none",
  padding: "5px 10px",
};
