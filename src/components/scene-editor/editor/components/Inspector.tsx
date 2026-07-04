/**
 * Inspector — context-sensitive property editor for the selected clip.
 * All controls directly mutate the store via updateClip which deep-merges
 * nested objects (style, filter) so individual property changes work correctly.
 */
import { useMemo } from "react";
import { Trash2, Copy } from "lucide-react";
import { useEditorStore } from "../store";
import type { Clip, FactClip, MediaClip, SubtitleClip, TextClip, AudioClip } from "../schema";

export function Inspector() {
  const timeline = useEditorStore((s) => s.timeline);
  const selectedId = useEditorStore((s) => s.selectedClipIds[0]);
  const clip = timeline?.clips.find((c) => c.id === selectedId) ?? null;
  const deleteClips = useEditorStore((s) => s.deleteClips);
  const duplicateClips = useEditorStore((s) => s.duplicateClips);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  return (
    <aside className="flex w-80 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
        Inspector
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {!clip ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Select a clip to edit its properties.</p>
            <div className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500 space-y-1">
              <p className="font-medium text-slate-700">Keyboard Shortcuts</p>
              <div className="flex justify-between"><span>Play/Pause</span><span className="font-mono">Space</span></div>
              <div className="flex justify-between"><span>Undo</span><span className="font-mono">Ctrl+Z</span></div>
              <div className="flex justify-between"><span>Redo</span><span className="font-mono">Ctrl+Shift+Z</span></div>
              <div className="flex justify-between"><span>Delete</span><span className="font-mono">Delete</span></div>
              <div className="flex justify-between"><span>Duplicate</span><span className="font-mono">Ctrl+D</span></div>
              <div className="flex justify-between"><span>Split</span><span className="font-mono">S</span></div>
              <div className="flex justify-between"><span>Zoom +/-</span><span className="font-mono">+/-</span></div>
            </div>
          </div>
        ) : (
          <ClipInspector
            clip={clip}
            onDelete={() => {
              deleteClips([clip.id]);
              clearSelection();
            }}
            onDuplicate={() => duplicateClips([clip.id])}
          />
        )}
      </div>
    </aside>
  );
}

function ClipInspector({
  clip,
  onDelete,
  onDuplicate,
}: {
  clip: Clip;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Clip type badge + actions */}
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          {clip.kind === "media" ? (clip as MediaClip).mediaKind : clip.kind}
        </span>
        <div className="flex gap-1">
          <button
            onClick={onDuplicate}
            className="rounded-md p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
            title="Duplicate clip"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            title="Delete clip"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Section title="Timing">
        <CommonTimingControls clip={clip} />
      </Section>

      {clip.kind === "media" && <MediaControls clip={clip as MediaClip} />}
      {clip.kind === "text" && <TextControls clip={clip as TextClip} />}
      {clip.kind === "fact" && <FactControls clip={clip as FactClip} />}
      {clip.kind === "subtitle" && <SubtitleControls clip={clip as SubtitleClip} />}
      {clip.kind === "audio" && <AudioControls clip={clip as AudioClip} />}

      {(clip.kind === "media" || clip.kind === "text" || clip.kind === "fact") && (
        <Section title="Transitions">
          <TransitionControls clip={clip} />
        </Section>
      )}

      <Section title="Keyframes">
        <KeyframeControls clip={clip} />
      </Section>

      {/* Visibility and Lock */}
      <Section title="Clip Options">
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={clip.hidden}
              onChange={(e) => useEditorStore.getState().updateClip(clip.id, { hidden: e.target.checked })}
              className="accent-indigo-600"
            />
            Hidden
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={clip.locked}
              onChange={(e) => useEditorStore.getState().updateClip(clip.id, { locked: e.target.checked })}
              className="accent-indigo-600"
            />
            Locked
          </label>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-700">
      <span className="w-24 truncate text-slate-500">{label}</span>
      <div className="flex-1">{children}</div>
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={Number(value.toFixed(3))}
      onChange={(e) => onChange(Number(e.target.value))}
      step={step}
      min={min}
      max={max}
      className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
    />
  );
}

function RangeRow({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-indigo-600"
        />
        <span className="w-10 text-right font-mono text-[10px] text-slate-400">
          {value.toFixed(step >= 1 ? 0 : 2)}{suffix ?? ""}
        </span>
      </div>
    </Row>
  );
}

function CommonTimingControls({ clip }: { clip: Clip }) {
  const update = useEditorStore((s) => s.updateClip);
  return (
    <>
      <Row label="Start (s)">
        <NumberInput value={clip.start} onChange={(v) => update(clip.id, { start: Math.max(0, v) })} />
      </Row>
      <Row label="Duration (s)">
        <NumberInput
          value={clip.duration}
          min={0.05}
          onChange={(v) => update(clip.id, { duration: Math.max(0.05, v) })}
        />
      </Row>
    </>
  );
}

/* ====== MEDIA ====== */
function MediaControls({ clip }: { clip: MediaClip }) {
  const update = useEditorStore((s) => s.updateClip);
  return (
    <>
      <Section title="Transform">
        <RangeRow label="Opacity" value={clip.opacity} onChange={(v) => update(clip.id, { opacity: v })} />
        <Row label="Rotation (°)">
          <NumberInput value={clip.rotation} onChange={(v) => update(clip.id, { rotation: v })} step={1} />
        </Row>
        <Row label="Speed">
          <NumberInput value={clip.speed} min={0.1} step={0.1} onChange={(v) => update(clip.id, { speed: Math.max(0.1, v) })} />
        </Row>
        {clip.mediaKind === "video" && (
          <RangeRow label="Volume" value={clip.volume} max={2} onChange={(v) => update(clip.id, { volume: v })} />
        )}
      </Section>
      <Section title="Color / Filter">
        <Row label="Preset">
          <select
            value={clip.filter.preset}
            onChange={(e) => update(clip.id, { filter: { preset: e.target.value } } as any)}
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
          >
            {["none", "vintage", "bw", "warm", "cool"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Row>
        <RangeRow
          label="Brightness"
          value={clip.filter.brightness}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => update(clip.id, { filter: { brightness: v } } as any)}
        />
        <RangeRow
          label="Contrast"
          value={clip.filter.contrast}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => update(clip.id, { filter: { contrast: v } } as any)}
        />
        <RangeRow
          label="Saturation"
          value={clip.filter.saturation}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => update(clip.id, { filter: { saturation: v } } as any)}
        />
      </Section>
    </>
  );
}

/* ====== TEXT ====== */
function TextControls({ clip }: { clip: TextClip }) {
  const update = useEditorStore((s) => s.updateClip);
  return (
    <Section title="Text Properties">
      <Row label="Content">
        <textarea
          value={clip.text}
          onChange={(e) => update(clip.id, { text: e.target.value })}
          rows={3}
          className="w-full resize-none rounded border border-slate-200 p-2 text-xs outline-none focus:border-indigo-400"
        />
      </Row>
      <Row label="Font Family">
        <select
          value={clip.style.fontFamily}
          onChange={(e) => update(clip.id, { style: { fontFamily: e.target.value } } as any)}
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
        >
          {["Inter", "Roboto", "Poppins", "Montserrat", "Playfair Display", "Arial", "Georgia", "Courier New"].map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </Row>
      <Row label="Font Size">
        <NumberInput value={clip.style.fontSize} step={1} min={8} max={200} onChange={(v) => update(clip.id, { style: { fontSize: v } } as any)} />
      </Row>
      <Row label="Weight">
        <select
          value={clip.style.fontWeight}
          onChange={(e) => update(clip.id, { style: { fontWeight: Number(e.target.value) } } as any)}
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
        >
          {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
            <option key={w} value={w}>{w}{w === 400 ? " (Normal)" : w === 700 ? " (Bold)" : ""}</option>
          ))}
        </select>
      </Row>
      <Row label="Color">
        <input
          type="color"
          value={clip.style.color}
          onChange={(e) => update(clip.id, { style: { color: e.target.value } } as any)}
          className="h-7 w-full rounded border border-slate-200 cursor-pointer"
        />
      </Row>
      <Row label="Align">
        <div className="flex rounded-md border border-slate-200 overflow-hidden">
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              onClick={() => update(clip.id, { style: { align: a } } as any)}
              className={`flex-1 px-2 py-1 text-[11px] capitalize ${
                clip.style.align === a
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Background">
        <input
          type="color"
          value={clip.style.background ?? "#000000"}
          onChange={(e) => update(clip.id, { style: { background: e.target.value } } as any)}
          className="h-7 w-full rounded border border-slate-200 cursor-pointer"
        />
      </Row>
      <Row label="Shadow">
        <input
          type="checkbox"
          checked={clip.style.shadow}
          onChange={(e) => update(clip.id, { style: { shadow: e.target.checked } } as any)}
          className="accent-indigo-600"
        />
      </Row>
      <Row label="Stroke Width">
        <NumberInput
          value={clip.style.strokeWidth}
          step={1}
          min={0}
          max={20}
          onChange={(v) => update(clip.id, { style: { strokeWidth: v } } as any)}
        />
      </Row>
      <RangeRow
        label="X Position"
        value={clip.style.x}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => update(clip.id, { style: { x: v } } as any)}
      />
      <RangeRow
        label="Y Position"
        value={clip.style.y}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => update(clip.id, { style: { y: v } } as any)}
      />
      <Row label="Animation">
        <select
          value={clip.animation}
          onChange={(e) => update(clip.id, { animation: e.target.value })}
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
        >
          {["none", "fade", "slide-up", "pop", "typewriter"].map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </Row>
    </Section>
  );
}

/* ====== FACT ====== */
function FactControls({ clip }: { clip: FactClip }) {
  const update = useEditorStore((s) => s.updateClip);
  return (
    <Section title="Fact Overlay">
      <Row label="Key">
        <input
          value={clip.factKey}
          onChange={(e) => update(clip.id, { factKey: e.target.value })}
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
        />
      </Row>
      <Row label="Text">
        <input
          value={clip.text}
          onChange={(e) => update(clip.id, { text: e.target.value })}
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
        />
      </Row>
      <Row label="Font Size">
        <NumberInput value={clip.style.fontSize} step={1} onChange={(v) => update(clip.id, { style: { fontSize: v } } as any)} />
      </Row>
      <Row label="Color">
        <input
          type="color"
          value={clip.style.color}
          onChange={(e) => update(clip.id, { style: { color: e.target.value } } as any)}
          className="h-7 w-full rounded border border-slate-200 cursor-pointer"
        />
      </Row>
      <Row label="Background">
        <input
          type="color"
          value={clip.style.background ?? "#000000"}
          onChange={(e) => update(clip.id, { style: { background: e.target.value } } as any)}
          className="h-7 w-full rounded border border-slate-200 cursor-pointer"
        />
      </Row>
      <RangeRow
        label="Y Position"
        value={clip.style.y}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => update(clip.id, { style: { y: v } } as any)}
      />
      <Row label="Animation">
        <select
          value={clip.animation}
          onChange={(e) => update(clip.id, { animation: e.target.value })}
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
        >
          {["none", "fade", "slide-up", "pop", "typewriter"].map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </Row>
    </Section>
  );
}

/* ====== SUBTITLE ====== */
function SubtitleControls({ clip }: { clip: SubtitleClip }) {
  const update = useEditorStore((s) => s.updateClip);
  return (
    <Section title="Subtitle">
      <Row label="Text">
        <textarea
          value={clip.text}
          onChange={(e) => update(clip.id, { text: e.target.value })}
          rows={2}
          className="w-full resize-none rounded border border-slate-200 p-2 text-xs outline-none focus:border-indigo-400"
        />
      </Row>
      <Row label="Style Preset">
        <select
          value={clip.preset}
          onChange={(e) => update(clip.id, { preset: e.target.value })}
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
        >
          {["modern", "instagram", "reels", "luxury", "minimal"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </Row>
    </Section>
  );
}

/* ====== AUDIO ====== */
function AudioControls({ clip }: { clip: AudioClip }) {
  const update = useEditorStore((s) => s.updateClip);
  return (
    <Section title="Audio">
      <Row label="Role">
        <select
          value={clip.role}
          onChange={(e) => update(clip.id, { role: e.target.value })}
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
        >
          {["voiceover", "music", "sfx"].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Row>
      <RangeRow label="Volume" value={clip.volume} max={2} onChange={(v) => update(clip.id, { volume: v })} />
      <Row label="Fade In (s)">
        <NumberInput value={clip.fadeIn} min={0} onChange={(v) => update(clip.id, { fadeIn: v })} />
      </Row>
      <Row label="Fade Out (s)">
        <NumberInput value={clip.fadeOut} min={0} onChange={(v) => update(clip.id, { fadeOut: v })} />
      </Row>
    </Section>
  );
}

/* ====== TRANSITIONS ====== */
function TransitionControls({ clip }: { clip: Clip }) {
  const update = useEditorStore((s) => s.updateClip);
  const tIn = clip.transitionIn;
  const tOut = clip.transitionOut;
  return (
    <>
      <Row label="In">
        <select
          value={tIn?.kind ?? "none"}
          onChange={(e) =>
            update(clip.id, {
              transitionIn:
                e.target.value === "none"
                  ? undefined
                  : { kind: e.target.value as any, duration: tIn?.duration ?? 0.4 },
            } as Partial<Clip>)
          }
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
        >
          {["none", "fade", "crossfade", "slide", "wipe", "zoom"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </Row>
      {tIn && (
        <Row label="In Duration">
          <NumberInput
            value={tIn.duration}
            min={0}
            onChange={(v) =>
              update(clip.id, { transitionIn: { kind: tIn.kind, duration: v } } as Partial<Clip>)
            }
          />
        </Row>
      )}
      <Row label="Out">
        <select
          value={tOut?.kind ?? "none"}
          onChange={(e) =>
            update(clip.id, {
              transitionOut:
                e.target.value === "none"
                  ? undefined
                  : { kind: e.target.value as any, duration: tOut?.duration ?? 0.4 },
            } as Partial<Clip>)
          }
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
        >
          {["none", "fade", "crossfade", "slide", "wipe", "zoom"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </Row>
      {tOut && (
        <Row label="Out Duration">
          <NumberInput
            value={tOut.duration}
            min={0}
            onChange={(v) =>
              update(clip.id, { transitionOut: { kind: tOut.kind, duration: v } } as Partial<Clip>)
            }
          />
        </Row>
      )}
    </>
  );
}

/* ====== KEYFRAMES ====== */
const PROPS = ["x", "y", "scale", "rotation", "opacity"] as const;
function KeyframeControls({ clip }: { clip: Clip }) {
  const currentTime = useEditorStore((s) => s.currentTime);
  const add = useEditorStore((s) => s.addKeyframe);
  const remove = useEditorStore((s) => s.removeKeyframe);
  const local = currentTime - clip.start;
  const within = local >= 0 && local <= clip.duration;
  return (
    <div className="space-y-1">
      {PROPS.map((p) => {
        const arr = clip.keyframes[p];
        const fallback = p === "scale" || p === "opacity" ? 1 : 0;
        return (
          <div key={p} className="flex items-center justify-between text-[11px]">
            <span className="capitalize text-slate-600">{p}</span>
            <span className="font-mono text-slate-400">{arr.length} keys</span>
            <div className="flex gap-1">
              <button
                disabled={!within}
                onClick={() => add(clip.id, p, local, fallback)}
                className="rounded bg-indigo-50 px-1.5 text-[10px] text-indigo-700 hover:bg-indigo-100 disabled:opacity-30"
              >
                + key
              </button>
              <button
                disabled={!within || arr.length === 0}
                onClick={() => remove(clip.id, p, local)}
                className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-600 hover:bg-slate-200 disabled:opacity-30"
              >
                −
              </button>
            </div>
          </div>
        );
      })}
      {!within && <p className="pt-1 text-[10px] text-slate-400">Move the playhead inside the clip to add keyframes.</p>}
    </div>
  );
}
