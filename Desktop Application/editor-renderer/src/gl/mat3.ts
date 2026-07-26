/**
 * mat3.ts — minimal column-major 3x3 affine matrix helpers for 2D
 * transforms (position/size/rotation), used to map a clip's pixel-space
 * transform box into clip-space (-1..1) NDC coordinates for the positioned
 * quad shader (compositor.ts).
 */

export type Mat3 = Float32Array;

export function identity(): Mat3 {
  // prettier-ignore
  return new Float32Array([
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ]);
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Float32Array(9);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += a[k * 3 + row] * b[col * 3 + k];
      out[col * 3 + row] = sum;
    }
  }
  return out;
}

export function translation(tx: number, ty: number): Mat3 {
  // prettier-ignore
  return new Float32Array([
    1, 0, 0,
    0, 1, 0,
    tx, ty, 1,
  ]);
}

export function scaling(sx: number, sy: number): Mat3 {
  // prettier-ignore
  return new Float32Array([
    sx, 0, 0,
    0, sy, 0,
    0, 0, 1,
  ]);
}

export function rotationDeg(deg: number): Mat3 {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // prettier-ignore
  return new Float32Array([
    c, s, 0,
    -s, c, 0,
    0, 0, 1,
  ]);
}

/**
 * Builds the transform for the positioned-quad shader: maps a -1..1 unit
 * quad to a clip's pixel-space box {x,y,w,h,rotationDeg} (top-left origin,
 * y-down, matching NativeClip.transform), then into GL NDC (-1..1, y-up).
 */
export function clipBoxToNdc(
  box: { x: number; y: number; w: number; h: number; rotationDeg: number },
  canvasWidth: number,
  canvasHeight: number
): Mat3 {
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;

  // Unit quad (-1..1, size 2) -> pixel box size.
  let m = scaling(box.w / 2, box.h / 2);
  m = multiply(rotationDeg(box.rotationDeg), m);
  m = multiply(translation(centerX, centerY), m);

  // Pixel space (0..W, 0..H, y-down) -> NDC (-1..1, y-up).
  const px2ndc = new Float32Array([
    2 / canvasWidth, 0, 0,
    0, -2 / canvasHeight, 0,
    -1, 1, 1,
  ]);

  return multiply(px2ndc, m);
}
