import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceLabel, simplify, levelContours } from '../renderer/data/contours.js';
import { openEditor, setLevelGeometry } from '../renderer/data/levels.js';

// ---------- fixtures (inline) ----------

// An RGBA buffer the size of the stored image: the red channel holds the label id, as the decoded mask does.
// `blocks` are [labelId, x0, y0, x1, y1] rectangles, inclusive of both corners' pixels.
function maskOf(width, height, blocks) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (const [id, x0, y0, x1, y1] of blocks) {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) pixels[(y * width + x) * 4] = id;
    }
  }
  return pixels;
}

// Twice the signed area of a closed polygon: positive when it runs clockwise on screen (x right, y down).
function shoelace(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum;
}

// The cycle `points` read from its smallest (y, x) point, so a rotation compares equal.
function normalised(points) {
  let start = 0;
  points.forEach((p, i) => {
    const s = points[start];
    if (p[1] < s[1] || (p[1] === s[1] && p[0] < s[0])) start = i;
  });
  return [...points.slice(start), ...points.slice(0, start)];
}

function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function distanceToPolygon(p, polygon) {
  return Math.min(...polygon.map((a, i) => distanceToSegment(p, a, polygon[(i + 1) % polygon.length])));
}

function body(x, y) {
  return {
    superior: [[x, y], [x + 10, y]],
    inferior: [[x, y + 10], [x + 10, y + 10]],
    quadrilateral: [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]],
  };
}

// A lumbar film with L3 missing: L1, L2, L4, L5, S1 and both femoral heads, all the model's.
function lumbarGeometry() {
  return {
    region: 'lumbar',
    vertebrae: { L1: body(10, 10), L2: body(10, 30), L4: body(10, 70), L5: body(10, 90) },
    s1_superior: [[10, 110], [20, 110]],
    femoral_circles: [[10, 140, 5], [20, 140, 5]],
  };
}

function lumbarEditor() {
  const geometry = lumbarGeometry();
  return openEditor({ study: { geometry }, region: 'lumbar', modelGeometry: geometry, saved: null });
}

// ---------- traceLabel ----------

test('traceLabel: a 4x4 block is traced as its four pixel corners, clockwise from the top-left', () => {
  const pixels = maskOf(10, 10, [[20, 3, 3, 6, 6]]);
  const traced = traceLabel(pixels, 10, 10, 20);
  assert.deepEqual(traced, [[3, 3], [7, 3], [7, 7], [3, 7]]);
  assert.equal(shoelace(traced) / 2, 16);
  assert.deepEqual(normalised(simplify(traced)), [[3, 3], [7, 3], [7, 7], [3, 7]]);
});

test('traceLabel: reads the red channel only, and only the asked label id', () => {
  const pixels = maskOf(10, 10, [[20, 1, 1, 3, 3], [21, 5, 5, 8, 8]]);
  // A pixel that is 20 in green and blue but 0 in red is not a label-20 pixel.
  pixels[(8 * 10 + 1) * 4 + 1] = 20;
  pixels[(8 * 10 + 1) * 4 + 2] = 20;
  assert.deepEqual(traceLabel(pixels, 10, 10, 21), [[5, 5], [9, 5], [9, 9], [5, 9]]);
  assert.deepEqual(traceLabel(pixels, 10, 10, 20), [[1, 1], [4, 1], [4, 4], [1, 4]]);
});

test('traceLabel: an L-shaped component has six corners after simplify', () => {
  // A 5-wide column x 5..9, y 5..24, and a foot x 5..24, y 20..24.
  const pixels = maskOf(30, 30, [[20, 5, 5, 9, 24], [20, 5, 20, 24, 24]]);
  const traced = traceLabel(pixels, 30, 30, 20);
  assert.deepEqual(traced, [[5, 5], [10, 5], [10, 20], [25, 20], [25, 25], [5, 25]]);
  assert.equal(shoelace(traced) / 2, 5 * 20 + 15 * 5);
  const simple = simplify(traced);
  assert.equal(simple.length, 6);
  assert.deepEqual(normalised(simple), [[5, 5], [10, 5], [10, 20], [25, 20], [25, 25], [5, 25]]);
});

test('traceLabel: with two components the larger one is traced', () => {
  const pixels = maskOf(20, 20, [[20, 2, 2, 5, 5], [20, 10, 10, 11, 11]]);
  assert.deepEqual(traceLabel(pixels, 20, 20, 20), [[2, 2], [6, 2], [6, 6], [2, 6]]);
  // The order in the buffer does not matter: the larger block is the later one here.
  const later = maskOf(20, 20, [[20, 2, 2, 3, 3], [20, 10, 10, 14, 14]]);
  assert.deepEqual(traceLabel(later, 20, 20, 20), [[10, 10], [15, 10], [15, 15], [10, 15]]);
});

test('traceLabel: components that touch only at a corner are two components (4-connectivity)', () => {
  const pixels = maskOf(12, 12, [[20, 1, 1, 3, 3], [20, 4, 4, 5, 5]]);
  assert.deepEqual(traceLabel(pixels, 12, 12, 20), [[1, 1], [4, 1], [4, 4], [1, 4]]);
});

test('traceLabel: a component with fewer than three pixels, or none, is null', () => {
  assert.equal(traceLabel(maskOf(10, 10, [[20, 4, 4, 4, 4]]), 10, 10, 20), null);
  assert.equal(traceLabel(maskOf(10, 10, [[20, 4, 4, 5, 4]]), 10, 10, 20), null);
  assert.equal(traceLabel(maskOf(10, 10, []), 10, 10, 20), null);
  assert.equal(traceLabel(maskOf(10, 10, [[21, 3, 3, 6, 6]]), 10, 10, 20), null);
  // Two single pixels are two components of one pixel each, not a component of two.
  assert.equal(traceLabel(maskOf(10, 10, [[20, 1, 1, 1, 1], [20, 5, 5, 5, 5]]), 10, 10, 20), null);
});

test('traceLabel: three pixels in a row is the smallest traced component', () => {
  const traced = traceLabel(maskOf(10, 10, [[20, 2, 4, 4, 4]]), 10, 10, 20);
  assert.deepEqual(traced, [[2, 4], [5, 4], [5, 5], [2, 5]]);
});

test('traceLabel: a component on the image border is closed along the border', () => {
  const pixels = maskOf(6, 6, [[20, 0, 0, 2, 2]]);
  assert.deepEqual(traceLabel(pixels, 6, 6, 20), [[0, 0], [3, 0], [3, 3], [0, 3]]);
  const far = maskOf(6, 6, [[20, 3, 3, 5, 5]]);
  assert.deepEqual(traceLabel(far, 6, 6, 20), [[3, 3], [6, 3], [6, 6], [3, 6]]);
  const whole = maskOf(4, 3, [[20, 0, 0, 3, 2]]);
  assert.deepEqual(traceLabel(whole, 4, 3, 20), [[0, 0], [4, 0], [4, 3], [0, 3]]);
});

test('traceLabel: holes are ignored, the outer shape is traced', () => {
  const pixels = maskOf(10, 10, [[20, 2, 2, 6, 6]]);
  for (let y = 3; y <= 5; y += 1) for (let x = 3; x <= 5; x += 1) pixels[(y * 10 + x) * 4] = 0;
  const traced = traceLabel(pixels, 10, 10, 20);
  assert.deepEqual(traced, [[2, 2], [7, 2], [7, 7], [2, 7]]);
  assert.equal(shoelace(traced) / 2, 25);
});

test('traceLabel: a notch keeps its corners and the walk stays on the outline', () => {
  // A 6x6 block with a 2x2 bite out of the middle of the top edge: x 2..7, y 2..7 minus x 4..5, y 2..3.
  const pixels = maskOf(12, 12, [[20, 2, 2, 7, 7]]);
  for (let y = 2; y <= 3; y += 1) for (let x = 4; x <= 5; x += 1) pixels[(y * 12 + x) * 4] = 0;
  const traced = traceLabel(pixels, 12, 12, 20);
  assert.deepEqual(traced, [[2, 2], [4, 2], [4, 4], [6, 4], [6, 2], [8, 2], [8, 8], [2, 8]]);
  assert.equal(shoelace(traced) / 2, 36 - 4);
});

test('traceLabel: a component that touches itself at a corner is traced around its outside', () => {
  // A 4-connected C of 11 pixels whose two ends, (1,3) and (2,4), meet only diagonally. The inside is open to the
  // outside through that corner (the background is 8-connected), so the outline is one polygon that passes through
  // the corner (2,4) twice, and it encloses exactly the 11 pixels.
  const pixels = maskOf(8, 8, [[20, 1, 1, 4, 1], [20, 4, 2, 4, 4], [20, 2, 4, 3, 4], [20, 1, 2, 1, 3]]);
  const traced = traceLabel(pixels, 8, 8, 20);
  assert.deepEqual(traced, [[1, 1], [5, 1], [5, 5], [2, 5], [2, 4], [4, 4], [4, 2], [2, 2], [2, 4], [1, 4]]);
  assert.equal(shoelace(traced) / 2, 11);
});

test('traceLabel: does not change its input', () => {
  const pixels = maskOf(10, 10, [[20, 3, 3, 6, 6]]);
  const before = Uint8ClampedArray.from(pixels);
  traceLabel(pixels, 10, 10, 20);
  assert.deepEqual(pixels, before);
});

test('traceLabel: a large component does not overflow the stack', () => {
  const size = 600;
  const pixels = maskOf(size, size, [[20, 0, 0, size - 1, size - 1]]);
  const traced = traceLabel(pixels, size, size, 20);
  assert.deepEqual(traced, [[0, 0], [size, 0], [size, size], [0, size]]);
});

// ---------- simplify ----------

test('simplify: fewer than four points come back unchanged', () => {
  const triangle = [[0, 0], [10, 0], [5, 8]];
  assert.deepEqual(simplify(triangle), triangle);
  assert.deepEqual(simplify([]), []);
  assert.deepEqual(simplify([[1, 1], [2, 2]]), [[1, 1], [2, 2]]);
});

test('simplify: a 20-point circle-ish polygon loses points and keeps at least three', () => {
  const circle = Array.from({ length: 20 }, (_, i) => {
    const angle = (i / 20) * 2 * Math.PI;
    return [50 + 10 * Math.cos(angle), 50 + 10 * Math.sin(angle)];
  });
  const copy = circle.map(p => [...p]);
  const simple = simplify(circle, 1.5);
  assert.ok(simple.length < circle.length, `${simple.length} < 20`);
  assert.ok(simple.length >= 3);
  assert.deepEqual(circle, copy, 'the input is not mutated');
  // Every point of the input is within the tolerance of the simplified outline, and the simplified points are the input's.
  for (const p of circle) assert.ok(distanceToPolygon(p, simple) <= 1.5 + 1e-9);
  for (const p of simple) assert.ok(circle.some(q => q[0] === p[0] && q[1] === p[1]));
  // They keep the input's order.
  const indices = simple.map(p => circle.findIndex(q => q[0] === p[0] && q[1] === p[1]));
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
});

test('simplify: a tolerance of zero keeps every corner that is not collinear', () => {
  const staircase = [[0, 0], [4, 0], [4, 2], [8, 2], [8, 4], [0, 4]];
  assert.deepEqual(normalised(simplify(staircase, 0)), normalised(staircase));
});

test('simplify: a polygon thinner than the tolerance still has three points', () => {
  const bar = traceLabel(maskOf(10, 10, [[20, 2, 4, 4, 4]]), 10, 10, 20);
  const simple = simplify(bar, 1.5);
  assert.equal(simple.length, 3);
  for (const p of simple) assert.ok(bar.some(q => q[0] === p[0] && q[1] === p[1]));
  const sliver = [[0, 0], [100, 0], [100, 0.5], [0, 0.5]];
  assert.ok(simplify(sliver, 5).length >= 3);
});

test('simplify: identical points do not break it', () => {
  const same = [[3, 3], [3, 3], [3, 3], [3, 3], [3, 3]];
  assert.ok(simplify(same).length >= 3);
});

test('simplify: a diagonal staircase collapses to its end corners', () => {
  // A mask band running along a diagonal: the traced outline has many unit steps and simplify smooths them.
  const blocks = [];
  for (let i = 0; i < 20; i += 1) blocks.push([20, 5 + i, 5 + i, 8 + i, 8 + i]);
  const traced = traceLabel(maskOf(40, 40, blocks), 40, 40, 20);
  const simple = simplify(traced, 1.5);
  assert.ok(simple.length < traced.length / 3, `${simple.length} of ${traced.length}`);
  assert.ok(simple.length >= 3);
});

// ---------- levelContours ----------

const LABELS = { L1: 20, L2: 21, L3: 22, L4: 23, L5: 24, S1: 25 };

test('levelContours: a segmented level gets a polygon, every other code gets null', () => {
  const pixels = maskOf(10, 10, [[20, 3, 3, 6, 6], [21, 0, 0, 1, 1], [22, 7, 7, 9, 9], [25, 0, 8, 2, 9]]);
  let editor = lumbarEditor();
  // L3: the model never found it, the annotator placed it (manual).
  editor = setLevelGeometry(editor, 'L3', body(10, 50));
  // L2: the model found it, the annotator moved a corner (edited).
  const moved = { ...editor.levels.L2.geometry, superior: [[12, 30], editor.levels.L2.geometry.superior[1]] };
  editor = setLevelGeometry(editor, 'L2', moved);
  const contours = levelContours(pixels, 10, 10, LABELS, editor);
  assert.deepEqual(Object.keys(contours), ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1', 'T4', 'L1', 'L2', 'L3', 'L4', 'L5', 'S1', 'FH1', 'FH2']);
  assert.deepEqual(normalised(contours.L1), [[3, 3], [7, 3], [7, 7], [3, 7]]);
  assert.equal(contours.L2, null, 'an edited level');
  assert.equal(contours.L3, null, 'a manual level');
  assert.equal(contours.S1, null, 'an endplate');
  assert.equal(contours.FH1, null, 'a femoral head');
  assert.equal(contours.FH2, null);
  for (const code of ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1', 'T4', 'L4', 'L5']) assert.equal(contours[code], null, code);
});

test('levelContours: every segmented body level with a mask gets its own polygon', () => {
  const pixels = maskOf(20, 20, [[20, 1, 1, 5, 5], [21, 8, 8, 12, 12], [23, 14, 1, 18, 5], [24, 1, 14, 5, 18]]);
  const contours = levelContours(pixels, 20, 20, LABELS, lumbarEditor());
  assert.deepEqual(normalised(contours.L1), [[1, 1], [6, 1], [6, 6], [1, 6]]);
  assert.deepEqual(normalised(contours.L2), [[8, 8], [13, 8], [13, 13], [8, 13]]);
  assert.equal(contours.L3, null, 'no model geometry and no pixels');
  assert.deepEqual(normalised(contours.L4), [[14, 1], [19, 1], [19, 6], [14, 6]]);
  assert.deepEqual(normalised(contours.L5), [[1, 14], [6, 14], [6, 19], [1, 19]]);
});

test('levelContours: a segmented level with no pixels of its label, or no usable label id, is null', () => {
  const pixels = maskOf(10, 10, [[20, 3, 3, 6, 6]]);
  const editor = lumbarEditor();
  assert.equal(levelContours(pixels, 10, 10, { L1: 30 }, editor).L1, null);
  assert.equal(levelContours(pixels, 10, 10, { L1: '20' }, editor).L1, null);
  assert.equal(levelContours(pixels, 10, 10, {}, editor).L1, null);
  assert.equal(levelContours(pixels, 10, 10, { L1: 20 }, editor).L1 !== null, true);
});

test('levelContours: a hidden segmented level is not_visible, so it has no contour', () => {
  const pixels = maskOf(10, 10, [[20, 3, 3, 6, 6]]);
  const editor = lumbarEditor();
  const hidden = { ...editor, levels: { ...editor.levels, L1: { ...editor.levels.L1, visible: false } } };
  assert.equal(levelContours(pixels, 10, 10, { L1: 20 }, hidden).L1, null);
});

test('levelContours: no mask or no labels gives every code null', () => {
  const pixels = maskOf(10, 10, [[20, 3, 3, 6, 6]]);
  const editor = lumbarEditor();
  for (const contours of [
    levelContours(pixels, 10, 10, null, editor),
    levelContours(null, 10, 10, { L1: 20 }, editor),
    levelContours(null, 10, 10, null, editor),
  ]) {
    assert.equal(Object.keys(contours).length, 16);
    assert.ok(Object.values(contours).every(value => value === null));
  }
});

test('levelContours: does not change the editor, the labels or the mask', () => {
  const pixels = maskOf(10, 10, [[20, 3, 3, 6, 6]]);
  const before = Uint8ClampedArray.from(pixels);
  const editor = lumbarEditor();
  const snapshot = JSON.stringify(editor);
  const labels = { L1: 20 };
  levelContours(pixels, 10, 10, labels, editor);
  assert.equal(JSON.stringify(editor), snapshot);
  assert.deepEqual(labels, { L1: 20 });
  assert.deepEqual(pixels, before);
});
