import type { CSSProperties, ReactNode } from "react";
import { useProjectStore } from "../store/useProjectStore";
import type { EffectInstance } from "../../../src/editor/model/types";

type PresetId = Extract<EffectInstance, { type: "preset" }>["id"];

const PRESETS: PresetId[] = ["grayscale", "sepia", "vintage", "vivid", "cool", "warm", "invert"];

export function PropertiesPanel() {
  const { timeline, selectedClipId, updateClip } = useProjectStore();
  const clip = timeline?.clips.find((c) => c.id === selectedClipId);

  if (!clip) {
    return (
      <div style={{ width: 260, borderLeft: "1px solid #232326", background: "#0e0e10", padding: 12 }}>
        <div style={{ fontSize: 12, color: "#666" }}>Select a clip to edit its properties.</div>
      </div>
    );
  }

  const t = clip.transform;
  const currentPreset = clip.effects.find((e) => e.type === "preset");

  return (
    <div style={{ width: 260, borderLeft: "1px solid #232326", background: "#0e0e10", padding: 12, overflowY: "auto" }}>
      <div style={{ fontSize: 11, color: "#8a8a90", textTransform: "uppercase", marginBottom: 8 }}>
        {clip.kind} clip
      </div>

      {t && (
        <>
          <Field label="X">
            <Num value={t.x} onChange={(v) => updateClip(clip.id, { transform: { ...t, x: v } })} />
          </Field>
          <Field label="Y">
            <Num value={t.y} onChange={(v) => updateClip(clip.id, { transform: { ...t, y: v } })} />
          </Field>
          <Field label="Width">
            <Num value={t.w} onChange={(v) => updateClip(clip.id, { transform: { ...t, w: v } })} />
          </Field>
          <Field label="Height">
            <Num value={t.h} onChange={(v) => updateClip(clip.id, { transform: { ...t, h: v } })} />
          </Field>
          <Field label="Rotation">
            <Num value={t.rotationDeg} onChange={(v) => updateClip(clip.id, { transform: { ...t, rotationDeg: v } })} />
          </Field>
          <Field label="Opacity">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={t.opacity}
              onChange={(e) => updateClip(clip.id, { transform: { ...t, opacity: Number(e.target.value) } })}
              style={{ width: "100%" }}
            />
          </Field>
        </>
      )}

      {(clip.kind === "video" || clip.kind === "image") && (
        <Field label="Effect">
          <select
            value={currentPreset?.type === "preset" ? currentPreset.id : ""}
            onChange={(e) => {
              const value = e.target.value as PresetId | "";
              // Explicit annotation needed: TS 5.5+ infers a narrowed type
              // predicate for this filter callback that would otherwise
              // exclude the "preset" variant from the array's element type.
              const effects: EffectInstance[] = clip.effects.filter((ef) => ef.type !== "preset");
              if (value) effects.push({ type: "preset", id: value });
              updateClip(clip.id, { effects });
            }}
            style={selectStyle}
          >
            <option value="">None</option>
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      )}

      {clip.text && (
        <>
          <Field label="Text">
            <textarea
              value={clip.text.content}
              onChange={(e) => updateClip(clip.id, { text: { ...clip.text!, content: e.target.value } })}
              style={{ ...inputStyle, height: 60, resize: "vertical" }}
            />
          </Field>
          <Field label="Font size">
            <Num
              value={(clip.text.style?.fontSize as number) ?? 32}
              onChange={(v) =>
                updateClip(clip.id, { text: { ...clip.text!, style: { ...clip.text!.style, fontSize: v } } })
              }
            />
          </Field>
          <Field label="Color">
            <input
              type="color"
              value={(clip.text.style?.color as string) ?? "#ffffff"}
              onChange={(e) =>
                updateClip(clip.id, { text: { ...clip.text!, style: { ...clip.text!.style, color: e.target.value } } })
              }
            />
          </Field>
        </>
      )}

      {clip.audio && (
        <Field label="Volume">
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={clip.audio.volume}
            onChange={(e) => updateClip(clip.id, { audio: { ...clip.audio!, volume: Number(e.target.value) } })}
            style={{ width: "100%" }}
          />
        </Field>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "#8a8a90", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Num({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Number(e.target.value))}
      style={inputStyle}
    />
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  background: "#18181b",
  border: "1px solid #2a2a2e",
  borderRadius: 4,
  color: "#eee",
  padding: "5px 7px",
  fontSize: 12,
  boxSizing: "border-box",
};

const selectStyle: CSSProperties = { ...inputStyle };
