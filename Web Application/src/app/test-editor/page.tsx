"use client";

import { useEffect, useRef, useState } from "react";
import { GpuCompositor } from "@/lib/gpu-compositor/compositor";
import {
  presetEffectStep,
  vignetteEffect,
  chromaKeyEffect,
  glowEffect,
  lutEffect,
} from "@/lib/gpu-compositor/effect-presets";
import type { ResolvedLayer, TransitionSpec, EffectStep } from "@/lib/gpu-compositor/types";

const WIDTH = 400;
const HEIGHT = 300;

function solidCanvas(color: string, w = WIDTH, h = HEIGHT): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return c;
}

function splitCanvas(colorA: string, colorB: string, w = WIDTH, h = HEIGHT): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, w / 2, h);
  ctx.fillStyle = colorB;
  ctx.fillRect(w / 2, 0, w / 2, h);
  return c;
}

function spotCanvas(bg: string, spot: string, w = WIDTH, h = HEIGHT): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = spot;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 20, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

/** Identity LUT matching FRAGMENT_LUT's single-row tile-strip format: image
 * is `size*size` wide by `size` tall, `size` tiles left-to-right (one per B
 * slice), each tile `size x size` covering R (x) / G (y) — every cell holds
 * exactly the color its position represents, i.e. the identity mapping. */
function identityLutCanvas(size = 32): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size * size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(c.width, c.height);
  for (let bz = 0; bz < size; bz++) {
    const bValue = bz / (size - 1);
    for (let gy = 0; gy < size; gy++) {
      const g = gy / (size - 1);
      for (let rx = 0; rx < size; rx++) {
        const r = rx / (size - 1);
        const x = bz * size + rx;
        const y = gy;
        const i = (y * c.width + x) * 4;
        img.data[i] = Math.round(r * 255);
        img.data[i + 1] = Math.round(g * 255);
        img.data[i + 2] = Math.round(bValue * 255);
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function fullFrameLayer(clipId: string, source: HTMLCanvasElement, effects?: EffectStep[]): ResolvedLayer {
  return {
    clipId,
    source,
    sourceIsTexture: false,
    transform: { x: 0, y: 0, w: WIDTH, h: HEIGHT, rotation: 0, opacity: 1 },
    effects,
  };
}

type SceneName =
  | "none"
  | "grayscale"
  | "sepia"
  | "invert"
  | "vintage"
  | "vivid"
  | "cool"
  | "warm"
  | "blur"
  | "vignette"
  | "chromaKey"
  | "glow"
  | "lut"
  | "transitionCrossfade";

function buildScene(name: SceneName): { layers: ResolvedLayer[]; transitions: TransitionSpec[] } {
  switch (name) {
    case "blur":
      return { layers: [fullFrameLayer("a", splitCanvas("#ff0000", "#0000ff"), [presetEffectStep("blur")])], transitions: [] };
    case "vignette":
      return { layers: [fullFrameLayer("a", solidCanvas("#ffffff"), [vignetteEffect(0.9)])], transitions: [] };
    case "chromaKey":
      return {
        layers: [fullFrameLayer("a", solidCanvas("#00ff00"), [chromaKeyEffect([0, 1, 0], 0.2, 0.05)])],
        transitions: [],
      };
    case "glow":
      return { layers: [fullFrameLayer("a", spotCanvas("#000000", "#ffffff"), [glowEffect(0.5, 8, 1.5)])], transitions: [] };
    case "lut":
      return { layers: [fullFrameLayer("a", solidCanvas("#8040c0"), [lutEffect(identityLutCanvas(32), 32)])], transitions: [] };
    case "transitionCrossfade":
      return {
        layers: [
          fullFrameLayer("from", solidCanvas("#ff0000")),
          fullFrameLayer("to", solidCanvas("#0000ff")),
        ],
        transitions: [{ type: "crossfade", progress: 0.5, fromClipId: "from", toClipId: "to" }],
      };
    default:
      return { layers: [fullFrameLayer("a", solidCanvas("#ff0000"), [presetEffectStep(name)])], transitions: [] };
  }
}

export default function GpuCompositorHarnessPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<GpuCompositor | null>(null);
  const [scene, setScene] = useState<SceneName>("none");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    compositorRef.current = new GpuCompositor(canvasRef.current);
    (window as unknown as { __gpuHarness: unknown }).__gpuHarness = {
      renderScene: (name: SceneName) => {
        const compositor = compositorRef.current;
        if (!compositor) return;
        const { layers, transitions } = buildScene(name);
        compositor.compositeFrame(
          layers,
          { width: WIDTH, height: HEIGHT, framebuffer: null },
          { presentationTimestamp: 0, timelineTimestamp: 0, version: 1 },
          transitions,
        );
      },
      readPixel: (x: number, y: number): [number, number, number, number] => {
        const gl = compositorRef.current?.context.gl;
        if (!gl) return [0, 0, 0, 0];
        const pixel = new Uint8Array(4);
        // WebGL's readPixels origin is bottom-left; harness scenes are
        // uniform enough that callers pass already-flipped y where it matters.
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return [pixel[0], pixel[1], pixel[2], pixel[3]];
      },
      width: WIDTH,
      height: HEIGHT,
    };
    setReady(true);
    return () => {
      compositorRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    (window as unknown as { __gpuHarness: { renderScene: (n: SceneName) => void } }).__gpuHarness.renderScene(scene);
  }, [scene, ready]);

  const scenes: SceneName[] = [
    "none", "grayscale", "sepia", "invert", "vintage", "vivid", "cool", "warm",
    "blur", "vignette", "chromaKey", "glow", "lut", "transitionCrossfade",
  ];

  return (
    <div style={{ padding: 16, fontFamily: "monospace" }}>
      <h1>GPU Compositor Debug Harness</h1>
      <p>Phase 2 standalone verification page — renders one synthetic scene per shader/effect.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {scenes.map((s) => (
          <button
            key={s}
            data-scene={s}
            onClick={() => setScene(s)}
            style={{ padding: "4px 8px", background: scene === s ? "#333" : "#eee", color: scene === s ? "#fff" : "#000" }}
          >
            {s}
          </button>
        ))}
      </div>
      <canvas
        ref={canvasRef}
        id="gpu-harness-canvas"
        width={WIDTH}
        height={HEIGHT}
        style={{ border: "1px solid #999", background: "#222" }}
      />
    </div>
  );
}
