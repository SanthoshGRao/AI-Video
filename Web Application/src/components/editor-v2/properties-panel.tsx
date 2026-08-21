"use client";

import { useRef, useState, type ReactNode } from "react";
import { useEditor, type StageElement } from "@/lib/editor-v2/editor-store";
import {
  FONT_FAMILIES, EFFECTS, TRANSITIONS, PX_PER_SECOND, type Clip,
} from "@/lib/editor-v2/editor-data";
import { clipChrome } from "@/lib/editor-v2/timeline-theme";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FontPicker } from "@/components/ui/font-picker";
import {
  MousePointer2, Type as TypeIcon, AlignLeft, AlignCenter, AlignRight,
  Bold, Italic, Underline, Trash2, Move, Sparkles, PaintBucket, SquareDashedBottom,
  Layers, Snowflake,
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

  const multiSelected = !el && !tr && selectedClipIds.length > 1;
  const dotColor = clip ? clipChrome(clip.kind).accent : undefined;

  return (
    <aside className="w-full h-full bg-panel border-l border-border flex flex-col overflow-hidden">
      <header className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-gradient-to-b from-white/[0.03] to-transparent">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="size-7 rounded-lg grid place-items-center shrink-0 ring-1 ring-white/10"
            style={{ background: dotColor ? `color-mix(in srgb, ${dotColor} 22%, transparent)` : "rgba(255,255,255,0.05)" }}
          >
            {dotColor ? (
              <span className="size-2.5 rounded-full shrink-0" style={{ background: dotColor, boxShadow: `0 0 8px ${dotColor}` }} />
            ) : (
              <MousePointer2 className="size-3.5 text-brand-light shrink-0" />
            )}
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold text-zinc-100 truncate block">
              {multiSelected
                ? `${selectedClipIds.length} clips selected`
                : el ? `${cap(el.kind)} element` : clip ? clip.name : tr ? `${cap(tr.kind)} transition` : "Properties"}
            </span>
          </div>
        </div>
        {(el?.kind ?? clip?.kind ?? (tr ? "fx" : null)) && (
          <span className="text-[9px] font-bold font-mono text-zinc-400 uppercase tracking-wider px-2 py-1 rounded-md bg-white/[0.05] ring-1 ring-white/10 shrink-0">
            {el?.kind ?? clip?.kind ?? "fx"}
          </span>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
        {el && <ElementProps el={el} />}
        {!el && multiSelected && <MultiClipProps ids={selectedClipIds} />}
        {!el && !multiSelected && clip && <ClipProps clip={clip} />}
        {!el && !clip && tr && <TransitionProps id={tr.id} />}
        {!el && !clip && !tr && <EmptyState />}
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="text-center px-6 py-16">
      <div className="size-14 rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.01] ring-1 ring-white/10 grid place-items-center mx-auto mb-4">
        <MousePointer2 className="size-5 text-zinc-500" />
      </div>
      <p className="text-xs font-semibold text-zinc-300">Nothing selected</p>
      <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed max-w-[180px] mx-auto">Select an element, clip or transition to edit its properties.</p>
    </div>
  );
}

/* -------------------- Element props -------------------- */
/** `targets` lets a multi-selection of same-kind elements be edited as one:
 * `el` supplies the displayed values (the first selected element), while
 * every change is applied to all of `targets`. Defaults to just `el` for a
 * single-element selection. */
function ElementProps({ el, targets, hideDelete }: { el: StageElement; targets?: StageElement[]; hideDelete?: boolean }) {
  const { updateElement, removeElement, pushHistory, clips } = useEditor();
  const clip = clips.find((c) => c.elementId === el.id);
  const frozen = !!clip?.frozen;
  const applyTargets = targets && targets.length > 0 ? targets : [el];
  const set = (patch: Partial<StageElement>) => applyTargets.forEach((t) => updateElement(t.id, patch));
  const commit = () => pushHistory();

  return (
    <div className={hideDelete ? "space-y-5" : "p-4 space-y-5"}>
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
          <div className="space-y-2">
            <Field label="Font">
              <FontPicker
                defaultValue={el.fontFamily ?? "Inter"}
                onValueChange={(f) => { set({ fontFamily: f }); commit(); }}
              />
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

      {el.kind === "text" && (
        <Section label="Style" icon={<Sparkles className="size-3 text-brand-light" />}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">Background</span>
            <ToggleBtn
              active={!!el.backgroundColor}
              onClick={() => { set({ backgroundColor: el.backgroundColor ? undefined : "rgba(0, 0, 0, 0.55)" }); commit(); }}
            >
              <span className="text-[10px] font-semibold px-1">{el.backgroundColor ? "On" : "Off"}</span>
            </ToggleBtn>
          </div>
          {el.backgroundColor && (
            <ColorAlphaRow
              value={el.backgroundColor}
              onChange={(v) => set({ backgroundColor: v })}
              onCommit={commit}
            />
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">Outline</span>
            <ToggleBtn active={!!el.stroke} onClick={() => { set({ stroke: !el.stroke }); commit(); }}>
              <span className="text-[10px] font-semibold px-1">{el.stroke ? "On" : "Off"}</span>
            </ToggleBtn>
          </div>
          {el.stroke && (
            <>
              <ColorRow label="Outline color" value={el.strokeColor ?? "#000000"} onChange={(v) => set({ strokeColor: v })} onCommit={commit} />
              <SliderRow label="Outline width" value={el.strokeWidth ?? 2} min={1} max={12} step={1} suffix="px" onChange={(v) => set({ strokeWidth: v })} onCommit={commit} />
            </>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">Shadow</span>
            <ToggleBtn active={!!el.shadow} onClick={() => { set({ shadow: !el.shadow }); commit(); }}>
              <span className="text-[10px] font-semibold px-1">{el.shadow ? "On" : "Off"}</span>
            </ToggleBtn>
          </div>
        </Section>
      )}

      {(el.kind === "rect" || el.kind === "ellipse" || el.kind === "triangle" || el.kind === "shape") && (
        <Section label="Fill" icon={<PaintBucket className="size-3 text-brand-light" />}>
          <ColorRow label="Color" value={el.color} onChange={(v) => set({ color: v })} onCommit={commit} />
        </Section>
      )}

      {(el.kind === "image" || el.kind === "video" || el.kind === "rect" || el.kind === "ellipse" || el.kind === "triangle" || el.kind === "shape")
        && !(el.kind === "shape" && el.shapeType === "line") && (
        <Section label="Border" icon={<SquareDashedBottom className="size-3 text-brand-light" />}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">Stroke</span>
            <ToggleBtn active={!!el.stroke} onClick={() => { set({ stroke: !el.stroke }); commit(); }}>
              <span className="text-[10px] font-semibold px-1">{el.stroke ? "On" : "Off"}</span>
            </ToggleBtn>
          </div>
          {el.stroke && (
            <>
              <ColorRow label="Color" value={el.strokeColor ?? "#000000"} onChange={(v) => set({ strokeColor: v })} onCommit={commit} />
              <SliderRow label="Width" value={el.strokeWidth ?? 2} min={1} max={20} step={1} suffix="px" onChange={(v) => set({ strokeWidth: v })} onCommit={commit} />
            </>
          )}
        </Section>
      )}

      <Section label="Transform" icon={<Move className="size-3 text-brand-light" />}>
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
        <Section label="Effect" icon={<Layers className="size-3 text-brand-light" />}>
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

      {!hideDelete && (
        <button
          onClick={() => { commit(); removeElement(el.id); }}
          className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl bg-red-500/10 ring-1 ring-red-500/20 text-red-400 hover:bg-red-500/20 hover:ring-red-500/30 text-xs font-medium transition"
        >
          <Trash2 className="size-3.5" /> Delete element
        </button>
      )}
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
        className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl bg-red-500/10 ring-1 ring-red-500/20 text-red-400 hover:bg-red-500/20 hover:ring-red-500/30 text-xs font-medium transition"
      >
        <Trash2 className="size-3.5" /> Delete clip
      </button>
      </div>
    </div>
  );
}

/* -------------------- Multi-clip selection -------------------- */
function MultiClipProps({ ids }: { ids: string[] }) {
  const { clips, elements, updateClip, removeClip, duplicateClip, splitClipAtPlayhead, pushHistory, selectClip, tracks } = useEditor();
  const selected = clips.filter((c) => ids.includes(c.id));
  const anyFrozen = selected.some((c) => c.frozen);
  const editable = selected.filter((c) => !c.frozen);
  const commit = () => pushHistory();

  // Bulk property edits only make sense when every non-frozen clip in the
  // selection shares the same kind (mixed selections still get batch actions).
  const kinds = new Set(editable.map((c) => c.kind));
  const commonKind = kinds.size === 1 ? [...kinds][0] : null;
  const hasSound = commonKind === "audio" || commonKind === "video";
  const hasSpeed = commonKind === "video" || commonKind === "audio";
  const first = editable[0];
  const volumePct = first ? Math.round((first.audio?.volume ?? 1) * 100) : 100;
  const anyMuted = editable.some((c) => c.audio?.muted);

  const applyToAll = (patch: Partial<Clip>) => {
    editable.forEach((c) => updateClip(c.id, patch));
  };
  const applyAudioToAll = (patch: Partial<NonNullable<Clip["audio"]>>) => {
    editable.forEach((c) => updateClip(c.id, { audio: { ...(c.audio ?? {}), ...patch } }));
  };

  // Every non-frozen, non-locked-track element in the selection, so the full
  // element property editor (same one used for a single selection) can be
  // reused here and applied to all of them at once.
  const targetElements = commonKind
    ? editable
        .filter((c) => {
          if (!c.elementId) return false;
          const track = tracks.find((t) => t.id === c.track);
          return !(track as any)?.locked;
        })
        .map((c) => elements.find((e) => e.id === c.elementId))
        .filter((e): e is StageElement => !!e)
    : [];

  return (
    <div className="p-4 space-y-5">
      <Section label="Selection" icon={<Layers className="size-3 text-brand-light" />}>
        <div className="space-y-1 max-h-40 overflow-y-auto scroll-thin">
          {selected.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11px] text-zinc-300 truncate">
              {c.frozen && <Snowflake className="size-3 text-sky-400 shrink-0" />}
              <span className="truncate">{c.name}</span>
            </div>
          ))}
        </div>
        {anyFrozen && (
          <p className="text-[10px] text-sky-400">Some clips are frozen and will be skipped by these actions.</p>
        )}
      </Section>

      {commonKind && hasSpeed && (
        <Section label="Speed">
          <SliderRow
            label="Playback speed"
            value={first?.playbackRate ?? 1}
            min={0.25}
            max={3.0}
            step={0.05}
            suffix="x"
            onChange={(v) => applyToAll({ playbackRate: v })}
            onCommit={commit}
          />
        </Section>
      )}

      {commonKind && hasSound && (
        <Section label={commonKind === "audio" ? "Audio" : "Sound"}>
          <SliderRow
            label="Volume"
            value={volumePct}
            min={0}
            max={200}
            step={1}
            suffix="%"
            onChange={(v) => applyAudioToAll({ volume: v / 100 })}
            onCommit={commit}
          />
          <ToggleBtn
            active={anyMuted}
            onClick={() => { applyAudioToAll({ muted: !anyMuted }); commit(); }}
          >
            <span className="text-[10px] font-semibold px-1">Mute all</span>
          </ToggleBtn>
        </Section>
      )}

      {targetElements.length > 0 && (
        <ElementProps el={targetElements[0]} targets={targetElements} hideDelete />
      )}

      <Section label="Batch actions">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              pushHistory();
              ids.forEach((id) => { if (!clips.find((c) => c.id === id)?.frozen) duplicateClip(id); });
            }}
            className="h-8 rounded-lg bg-white/[0.04] ring-1 ring-white/10 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] hover:ring-white/20 transition"
          >
            Duplicate
          </button>
          <button
            onClick={() => {
              pushHistory();
              ids.forEach((id) => { if (!clips.find((c) => c.id === id)?.frozen) splitClipAtPlayhead(id); });
            }}
            className="h-8 rounded-lg bg-white/[0.04] ring-1 ring-white/10 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] hover:ring-white/20 transition"
          >
            Split at playhead
          </button>
        </div>
      </Section>

      <button
        onClick={() => {
          pushHistory();
          ids.forEach((id) => { if (!clips.find((c) => c.id === id)?.frozen) removeClip(id); });
          selectClip(null);
        }}
        className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl bg-red-500/10 ring-1 ring-red-500/20 text-red-400 hover:bg-red-500/20 hover:ring-red-500/30 text-xs font-medium transition"
      >
        <Trash2 className="size-3.5" /> Delete {ids.length} clips
      </button>
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
        className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl bg-red-500/10 ring-1 ring-red-500/20 text-red-400 hover:bg-red-500/20 hover:ring-red-500/30 text-xs font-medium transition"
      >
        <Trash2 className="size-3.5" /> Remove transition
      </button>
    </div>
  );
}

/* -------------------- bits -------------------- */
function Section({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 p-3.5 rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06]">
      <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </h3>
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
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const displayVal = editingValue ?? String(value);

  return (
    <div className="h-7 bg-white/[0.04] rounded-md ring-1 ring-border flex items-center px-2 focus-within:ring-brand transition">
      <input
        type="number"
        value={displayVal}
        min={min}
        max={max}
        onChange={(e) => {
          setEditingValue(e.target.value);
          const parsed = parseFloat(e.target.value);
          if (!isNaN(parsed)) {
            onChange(clampNum(parsed, min, max));
          }
        }}
        onBlur={() => {
          setEditingValue(null);
          onCommit?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="bg-transparent text-xs font-mono text-zinc-200 w-full outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {unit && <span className="text-[10px] text-zinc-500 ml-1">{unit}</span>}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, suffix = "", onChange, onCommit }: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (v: number) => void; onCommit?: () => void;
}) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const displayVal = editingValue ?? String(value);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingValue(e.target.value);
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) {
      onChange(clampNum(parsed, min, max));
    }
  };

  const handleBlur = () => {
    setEditingValue(null);
    onCommit?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-zinc-400 truncate">{label}</span>
        <div className="flex items-center gap-1 bg-white/[0.04] hover:bg-white/[0.08] focus-within:bg-white/[0.08] focus-within:ring-1 focus-within:ring-brand px-1.5 py-0.5 rounded transition">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={displayVal}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-12 bg-transparent text-right text-[10px] font-mono text-zinc-200 outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {suffix && <span className="text-[9px] font-mono text-zinc-500 select-none">{suffix}</span>}
        </div>
      </div>
      <Slider
        value={[clampNum(value, min, max)]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => {
          setEditingValue(null);
          onChange(v[0]);
        }}
        onValueCommit={onCommit}
      />
    </div>
  );
}
const SWATCHES = [
  "#ffffff", "#000000", "#ef4444", "#f59e0b", "#eab308",
  "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

function ColorRow({ label, value, onChange, onCommit }: { label: string; value: string; onChange: (v: string) => void; onCommit?: () => void }) {
  const hex = toHex(value);
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-zinc-400">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-2 h-7 pl-1 pr-2 rounded-md ring-1 ring-border bg-white/[0.04] hover:ring-brand/40 transition"
            onBlur={onCommit}
          >
            <span className="size-5 rounded ring-1 ring-white/20" style={{ background: hex }} />
            <span className="text-[10px] font-mono text-zinc-400 uppercase">{hex}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 bg-panel border-border p-3 space-y-3"
          onCloseAutoFocus={(e) => { e.preventDefault(); onCommit?.(); }}
        >
          <div className="grid grid-cols-5 gap-2">
            {SWATCHES.map((s) => (
              <button
                key={s}
                onClick={() => { onChange(s); onCommit?.(); }}
                className={`size-7 rounded-md ring-1 transition ${s.toLowerCase() === hex.toLowerCase() ? "ring-brand ring-2" : "ring-white/15 hover:ring-white/40"}`}
                style={{ background: s }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="size-7 rounded cursor-pointer bg-transparent border border-border shrink-0" />
            <input
              value={hex}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 h-7 bg-white/[0.04] rounded-md ring-1 ring-border px-2 text-xs font-mono text-zinc-200 outline-none focus:ring-brand"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Color + opacity control that persists a single rgba(...) string (both the
 * DOM and canvas renderers apply an rgba background's own alpha natively, so
 * no separate opacity field is needed on the element). */
function ColorAlphaRow({ value, onChange, onCommit }: { value: string; onChange: (v: string) => void; onCommit?: () => void }) {
  const { hex, alpha } = parseColorAlpha(value);
  return (
    <>
      <ColorRow label="Color" value={hex} onChange={(v) => onChange(composeColorAlpha(v, alpha))} onCommit={onCommit} />
      <SliderRow
        label="Opacity"
        value={Math.round(alpha * 100)}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onChange={(v) => onChange(composeColorAlpha(hex, v / 100))}
        onCommit={onCommit}
      />
    </>
  );
}

function parseColorAlpha(value: string | undefined): { hex: string; alpha: number } {
  if (!value) return { hex: "#000000", alpha: 1 };
  const m = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\)/);
  if (!m) return { hex: toHex(value), alpha: 1 };
  const [, r, g, b, a] = m;
  const hex = "#" + [r, g, b].map((c) => Math.round(Number(c)).toString(16).padStart(2, "0")).join("");
  return { hex, alpha: a != null ? Number(a) : 1 };
}
function composeColorAlpha(hex: string, alpha: number): string {
  const h = toHex(hex).replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
function ToggleBtn({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`h-7 min-w-7 px-1.5 grid place-items-center rounded-lg ring-1 transition ${active ? "bg-brand/20 ring-brand/50 text-brand-light shadow-[0_0_0_1px_rgba(0,0,0,0)]" : "ring-border text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"}`}>
      {children}
    </button>
  );
}
function TypeBadge({ kind }: { kind: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06]">
      <TypeIcon className="size-3.5 text-zinc-500" />
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
