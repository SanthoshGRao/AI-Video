import { chromium } from "playwright";

type Scene =
  | "none" | "grayscale" | "sepia" | "invert" | "vintage" | "vivid" | "cool" | "warm"
  | "blur" | "vignette" | "chromaKey" | "glow" | "lut" | "transitionCrossfade";

interface Check {
  scene: Scene;
  label: string;
  x: number;
  y: number; // in top-left/DOM coordinates; converted to GL bottom-left below
  expect: [number, number, number, number];
  tolerance: number;
}

const W = 400, H = 300;
const toGL = (y: number) => H - 1 - y;

const CENTER_X = W / 2, CENTER_Y = H / 2;

// --- Reference implementation of shaders.ts FRAGMENT_COLOR_ADJUST, ported
// to JS so expected values are computed, not hand-guessed (guessing by hand
// for the hue-rotate cases produced wrong numbers on the first pass — see
// session notes). This cross-checks the GLSL against an independent port of
// the same formula rather than asserting the shader against itself.
function rgb2hsl([r, g, b]: number[]): [number, number, number] {
  const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
  const l = (maxc + minc) / 2;
  let h = 0, s = 0;
  const d = maxc - minc;
  if (d > 0.00001) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (maxc === r) h = ((g - b) / d) % 6;
    else if (maxc === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, s, l];
}
function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hsl2rgb([h, s, l]: number[]): [number, number, number] {
  if (s <= 0.00001) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}
function colorAdjustReference(
  input: [number, number, number],
  params: { brightness: number; contrast: number; saturation: number; hueDeg: number; sepia: number; invert: number },
): [number, number, number, number] {
  let c: [number, number, number] = [...input];
  c = c.map((v) => (v - 0.5) * params.contrast + 0.5) as typeof c;
  c = c.map((v) => v * params.brightness) as typeof c;
  const lum = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  c = c.map((v) => lum + (v - lum) * params.saturation) as typeof c;
  if (Math.abs(params.hueDeg) > 0.001) {
    const clamped = c.map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
    const hsl = rgb2hsl(clamped);
    hsl[0] = ((hsl[0] + params.hueDeg / 360) % 1 + 1) % 1;
    c = hsl2rgb(hsl);
  }
  const sepiaColor: [number, number, number] = [
    c[0] * 0.393 + c[1] * 0.769 + c[2] * 0.189,
    c[0] * 0.349 + c[1] * 0.686 + c[2] * 0.168,
    c[0] * 0.272 + c[1] * 0.534 + c[2] * 0.131,
  ];
  c = c.map((v, i) => v * (1 - params.sepia) + sepiaColor[i] * params.sepia) as typeof c;
  c = c.map((v) => v * (1 - params.invert) + (1 - v) * params.invert) as typeof c;
  const clamped = c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)) as [number, number, number];
  return [...clamped, 255];
}

const NEUTRAL = { brightness: 1, contrast: 1, saturation: 1, hueDeg: 0, sepia: 0, invert: 0 };
const RED: [number, number, number] = [1, 0, 0];

const PRESET_PARAMS: Record<string, typeof NEUTRAL> = {
  none: NEUTRAL,
  grayscale: { ...NEUTRAL, saturation: 0 },
  sepia: { ...NEUTRAL, sepia: 0.85 },
  invert: { ...NEUTRAL, invert: 1 },
  vintage: { ...NEUTRAL, sepia: 0.4, contrast: 1.1, saturation: 1.3 },
  vivid: { ...NEUTRAL, saturation: 1.8, contrast: 1.15 },
  cool: { ...NEUTRAL, hueDeg: -15, saturation: 1.2, brightness: 1.05 },
  warm: { ...NEUTRAL, hueDeg: 15, saturation: 1.3, brightness: 1.05 },
};

const checks: Check[] = (Object.keys(PRESET_PARAMS) as Scene[]).map((scene) => ({
  scene,
  label: `red -> ${scene} preset (reference-computed)`,
  x: CENTER_X,
  y: CENTER_Y,
  expect: colorAdjustReference(RED, PRESET_PARAMS[scene]),
  tolerance: 3,
}));

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.goto("http://localhost:3411/test-editor", { waitUntil: "networkidle" });
  await page.waitForFunction(() => (window as unknown as { __gpuHarness?: unknown }).__gpuHarness !== undefined, { timeout: 10000 });

  let failures = 0;
  let passed = 0;

  for (const check of checks) {
    await page.evaluate((scene) => {
      (window as unknown as { __gpuHarness: { renderScene: (s: string) => void } }).__gpuHarness.renderScene(scene);
    }, check.scene);
    const glY = toGL(check.y);
    const pixel = await page.evaluate(
      ({ x, y }) => (window as unknown as { __gpuHarness: { readPixel: (x: number, y: number) => number[] } }).__gpuHarness.readPixel(x, y),
      { x: check.x, y: glY },
    );
    const diffs = pixel.map((v, i) => Math.abs(v - check.expect[i]));
    const withinTolerance = diffs.every((d) => d <= check.tolerance);
    const status = withinTolerance ? "PASS" : "FAIL";
    if (withinTolerance) passed++; else failures++;
    console.log(`[${status}] ${check.scene} — ${check.label}: got [${pixel.join(",")}] expect [${check.expect.join(",")}] tol=${check.tolerance}`);
  }

  // Blur: check the hard edge (x=200, the split boundary) is no longer a
  // pure color after blurring — proves the kernel actually samples neighbors.
  {
    await page.evaluate(() => (window as unknown as { __gpuHarness: { renderScene: (s: string) => void } }).__gpuHarness.renderScene("blur"));
    const edge = await page.evaluate(
      ({ x, y }) => (window as unknown as { __gpuHarness: { readPixel: (x: number, y: number) => number[] } }).__gpuHarness.readPixel(x, y),
      { x: W / 2, y: toGL(H / 2) },
    );
    const isPureRedOrBlue = (edge[0] > 250 && edge[2] < 5) || (edge[2] > 250 && edge[0] < 5);
    const status = !isPureRedOrBlue ? "PASS" : "FAIL";
    if (!isPureRedOrBlue) passed++; else failures++;
    console.log(`[${status}] blur — edge pixel is a blend, not pure red/blue: got [${edge.join(",")}]`);
  }

  // Vignette: center should stay bright, near-corner should be darkened.
  {
    await page.evaluate(() => (window as unknown as { __gpuHarness: { renderScene: (s: string) => void } }).__gpuHarness.renderScene("vignette"));
    const center = await page.evaluate(
      ({ x, y }) => (window as unknown as { __gpuHarness: { readPixel: (x: number, y: number) => number[] } }).__gpuHarness.readPixel(x, y),
      { x: W / 2, y: toGL(H / 2) },
    );
    const corner = await page.evaluate(
      ({ x, y }) => (window as unknown as { __gpuHarness: { readPixel: (x: number, y: number) => number[] } }).__gpuHarness.readPixel(x, y),
      { x: 5, y: toGL(5) },
    );
    const ok = center[0] > 240 && corner[0] < center[0] - 40;
    const status = ok ? "PASS" : "FAIL";
    if (ok) passed++; else failures++;
    console.log(`[${status}] vignette — center bright [${center.join(",")}], corner darkened [${corner.join(",")}]`);
  }

  // Chroma key: pure green matching the key color should become transparent (alpha ~0).
  {
    await page.evaluate(() => (window as unknown as { __gpuHarness: { renderScene: (s: string) => void } }).__gpuHarness.renderScene("chromaKey"));
    const pixel = await page.evaluate(
      ({ x, y }) => (window as unknown as { __gpuHarness: { readPixel: (x: number, y: number) => number[] } }).__gpuHarness.readPixel(x, y),
      { x: W / 2, y: toGL(H / 2) },
    );
    const ok = pixel[3] < 10;
    const status = ok ? "PASS" : "FAIL";
    if (ok) passed++; else failures++;
    console.log(`[${status}] chromaKey — matching key color -> near-zero alpha: got [${pixel.join(",")}]`);
  }

  // Glow: a point just outside the bright spot's original radius (r=20) should
  // be brighter than pure black once the glow bloom bleeds outward.
  {
    await page.evaluate(() => (window as unknown as { __gpuHarness: { renderScene: (s: string) => void } }).__gpuHarness.renderScene("glow"));
    const bleed = await page.evaluate(
      ({ x, y }) => (window as unknown as { __gpuHarness: { readPixel: (x: number, y: number) => number[] } }).__gpuHarness.readPixel(x, y),
      { x: W / 2 + 26, y: toGL(H / 2) },
    );
    const ok = bleed[0] > 3;
    const status = ok ? "PASS" : "FAIL";
    if (ok) passed++; else failures++;
    console.log(`[${status}] glow — brightness bleeds past the spot radius: got [${bleed.join(",")}]`);
  }

  // LUT identity: input color should pass through unchanged (within LUT tile-sampling error).
  {
    await page.evaluate(() => (window as unknown as { __gpuHarness: { renderScene: (s: string) => void } }).__gpuHarness.renderScene("lut"));
    const pixel = await page.evaluate(
      ({ x, y }) => (window as unknown as { __gpuHarness: { readPixel: (x: number, y: number) => number[] } }).__gpuHarness.readPixel(x, y),
      { x: W / 2, y: toGL(H / 2) },
    );
    const expect = [0x80, 0x40, 0xc0];
    const ok = expect.every((v, i) => Math.abs(v - pixel[i]) <= 12);
    const status = ok ? "PASS" : "FAIL";
    if (ok) passed++; else failures++;
    console.log(`[${status}] lut identity — got [${pixel.join(",")}] expect ~[${expect.join(",")},255]`);
  }

  // Transition crossfade at progress=0.5: red "from" (opacity 0.5) drawn
  // first onto transparent black, then blue "to" (opacity 0.5) drawn over it
  // with standard straight-alpha "over" compositing:
  //   afterRed   = (1,0,0)*0.5 + (0,0,0)*(1-0.5)      = (0.5, 0, 0), a=0.5
  //   afterBlue  = (0,0,1)*0.5 + afterRed*(1-0.5)     = (0.25, 0, 0.5), a=0.75
  // -> expect (64, 0, 128, 191).
  {
    await page.evaluate(() => (window as unknown as { __gpuHarness: { renderScene: (s: string) => void } }).__gpuHarness.renderScene("transitionCrossfade"));
    const pixel = await page.evaluate(
      ({ x, y }) => (window as unknown as { __gpuHarness: { readPixel: (x: number, y: number) => number[] } }).__gpuHarness.readPixel(x, y),
      { x: W / 2, y: toGL(H / 2) },
    );
    const expect = [64, 0, 128, 191];
    const ok = expect.every((v, i) => Math.abs(v - pixel[i]) <= 3);
    const status = ok ? "PASS" : "FAIL";
    if (ok) passed++; else failures++;
    console.log(`[${status}] transition crossfade @0.5 — got [${pixel.join(",")}] expect [${expect.join(",")}]`);
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  if (consoleErrors.length) {
    console.log("\nBrowser console errors:");
    for (const e of consoleErrors) console.log("  " + e);
  }

  await browser.close();
  process.exitCode = failures > 0 || consoleErrors.length > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
