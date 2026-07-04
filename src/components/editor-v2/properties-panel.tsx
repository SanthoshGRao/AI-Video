"use client";

import { useRef, type ReactNode } from "react";
import { useEditor, type StageElement } from "@/lib/editor-v2/editor-store";
import {
  FONT_FAMILIES, EFFECTS, TRANSITIONS, PX_PER_SECOND, type Clip,
} from "@/lib/editor-v2/editor-data";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  MousePointer2, Type as TypeIcon, AlignLeft, AlignCenter, AlignRight,
  Bold, Italic, Underline, Trash2,
} from "lucide-react";

export function PropertiesPanel() {
  const {
    elements, selectedElementId,
    clips, selectedClipIds,
    transitions, selectedTransitionId,
  } = useEditor();

  const el = elements.find((e) => e.id === selectedElementId);
  const clip = clips.find((c) => selectedClipIds.includes(c.id));
  const tr = transitions.find((t) => t.id === selectedTransitionId);

  return (
    <aside className="w-full h-full bg-panel border-l border-border flex flex-col overflow-hidden">
      <header className="h-12 px-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <MousePointer2 className="size-3.5 text-brand-light shrink-0" />
          <span className="text-xs font-semibold truncate">
            {el ? `${cap(el.kind)} element` : clip ? clip.name : tr ? `${cap(tr.kind)} transition` : "Properties"}
          </span>
        </div>
        <span className="text-[9px] font-mono text-zinc-500 uppercase">
          {el?.kind ?? clip?.kind ?? (tr ? "fx" : "—")}
        </span>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
        {el && <ElementProps el={el} />}
        {!el && clip && <ClipProps clip={clip} />}
        {!el && !clip && tr && <TransitionProps id={tr.id} />}
        {!el && !clip && !tr && <EmptyState />}
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="text-center px-6 py-16">
      <div className="size-12 rounded-xl bg-white/5 grid place-items-center mx-auto mb-3">
        <MousePointer2 className="size-5 text-zinc-500" />
      </div>
      <p className="text-xs font-medium text-zinc-300">Nothing selected</p>
      <p className="text-[11px] text-zinc-500 mt-1">Select an element, clip or transition to edit its properties.</p>
    </div>
  );
}

/* -------------------- Element props -------------------- */
function ElementProps({ el }: { el: StageElement }) {
  const { updateElement, removeElement, pushHistory, clips } = useEditor();
  const clip = clips.find((c) => c.elementId === el.id);
  const frozen = !!clip?.frozen;
  const set = (patch: Partial<StageElement>) => updateElement(el.id, patch);
  const commit = () => pushHistory();

  return (
    <div className="p-4 space-y-5">
      {frozen && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-md p-2.5 flex items-center gap-2 text-sky-400">
          <span className="text-sm">❄️</span>
          <span className="text-[11px] font-medium leading-normal">
            Element is frozen. Unfreeze it from the timeline toolbar to edit.
          </span>
        </div>
      )}
      <div className={frozen ? "pointer-events-none opacity-50 select-none" : ""}>
        {el.kind === "text" && (
        <Section label="Text">
          <textarea
            value={el.text ?? ""}
            onChange={(e) => set({ text: e.target.value })}
            onBlur={commit}
            rows={2}
            className="w-full bg-white/[0.04] rounded-md ring-1 ring-border focus:ring-brand px-2.5 py-2 text-xs text-zinc-100 outline-none resize-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Font">
              <select
                value={el.fontFamily ?? "Inter"}
                onChange={(e) => { set({ fontFamily: e.target.value }); commit(); }}
                className="w-full bg-white/[0.04] rounded-md ring-1 ring-border px-2 h-7 text-xs text-zinc-100 outline-none"
              >
                {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Size">
              <NumInput value={el.fontSize ?? 32} min={8} max={300} onChange={(v) => set({ fontSize: v })} onCommit={commit} unit="px" />
            </Field>
          </div>
          <SliderRow label="Weight" value={el.fontWeight ?? 700} min={100} max={900} step={100} onChange={(v) => set({ fontWeight: v })} onCommit={commit} />
          <SliderRow label="Letter spacing" value={el.letterSpacing ?? 0} min={-5} max={30} step={1} suffix="px" onChange={(v) => set({ letterSpacing: v })} onCommit={commit} />
          <div className="flex items-center gap-1.5">
            <ToggleBtn active={(el.fontWeight ?? 700) >= 700} onClick={() => { set({ fontWeight: (el.fontWeight ?? 700) >= 700 ? 400 : 800 }); commit(); }}><Bold className="size-3.5" /></ToggleBtn>
            <ToggleBtn active={!!el.italic} onClick={() => { set({ italic: !el.italic }); commit(); }}><Italic className="size-3.5" /></ToggleBtn>
            <ToggleBtn active={!!el.underline} onClick={() => { set({ underline: !el.underline }); commit(); }}><Underline className="size-3.5" /></ToggleBtn>
            <div className="w-px h-5 bg-border mx-1" />
            <ToggleBtn active={el.align === "left"} onClick={() => { set({ align: "left" }); commit(); }}><AlignLeft className="size-3.5" /></ToggleBtn>
            <ToggleBtn active={(el.align ?? "center") === "center"} onClick={() => { set({ align: "center" }); commit(); }}><AlignCenter className="size-3.5" /></ToggleBtn>
            <ToggleBtn active={el.align === "right"} onClick={() => { set({ align: "right" }); commit(); }}><AlignRight className="size-3.5" /></ToggleBtn>
          </div>
          <ColorRow label="Color" value={el.color} onChange={(v) => set({ color: v })} onCommit={commit} />
        </Section>
      )}

      {(el.kind === "rect" || el.kind === "ellipse" || el.kind === "triangle" || el.kind === "shape") && (
        <Section label="Fill">
          <ColorRow label="Color" value={el.color} onChange={(v) => set({ color: v })} onCommit={commit} />
        </Section>
      )}

      <Section label="Transform">
        <div className="grid grid-cols-2 gap-2">
          <Field label="X"><NumInput value={Math.round(el.x)} min={-100} max={200} onChange={(v) => set({ x: v })} onCommit={commit} unit="%" /></Field>
          <Field label="Y"><NumInput value={Math.round(el.y)} min={-100} max={200} onChange={(v) => set({ y: v })} onCommit={commit} unit="%" /></Field>
          <Field label="Width"><NumInput value={Math.round(el.w)} min={2} max={200} onChange={(v) => set({ w: v })} onCommit={commit} unit="%" /></Field>
          <Field label="Height"><NumInput value={Math.round(el.h)} min={2} max={200} onChange={(v) => set({ h: v })} onCommit={commit} unit="%" /></Field>
        </div>
        <SliderRow label="Rotation" value={Math.round(el.rotation)} min={-180} max={180} step={1} suffix="°" onChange={(v) => set({ rotation: v })} onCommit={commit} />
        <SliderRow label="Opacity" value={el.opacity ?? 100} min={0} max={100} step={1} onChange={(v) => set({ opacity: v })} onCommit={commit} />
      </Section>

      {(el.kind === "image" || el.kind === "video" || el.kind === "rect" || el.kind === "ellipse" || el.kind === "triangle" || el.kind === "shape") && (
        <Section label="Effect">
          <select
            value={el.effect ?? "none"}
            onChange={(e) => { set({ effect: e.target.value as StageElement["effect"] }); commit(); }}
            className="w-full bg-white/[0.04] rounded-md ring-1 ring-border px-2 h-8 text-xs text-zinc-100 outline-none mb-4"
          >
            {EFFECTS.map((ef) => <option key={ef.id} value={ef.id}>{ef.label}</option>)}
          </select>

          {(el.kind === "image" || el.kind === "video") && (
            <div className="flex items-center gap-2 mt-4">
              <span className="text-xs text-zinc-400 w-16">Fit</span>
              <div className="flex bg-white/[0.04] p-0.5 rounded-md flex-1">
                <button
                  className={`flex-1 text-[10px] py-1 rounded transition ${(!el.fit || el.fit === "cover") ? "bg-white/10 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"}`}
                  onClick={() => { set({ fit: "cover" }); commit(); }}
                >
                  Fill Frame
                </button>
                <button
                  className={`flex-1 text-[10px] py-1 rounded transition ${el.fit === "contain" ? "bg-white/10 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"}`}
                  onClick={() => { set({ fit: "contain" }); commit(); }}
                >
                  Fit Inside
                </button>
              </div>
            </div>
          )}
        </Section>
      )}

      <button
        onClick={() => { commit(); removeElement(el.id); }}
        className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition"
      >
        <Trash2 className="size-3.5" /> Delete element
      </button>
      </div>
    </div>
  );
}

/* -------------------- Clip props -------------------- */
function ClipProps({ clip }: { clip: Clip }) {
  const { updateClip, removeClip, pushHistory } = useEditor();
  const frozen = !!clip.frozen;
  const commit = () => pushHistory();

  const seconds = +(clip.width / PX_PER_SECOND).toFixed(1);
  const audio = clip.audio ?? {};
  const setAudio = (patch: Partial<NonNullable<Clip["audio"]>>) =>
    updateClip(clip.id, { audio: { ...audio, ...patch } });
  const volumePct = Math.round((audio.volume ?? 1) * 100);
  const hasSound = clip.kind === "audio" || (clip.kind === "video" && !!clip.src);
  const hasSpeed = clip.kind === "video" || clip.kind === "audio";

  return (
    <div className="p-4 space-y-5">
      {frozen && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-md p-2.5 flex items-center gap-2 text-sky-400">
          <span className="text-sm">❄️</span>
          <span className="text-[11px] font-medium leading-normal">
            Clip is frozen. Unfreeze it from the timeline toolbar to edit.
          </span>
        </div>
      )}
      <div className={frozen ? "pointer-events-none opacity-50 select-none" : ""}>
        <Section label="Clip">
        <Field label="Name">
          <Input value={clip.name} onChange={(e) => updateClip(clip.id, { name: e.target.value })} onBlur={commit} className="h-7 text-xs bg-white/[0.04] border-border" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start"><NumInput value={+(clip.start / PX_PER_SECOND).toFixed(1)} min={0} max={600} onChange={(v) => updateClip(clip.id, { start: v * PX_PER_SECOND })} onCommit={commit} unit="s" /></Field>
          <Field label="Duration"><NumInput value={seconds} min={0.5} max={600} onChange={(v) => updateClip(clip.id, { width: Math.max(20, v * PX_PER_SECOND) })} onCommit={commit} unit="s" /></Field>
        </div>
      </Section>

      {hasSpeed && (
        <Section label="Speed">
          <SliderRow
            label="Playback speed"
            value={clip.playbackRate ?? 1}
            min={0.25}
            max={3.0}
            step={0.05}
            suffix="x"
            onChange={(v) => updateClip(clip.id, { playbackRate: v })}
            onCommit={commit}
          />
        </Section>
      )}

      {hasSound && (
        <Section label={clip.kind === "audio" ? "Audio" : "Sound"}>
          <SliderRow
            label="Volume"
            value={volumePct}
            min={0}
            max={200}
            step={1}
            suffix="%"
            onChange={(v) => setAudio({ volume: v / 100 })}
            onCommit={commit}
          />
          <div className="flex items-center gap-1.5">
            <ToggleBtn
              active={!!audio.muted}
              onClick={() => { setAudio({ muted: !audio.muted }); commit(); }}
            >
              <span className="text-[10px] font-semibold px-1">Mute</span>
            </ToggleBtn>
            {clip.kind === "audio" && (
              <ToggleBtn
                active={!!audio.solo}
                onClick={() => { setAudio({ solo: !audio.solo }); commit(); }}
              >
                <span className="text-[10px] font-semibold px-1">Solo</span>
              </ToggleBtn>
            )}
          </div>
          {clip.kind === "audio" && (
            <>
              <SliderRow
                label="Fade in"
                value={Math.round((audio.fadeIn ?? 0) * 1000)}
                min={0}
                max={3000}
                step={50}
                suffix="ms"
                onChange={(v) => setAudio({ fadeIn: v / 1000 })}
                onCommit={commit}
              />
              <SliderRow
                label="Fade out"
                value={Math.round((audio.fadeOut ?? 0) * 1000)}
                min={0}
                max={3000}
                step={50}
                suffix="ms"
                onChange={(v) => setAudio({ fadeOut: v / 1000 })}
                onCommit={commit}
              />
            </>
          )}
        </Section>
      )}

      <TypeBadge kind={clip.kind} />
      <button
        onClick={() => { commit(); removeClip(clip.id); }}
        className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition"
      >
        <Trash2 className="size-3.5" /> Delete clip
      </button>
      </div>
    </div>
  );
}

/* -------------------- Transition props -------------------- */
function TransitionProps({ id }: { id: string }) {
  const { transitions, addTransition, removeTransition, selectTransition, pushHistory } = useEditor();
  const commit = () => pushHistory();
  const tr = transitions.find((t) => t.id === id)!;
  const trRef = useRef(tr);
  if (tr) trRef.current = tr;
  const activeTr = tr || trRef.current; // avoid flash when removing/adding
  return (
    <div className="p-4 space-y-5">
      <Section label="Transition">
        <Field label="Type">
          <select
            value={activeTr.kind}
            onChange={(e) => {
              const next = e.target.value as typeof activeTr.kind;
              useEditor.getState().updateTransition(activeTr.id, { kind: next });
              commit();
            }}
            className="w-full bg-white/[0.04] rounded-md ring-1 ring-border px-2 h-8 text-xs text-zinc-100 outline-none"
          >
            {TRANSITIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
        <SliderRow label="Duration" value={activeTr.duration} min={0.2} max={3} step={0.1} suffix="s" onChange={(v) => {
          useEditor.getState().updateTransition(activeTr.id, { duration: v });
        }} onCommit={commit} />
      </Section>
      <button
        onClick={() => { commit(); removeTransition(activeTr.id); }}
        className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition"
      >
        <Trash2 className="size-3.5" /> Remove transition
      </button>
    </div>
  );
}

/* -------------------- bits -------------------- */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</h3>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] text-zinc-500">{label}</span>
      {children}
    </div>
  );
}
function NumInput({ value, onChange, min, max, unit, onCommit }: { value: number; onChange: (v: number) => void; min: number; max: number; unit?: string; onCommit?: () => void }) {
  return (
    <div className="h-7 bg-white/[0.04] rounded-md ring-1 ring-border flex items-center px-2 focus-within:ring-brand transition">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(clampNum(parseFloat(e.target.value) || 0, min, max))}
        onBlur={onCommit}
        className="bg-transparent text-xs font-mono text-zinc-200 w-full outline-none"
      />
      {unit && <span className="text-[10px] text-zinc-500 ml-1">{unit}</span>}
    </div>
  );
}
function SliderRow({ label, value, min, max, step, suffix = "", onChange, onCommit }: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (v: number) => void; onCommit?: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-400">{label}</span>
        <span className="text-[10px] font-mono text-zinc-300 tabular-nums">{value}{suffix}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} onValueCommit={onCommit} />
    </div>
  );
}
function ColorRow({ label, value, onChange, onCommit }: { label: string; value: string; onChange: (v: string) => void; onCommit?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-zinc-400">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={toHex(value)} onChange={(e) => onChange(e.target.value)} onBlur={onCommit} className="size-6 rounded cursor-pointer bg-transparent border border-border" />
        <span className="text-[10px] font-mono text-zinc-400 uppercase">{value}</span>
      </div>
    </div>
  );
}
function ToggleBtn({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`size-7 grid place-items-center rounded-md border transition ${active ? "bg-brand/15 border-brand/40 text-brand-light" : "border-border text-zinc-400 hover:text-zinc-200 hover:bg-white/5"}`}>
      {children}
    </button>
  );
}
function TypeBadge({ kind }: { kind: string }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-white/[0.03] border border-border">
      <TypeIcon className="size-3.5 text-zinc-400" />
      <span className="text-[11px] text-zinc-400 capitalize">{kind} clip on the timeline</span>
    </div>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function clampNum(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }

let canvasCtx: CanvasRenderingContext2D | null = null;
function toHex(c: string) {
  if (c.startsWith("#")) return c;
  if (typeof document === "undefined") return "#ffffff";
  if (!canvasCtx) canvasCtx = document.createElement("canvas").getContext("2d");
  if (!canvasCtx) return "#ffffff";
  canvasCtx.fillStyle = c;
  return canvasCtx.fillStyle;
}
