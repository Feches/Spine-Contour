import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WIDTH_MIN, defaultWindow, windowRange, clampWindow, dragWindow, windowText, cropRaw, applyWindow, rawFromDecoded,
} from '../renderer/viewer/window-level.js';

// A RawFilm: value(i) = pixels[i] * scale + valueMin. Two pixels wide, one row, unless patched.
function raw(patch = {}) {
  return {
    pixels: new Uint16Array([0, 100]), width: 2, height: 1, valueMin: 0, valueMax: 100,
    bitsStored: 16, window: null, scale: 1, ...patch,
  };
}

// The grey value of each pixel in an RGBA buffer, after checking R = G = B and A = 255.
function greys(rgba) {
  const out = [];
  for (let i = 0; i < rgba.length; i += 4) {
    assert.equal(rgba[i + 1], rgba[i], `G equals R at pixel ${i / 4}`);
    assert.equal(rgba[i + 2], rgba[i], `B equals R at pixel ${i / 4}`);
    assert.equal(rgba[i + 3], 255, `alpha 255 at pixel ${i / 4}`);
    out.push(rgba[i]);
  }
  return out;
}

test('WIDTH_MIN is 64', () => {
  assert.equal(WIDTH_MIN, 64);
});

test('defaultWindow: an 8-bit film opens at width 256, level 128, whatever values it holds', () => {
  assert.deepEqual(defaultWindow(raw({ bitsStored: 8, valueMin: 0, valueMax: 255 })), { width: 256, level: 128 });
  assert.deepEqual(defaultWindow(raw({ bitsStored: 8, valueMin: 12, valueMax: 240 })), { width: 256, level: 128 });
  // No bit depth on record (a 32-bit container) but a 0..255 range reads as 8-bit too.
  assert.deepEqual(defaultWindow(raw({ bitsStored: null, valueMin: 0, valueMax: 255 })), { width: 256, level: 128 });
});

test('an 8-bit DICOM rescaled outside 0..255 takes the general rule (R13)', () => {
  const rescaled = raw({ bitsStored: 8, valueMin: 100, valueMax: 355 });
  assert.deepEqual(defaultWindow(rescaled), { width: 255, level: 228 });
  assert.deepEqual(windowRange(rescaled), { widthMin: 64, widthMax: 256, levelMin: 100, levelMax: 355 });
  const negative = raw({ bitsStored: 8, valueMin: -128, valueMax: 127 });
  assert.deepEqual(windowRange(negative), { widthMin: 64, widthMax: 256, levelMin: -128, levelMax: 127 });
  assert.deepEqual(defaultWindow(negative), { width: 255, level: 0 });
  // A 16-bit film whose values happen to sit inside 0..255 without spanning it is not 8-bit.
  assert.deepEqual(windowRange(raw({ bitsStored: 16, valueMin: 10, valueMax: 200 })), { widthMin: 64, widthMax: 191, levelMin: 10, levelMax: 200 });
});

test('defaultWindow: a DICOM window wins, rounded and clamped to the film range', () => {
  const dicom = raw({ bitsStored: 12, valueMin: 0, valueMax: 4095, window: { center: 2048, width: 4096 } });
  assert.deepEqual(defaultWindow(dicom), { width: 4096, level: 2048 });
  assert.deepEqual(defaultWindow({ ...dicom, window: { center: 1000.6, width: 399.4 } }), { width: 399, level: 1001 });
  assert.deepEqual(defaultWindow({ ...dicom, window: { center: 9000, width: 100000 } }), { width: 4096, level: 4095 });
  // An 8-bit DICOM's own window still wins over the 8-bit default.
  assert.deepEqual(defaultWindow(raw({ bitsStored: 8, valueMin: 0, valueMax: 255, window: { center: 100, width: 80 } })),
    { width: 80, level: 100 });
});

test('defaultWindow: a 16-bit film with no window spans its value range', () => {
  assert.deepEqual(defaultWindow(raw({ valueMin: 0, valueMax: 4000 })), { width: 4000, level: 2000 });
  assert.deepEqual(defaultWindow(raw({ valueMin: -1024, valueMax: 3071 })), { width: 4095, level: 1024 });
  // A nearly flat film still gets the minimum width.
  assert.deepEqual(defaultWindow(raw({ valueMin: 100, valueMax: 120 })), { width: 64, level: 110 });
});

test('windowRange: width 64 to the value range plus one, level across the value range; 8-bit is 0..255', () => {
  assert.deepEqual(windowRange(raw({ valueMin: 0, valueMax: 4000 })), { widthMin: 64, widthMax: 4001, levelMin: 0, levelMax: 4000 });
  assert.deepEqual(windowRange(raw({ valueMin: -1024, valueMax: 3071 })), { widthMin: 64, widthMax: 4096, levelMin: -1024, levelMax: 3071 });
  assert.deepEqual(windowRange(raw({ bitsStored: 8, valueMin: 0, valueMax: 255 })), { widthMin: 64, widthMax: 256, levelMin: 0, levelMax: 255 });
  assert.deepEqual(windowRange(raw({ bitsStored: 8, valueMin: 12, valueMax: 240 })), { widthMin: 64, widthMax: 256, levelMin: 0, levelMax: 255 });
  assert.deepEqual(windowRange(raw({ valueMin: 100, valueMax: 120 })), { widthMin: 64, widthMax: 64, levelMin: 100, levelMax: 120 });
});

test('clampWindow returns integers inside the range and floors the width at 64', () => {
  const range = windowRange(raw({ valueMin: 0, valueMax: 4000 }));
  assert.deepEqual(clampWindow({ width: 10, level: -5 }, range), { width: 64, level: 0 });
  assert.deepEqual(clampWindow({ width: 5000.4, level: 4100 }, range), { width: 4001, level: 4000 });
  assert.deepEqual(clampWindow({ width: 100.6, level: 50.4 }, range), { width: 101, level: 50 });
});

test('dragWindow moves width by 4 per horizontal px and level by 4 per vertical px, clamped', () => {
  const range = windowRange(raw({ valueMin: 0, valueMax: 4000 }));
  assert.deepEqual(dragWindow({ width: 1000, level: 500 }, 10, -5, range), { width: 1040, level: 480 });
  // Dragging up (dy < 0) lowers the level, which brightens the film.
  assert.ok(dragWindow({ width: 1000, level: 500 }, 0, -1, range).level < 500);
  assert.deepEqual(dragWindow({ width: 100, level: 10 }, -100, -100, range), { width: 64, level: 0 });
  assert.deepEqual(dragWindow({ width: 3900, level: 3990 }, 100, 100, range), { width: 4001, level: 4000 });
});

test('windowText is W {width} \u00B7 L {level}', () => {
  assert.equal(windowText({ width: 4096, level: 2048 }), 'W 4096 \u00B7 L 2048');
  assert.equal(windowText({ width: 64, level: -1024 }), 'W 64 \u00B7 L -1024');
});

test('cropRaw keeps the top rows, returns the same object at equal height and refuses a taller height', () => {
  const tall = raw({ pixels: new Uint16Array([1, 2, 3, 4, 5, 6]), width: 2, height: 3 });
  assert.equal(cropRaw(tall, 3), tall);
  const cropped = cropRaw(tall, 2);
  assert.notEqual(cropped, tall);
  assert.equal(cropped.height, 2);
  assert.equal(cropped.width, 2);
  assert.deepEqual([...cropped.pixels], [1, 2, 3, 4]);
  assert.equal(cropped.pixels.buffer, tall.pixels.buffer, 'a view, not a copy');
  assert.equal(cropped.valueMin, tall.valueMin);
  assert.equal(cropped.scale, tall.scale);
  assert.equal(tall.height, 3, 'the input is not changed');
  assert.throws(() => cropRaw(tall, 4), { message: 'The original film is shorter than the stored image.' });
});

test('applyWindow maps the window linearly into grey RGBA with alpha 255', () => {
  const film = raw();
  const out = new Uint8ClampedArray(2 * 1 * 4);
  assert.equal(applyWindow(film, { width: 100, level: 50 }, out), out);
  assert.deepEqual(greys(out), [0, 255]);
  // Values beyond the window clamp to black and white; the middle rounds.
  const ramp = raw({ pixels: new Uint16Array([0, 40, 50, 60, 100]), width: 5, valueMax: 100 });
  assert.deepEqual(greys(applyWindow(ramp, { width: 20, level: 50 }, new Uint8ClampedArray(20))), [0, 0, 128, 255, 255]);
});

test('applyWindow reads value = pixel * scale + valueMin', () => {
  const film = raw({ pixels: new Uint16Array([0, 25]) });
  assert.deepEqual(greys(applyWindow(film, { width: 100, level: 50 })), [0, 64]);
  assert.deepEqual(greys(applyWindow({ ...film, scale: 2 }, { width: 100, level: 50 })), [0, 128], 'a scale of 2 doubles the values');
  const offset = raw({ valueMin: 1000, valueMax: 1100 });
  assert.deepEqual(greys(applyWindow(offset, { width: 100, level: 1050 })), [0, 255]);
});

test('applyWindow writes the same pixels into a buffer that is not 4-byte aligned', () => {
  const film = raw({ pixels: new Uint16Array([0, 25, 50, 100]), width: 2, height: 2 });
  const aligned = applyWindow(film, { width: 100, level: 50 }, new Uint8ClampedArray(16));
  const unaligned = applyWindow(film, { width: 100, level: 50 }, new Uint8ClampedArray(new ArrayBuffer(17), 1, 16));
  assert.deepEqual([...unaligned], [...aligned]);
  assert.deepEqual(greys(aligned), [0, 64, 128, 255]);
});

test('rawFromDecoded views the uint16 bytes, sets the scale and copies an odd offset', () => {
  const bytes = new Uint8Array([0, 0, 100, 0, 1, 1, 255, 255]); // little-endian 0, 100, 257, 65535
  const decoded = { width: 2, height: 2, bitsStored: 16, valueMin: -10, valueMax: 1300000, window: null, scaled: true, pixels: bytes };
  const film = rawFromDecoded(decoded);
  assert.deepEqual([...film.pixels], [0, 100, 257, 65535]);
  assert.equal(film.scale, (1300000 + 10) / 65535);
  assert.deepEqual({ width: film.width, height: film.height, valueMin: film.valueMin, valueMax: film.valueMax, bitsStored: film.bitsStored, window: film.window },
    { width: 2, height: 2, valueMin: -10, valueMax: 1300000, bitsStored: 16, window: null });
  assert.equal(rawFromDecoded({ ...decoded, scaled: false }).scale, 1);
  const odd = new Uint8Array(new ArrayBuffer(9), 1, 8);
  odd.set(bytes);
  assert.deepEqual([...rawFromDecoded({ ...decoded, pixels: odd }).pixels], [0, 100, 257, 65535]);
  assert.throws(() => rawFromDecoded({ ...decoded, pixels: bytes.subarray(0, 6) }), { message: 'The decoded film is incomplete.' });
});
