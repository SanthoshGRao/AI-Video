import { useEffect, useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import type { LoadedMedia } from "../global";

export function AssetPanel() {
  const { media, timeline, playheadSec, addClipFromMedia } = useProjectStore();
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});

  const firstVideoTrackId = timeline?.tracks.find((t) => t.kind === "video")?.id;

  useEffect(() => {
    let cancelled = false;
    for (const m of media) {
      if (thumbnails[m.id] !== undefined) continue;
      void window.editorAPI.getThumbnail(m.id).then((url) => {
        if (!cancelled) setThumbnails((prev) => ({ ...prev, [m.id]: url }));
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media]);

  return (
    <div style={{ width: 220, borderRight: "1px solid #232326", background: "#0e0e10", overflowY: "auto", padding: 8 }}>
      <div style={{ fontSize: 11, color: "#8a8a90", textTransform: "uppercase", marginBottom: 8 }}>Media</div>
      {media.length === 0 && <div style={{ fontSize: 12, color: "#666" }}>No media in this project yet.</div>}
      {media.map((m) => (
        <AssetRow
          key={m.id}
          media={m}
          thumbnailUrl={thumbnails[m.id] ?? null}
          onClick={() => {
            if (!timeline) return;
            addClipFromMedia(m, firstVideoTrackId ?? "", playheadSec);
          }}
        />
      ))}
    </div>
  );
}

function AssetRow({ media, thumbnailUrl, onClick }: { media: LoadedMedia; thumbnailUrl: string | null; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: 6,
        marginBottom: 4,
        background: "#18181b",
        borderRadius: 6,
        cursor: "pointer",
      }}
      title="Click to add at playhead"
    >
      <div style={{ width: 48, height: 32, flexShrink: 0, borderRadius: 4, background: "#2a2a2e", overflow: "hidden" }}>
        {thumbnailUrl && (
          <img src={thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "#ddd" }}>
          {media.originalName}
        </div>
        <div style={{ fontSize: 10, color: "#777" }}>
          {media.type} {media.durationMs ? `· ${(media.durationMs / 1000).toFixed(1)}s` : ""}
        </div>
      </div>
    </div>
  );
}
