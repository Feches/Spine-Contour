// Window / level for the stage's film layer (level editor, plan D1 and D11; handoff section 6).
// Display only: nothing here reaches a measurement, the store's geometry or the label record, and
// nothing is persisted. The pixels are the ORIGINAL film's, decoded by the backend's POST /decode
// (backend/decode.py), never the stored 8-bit PNG. Pure: no DOM.

/**
 * The decoded original, held in screens/analysis.js's image cache as `images.raw`, never in the store.
 * value(i) = pixels[i] * scale + valueMin; `scale` is 1 unless the backend squeezed a range wider than
 * 16 bits into 0..65535.
 * @typedef {{pixels: Uint16Array, width: number, height: number, valueMin: number, valueMax: number,
 *            bitsStored: number|null, window: {center: number, width: number}|null, scale: number}} RawFilm
 */

export const WIDTH_MIN = 64;

const UINT16_MAX = 65535;

// An 8-bit film (a PNG or JPEG import, or an 8-bit DICOM) windows over 0..255 whatever values it
// happens to hold; so does a film with no bit depth on record whose values are exactly 0..255.
function eightBit(raw) {
  return raw.bitsStored === 8 || (raw.valueMin === 0 && raw.valueMax === 255);
}

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function validWindow(window) {
  return Boolean(window) && Number.isFinite(window.center) && Number.isFinite(window.width) && window.width > 0;
}

// The slider bounds: width from 64 to the value range plus one, level across the value range.
export function windowRange(raw) {
  if (eightBit(raw)) return { widthMin: WIDTH_MIN, widthMax: 256, levelMin: 0, levelMax: 255 };
  return {
    widthMin: WIDTH_MIN,
    widthMax: Math.max(WIDTH_MIN, Math.round(raw.valueMax - raw.valueMin) + 1),
    levelMin: Math.round(raw.valueMin),
    levelMax: Math.round(raw.valueMax),
  };
}

export function clampWindow(window, range) {
  return {
    width: clampInt(window.width, range.widthMin, range.widthMax),
    level: clampInt(window.level, range.levelMin, range.levelMax),
  };
}

// The window a film opens at: the DICOM's own WindowCenter / WindowWidth when it has them, else
// 0..255 for an 8-bit film, else the full value range. Always within windowRange(raw).
export function defaultWindow(raw) {
  const range = windowRange(raw);
  if (validWindow(raw.window)) return clampWindow({ width: raw.window.width, level: raw.window.center }, range);
  if (eightBit(raw)) return { width: 256, level: 128 };
  return clampWindow({
    width: Math.max(WIDTH_MIN, Math.round(raw.valueMax - raw.valueMin)),
    level: Math.round((raw.valueMin + raw.valueMax) / 2),
  }, range);
}

// A drag on the film: 4 per pixel, left-right for width, up-down for level. Dragging up (dy < 0)
// lowers the level, which brightens the film.
export function dragWindow(start, dx, dy, range) {
  return clampWindow({ width: start.width + 4 * dx, level: start.level + 4 * dy }, range);
}

// The viewer chip: 'W 4096 \u00B7 L 2048' (a middle dot between spaces).
export function windowText(window) {
  return `W ${Math.round(window.width)} \u00B7 L ${Math.round(window.level)}`;
}

// The top `height` rows of the decoded original. A lumbar film stored with Toolbar removal on is
// shorter than its original (the strip comes off the bottom; the origin stays put), and the film
// layer must line up with the stored image the geometry is drawn in. The rows are a view, not a copy.
export function cropRaw(raw, height) {
  if (height === raw.height) return raw;
  if (height > raw.height) throw new Error('The original film is shorter than the stored image.');
  return { ...raw, height, pixels: raw.pixels.subarray(0, raw.width * height) };
}

// The decode-film IPC result (renderer/api.js decodeFilm) as a RawFilm. The bytes are little-endian
// uint16; a Uint16Array view needs an even byte offset, so an odd one is copied first. (Every
// platform Electron ships on is little-endian, so the view reads the bytes as the backend wrote them.)
export function rawFromDecoded(decoded) {
  const { width, height } = decoded;
  let bytes = decoded.pixels;
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1
      || !ArrayBuffer.isView(bytes) || bytes.BYTES_PER_ELEMENT !== 1 || bytes.byteLength !== width * height * 2) {
    throw new Error('The decoded film is incomplete.');
  }
  if (bytes.byteOffset % 2 !== 0) bytes = bytes.slice();
  const valueMin = decoded.valueMin;
  const valueMax = decoded.valueMax;
  return {
    pixels: new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2),
    width, height, valueMin, valueMax,
    bitsStored: decoded.bitsStored ?? null,
    window: validWindow(decoded.window) ? { center: decoded.window.center, width: decoded.window.width } : null,
    scale: decoded.scaled ? (valueMax - valueMin) / UINT16_MAX : 1,
  };
}

// Reused across calls (one slider tick is one call): grey per stored pixel value, and the same as
// packed RGBA for the fast path. Rebuilt in full on every call, so no entry outlives its window.
const LUT_GREY = new Uint8Array(UINT16_MAX + 1);
const LUT_RGBA = new Uint32Array(UINT16_MAX + 1);
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

// The linear LUT on the film layer: v = round(255 * clamp((value - (level - width / 2)) / width, 0, 1)),
// R = G = B = v, A = 255, into `out` (width * height * 4 bytes), which is returned.
export function applyWindow(raw, window, out = new Uint8ClampedArray(raw.width * raw.height * 4)) {
  const count = raw.width * raw.height;
  if (out.length !== count * 4) throw new Error('The window buffer does not match the film.');
  const width = Math.max(1, window.width);
  const low = window.level - width / 2;
  const { scale, valueMin } = raw;
  for (let p = 0; p <= UINT16_MAX; p += 1) {
    const t = (p * scale + valueMin - low) / width;
    const v = Math.round(255 * (t <= 0 ? 0 : t >= 1 ? 1 : t));
    LUT_GREY[p] = v;
    LUT_RGBA[p] = (0xFF000000 | (v << 16) | (v << 8) | v) >>> 0;
  }
  const pixels = raw.pixels;
  if (LITTLE_ENDIAN && out.byteOffset % 4 === 0) {
    const packed = new Uint32Array(out.buffer, out.byteOffset, count);
    for (let i = 0; i < count; i += 1) packed[i] = LUT_RGBA[pixels[i]];
    return out;
  }
  for (let i = 0, o = 0; i < count; i += 1, o += 4) {
    const v = LUT_GREY[pixels[i]];
    out[o] = v;
    out[o + 1] = v;
    out[o + 2] = v;
    out[o + 3] = 255;
  }
  return out;
}
