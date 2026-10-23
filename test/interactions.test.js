import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ZOOM_MIN, ZOOM_MAX, clampZoom, zoomIn, zoomOut, zoomAbout, isChordHeld, isDoubleClick, exceedsSlop, vertebraAt, arrowKeyDelta,
  debounce,
} from '../renderer/viewer/interactions.js';

// The transform is `translate(pan) scale(zoom)` about the stage CENTRE, so a host-local point
// p lands at C + P + z*(p - C). Working in centre-relative coordinates (offset = p - C) that is
// just offset*z + P. This oracle is deliberately written from the CSS, not from zoomAbout's
// algebra, so it can disagree with it.
function project(view, offset) {
  return [offset[0] * view.zoom + view.panX, offset[1] * view.zoom + view.panY];
}

// Where the film point currently under `cursor` sits, in centre-relative stage coordinates.
function pointUnder(view, cursor) {
  return [(cursor[0] - view.panX) / view.zoom, (cursor[1] - view.panY) / view.zoom];
}

test('isChordHeld is true only when BOTH the primary and secondary bits are set', () => {
  assert.equal(isChordHeld(0), false);
  assert.equal(isChordHeld(1), false); // left alone
  assert.equal(isChordHeld(2), false); // right alone
  assert.equal(isChordHeld(4), false); // middle alone
  assert.equal(isChordHeld(3), true); // left + right
  assert.equal(isChordHeld(7), true); // left + right + middle still chords
  assert.equal(isChordHeld(5), false); // left + middle is not a chord
  assert.equal(isChordHeld(6), false); // right + middle is not a chord
});

test('zoomAbout keeps the point under the cursor stationary, at any pan and any offset', () => {
  for (const view of [
    { zoom: 1, panX: 0, panY: 0 },
    { zoom: 1.2, panX: 100, panY: -40 },
    { zoom: 0.8, panX: -55, panY: 33 },
    { zoom: 1.5625, panX: 7, panY: 210 },
  ]) {
    for (const offset of [[0, 0], [200, -200], [-380, 90], [17, 17]]) {
      for (const direction of [1, -1]) {
        const anchored = pointUnder(view, offset);
        const next = zoomAbout(view, direction, offset[0], offset[1]);
        const after = project(next, anchored);
        assert.ok(Math.abs(after[0] - offset[0]) < 1e-9, `x drifted: ${after[0]} vs ${offset[0]}`);
        assert.ok(Math.abs(after[1] - offset[1]) < 1e-9, `y drifted: ${after[1]} vs ${offset[1]}`);
      }
    }
  }
});

test('zoomAbout at the stage centre with no pan reduces exactly to the old centre-anchored zoom', () => {
  const next = zoomAbout({ zoom: 1, panX: 0, panY: 0 }, 1, 0, 0);
  assert.equal(next.panX, 0);
  assert.equal(next.panY, 0);
  assert.equal(next.zoom, zoomIn(1));
});

test('zoomAbout at the stage centre WITH a pan scales the pan -- it does not leave it alone', () => {
  // The tempting "if the cursor is centred, nothing moves" shortcut is wrong: when the film is
  // panned, the point under the stage centre is not the film's centre.
  const next = zoomAbout({ zoom: 1, panX: 100, panY: 0 }, 1, 0, 0);
  assert.equal(next.panX, 100 * (zoomIn(1) / 1));
});

test('zoomAbout leaves the pan untouched when the clamp bites, so repeated ticks cannot drift', () => {
  const atMax = { zoom: ZOOM_MAX, panX: 42, panY: -13 };
  const inAtMax = zoomAbout(atMax, 1, 300, 300);
  assert.equal(inAtMax.zoom, ZOOM_MAX);
  assert.equal(inAtMax.panX, 42);
  assert.equal(inAtMax.panY, -13);

  const atMin = { zoom: ZOOM_MIN, panX: 42, panY: -13 };
  const outAtMin = zoomAbout(atMin, -1, 300, 300);
  assert.equal(outAtMin.zoom, ZOOM_MIN);
  assert.equal(outAtMin.panX, 42);
  assert.equal(outAtMin.panY, -13);
});

test('zoomAbout uses the POST-clamp zoom, so a partly-clamped step still anchors exactly', () => {
  // 7.2 * 1.25 would be 9; the clamp cuts it to 8, so k is 8/7.2 = 1.111..., not 1.25.
  const view = { zoom: 7.2, panX: 30, panY: 0 };
  const anchored = pointUnder(view, [200, 0]);
  const next = zoomAbout(view, 1, 200, 0);
  assert.equal(next.zoom, ZOOM_MAX);
  assert.ok(Math.abs(project(next, anchored)[0] - 200) < 1e-9);
});

test('the wheel and the toolbar buttons reach bit-identical zooms', () => {
  // Guards the direction form. A factor form (zoom * (1/ZOOM_STEP)) drifts in the last bits.
  for (const z of [1, 1.2, 1.4, 0.8, 2.2, ZOOM_MAX, ZOOM_MIN]) {
    assert.equal(zoomAbout({ zoom: z, panX: 0, panY: 0 }, 1, 0, 0).zoom, zoomIn(z));
    assert.equal(zoomAbout({ zoom: z, panX: 0, panY: 0 }, -1, 0, 0).zoom, zoomOut(z));
  }
});

test('zoomAbout does not mutate the view it is given', () => {
  // Load-bearing: setState's functional form hands the updater the RAW store object.
  const frozen = Object.freeze({ zoom: 1.2, panX: 30, panY: -10 });
  const next = zoomAbout(frozen, 1, 120, 45);
  assert.equal(frozen.zoom, 1.2);
  assert.equal(frozen.panX, 30);
  assert.equal(frozen.panY, -10);
  assert.notEqual(next.panX, 30);
});

test('clampZoom clamps to the 0.6..8 range and passes through in between', () => {
  assert.equal(clampZoom(0.1), ZOOM_MIN);
  assert.equal(clampZoom(9), ZOOM_MAX);
  assert.equal(clampZoom(8), 8);
  assert.equal(clampZoom(2.5), 2.5);
  assert.equal(clampZoom(1.2), 1.2);
});

test('zoomIn and zoomOut step by 1.25x and clamp at the bounds', () => {
  assert.ok(Math.abs(zoomIn(1) - 1.25) < 1e-9);
  assert.ok(Math.abs(zoomOut(1) - 0.8) < 1e-9);
  assert.equal(zoomIn(ZOOM_MAX), ZOOM_MAX);
  assert.equal(zoomIn(7.2), ZOOM_MAX);
  assert.equal(zoomOut(0.6), ZOOM_MIN);
});

function fakeGeometry() {
  return {
    vertebrae: {
      L1: { quadrilateral: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      L2: { quadrilateral: [[0, 20], [10, 20], [10, 30], [0, 30]] },
      L3: { quadrilateral: [[0, 40], [10, 40], [10, 50], [0, 50]] },
      L4: { quadrilateral: [[0, 60], [10, 60], [10, 70], [0, 70]] },
      L5: { quadrilateral: [[0, 80], [10, 80], [10, 90], [0, 90]] },
    },
    s1_superior: [[0, 100], [10, 100]],
  };
}

test('vertebraAt returns the level whose quadrilateral contains the point', () => {
  const geometry = fakeGeometry();
  assert.equal(vertebraAt(geometry, [5, 25]), 'L2');
  assert.equal(vertebraAt(geometry, [5, 65]), 'L4');
});

test('vertebraAt returns S1 near the S1 superior segment and null elsewhere', () => {
  const geometry = fakeGeometry();
  assert.equal(vertebraAt(geometry, [5, 102], 20), 'S1');
  assert.equal(vertebraAt(geometry, [5000, 5000]), null);
});

test('vertebraAt hits a body with no quadrilateral within the radius of its one endplate', () => {
  const geometry = { region: 'lumbar', vertebrae: { L2: { superior: [[0, 20], [40, 20]], inferior: null, quadrilateral: null } }, s1_superior: null };
  assert.equal(vertebraAt(geometry, [20, 25]), 'L2');
  assert.equal(vertebraAt(geometry, [20, 60]), null);
});

test('vertebraAt: a whole body is hit by its polygon alone; a bad endplate pair is skipped, never thrown on', () => {
  const quad = [[0, 20], [40, 20], [40, 50], [0, 50]];
  const whole = { region: 'lumbar', vertebrae: { L2: { superior: [[0, 20], [40, 20]], inferior: [[0, 50], [40, 50]], quadrilateral: quad } }, s1_superior: null };
  assert.equal(vertebraAt(whole, [20, 15]), null, '5 px above the superior line, outside the polygon');
  assert.equal(vertebraAt(whole, [20, 30]), 'L2');
  const mixed = { region: 'lumbar', vertebrae: { L3: { superior: [[1, 2]], inferior: [[0, 50], [40, 50]], quadrilateral: null } }, s1_superior: null };
  assert.equal(vertebraAt(mixed, [20, 55]), 'L3', 'the good inferior is used');
  const bad = { region: 'lumbar', vertebrae: { L3: { superior: 'bad', inferior: null, quadrilateral: null } }, s1_superior: null };
  assert.equal(vertebraAt(bad, [20, 55]), null);
});

test('arrowKeyDelta maps arrow keys to 1px deltas', () => {
  assert.deepEqual(arrowKeyDelta('ArrowUp', false), { dx: 0, dy: -1 });
  assert.deepEqual(arrowKeyDelta('ArrowDown', false), { dx: 0, dy: 1 });
  assert.deepEqual(arrowKeyDelta('ArrowLeft', false), { dx: -1, dy: 0 });
  assert.deepEqual(arrowKeyDelta('ArrowRight', false), { dx: 1, dy: 0 });
});

test('arrowKeyDelta maps shift+arrow keys to 10px deltas', () => {
  assert.deepEqual(arrowKeyDelta('ArrowUp', true), { dx: 0, dy: -10 });
  assert.deepEqual(arrowKeyDelta('ArrowRight', true), { dx: 10, dy: 0 });
});

test('arrowKeyDelta returns null for non-arrow keys', () => {
  assert.equal(arrowKeyDelta('Tab', false), null);
  assert.equal(arrowKeyDelta('a', false), null);
});

test('debounce collapses rapid calls into one, using the last arguments', async () => {
  const calls = [];
  const debounced = debounce((value) => calls.push(value), 20);
  debounced('a');
  debounced('b');
  debounced('c');
  assert.equal(calls.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(calls, ['c']);
});

test('debounce.cancel prevents a pending call from firing', async () => {
  const calls = [];
  const debounced = debounce((value) => calls.push(value), 20);
  debounced('x');
  debounced.cancel();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(calls, []);
});

// (Gate feedback G4, 2026-10-11; plan D17) Browsers fire no dblclick for the secondary button, so the stage asks
// isDoubleClick of two right presses: the same button, within 400 ms and 6 px of the first.
test('isDoubleClick: the same button within the time and the distance is a double click', () => {
  const first = { time: 1000, clientX: 200, clientY: 300, button: 2 };
  assert.equal(isDoubleClick(first, { time: 1250, clientX: 203, clientY: 298, button: 2 }), true);
  assert.equal(isDoubleClick(first, { time: 1400, clientX: 200, clientY: 300, button: 2 }), true, 'exactly 400 ms');
  assert.equal(isDoubleClick(first, { time: 1001, clientX: 206, clientY: 300, button: 2 }), true, 'exactly 6 px');
  assert.equal(isDoubleClick({ ...first, button: 0 }, { time: 1100, clientX: 200, clientY: 300, button: 0 }), true, 'any button, matched');
});

test('isDoubleClick: a different button, a press too late, too far or out of order is not', () => {
  const first = { time: 1000, clientX: 200, clientY: 300, button: 2 };
  assert.equal(isDoubleClick(first, { time: 1100, clientX: 200, clientY: 300, button: 0 }), false, 'another button');
  assert.equal(isDoubleClick(first, { time: 1401, clientX: 200, clientY: 300, button: 2 }), false, 'too late');
  assert.equal(isDoubleClick(first, { time: 1100, clientX: 205, clientY: 305, button: 2 }), false, 'too far (7.07 px)');
  assert.equal(isDoubleClick(first, { time: 999, clientX: 200, clientY: 300, button: 2 }), false, 'earlier than the first');
  assert.equal(isDoubleClick(null, first), false, 'no first press');
  assert.equal(isDoubleClick(first, null), false, 'no second press');
});

test('isDoubleClick takes its limits as options', () => {
  const first = { time: 0, clientX: 0, clientY: 0, button: 2 };
  const second = { time: 500, clientX: 10, clientY: 0, button: 2 };
  assert.equal(isDoubleClick(first, second), false);
  assert.equal(isDoubleClick(first, second, { withinMs: 500, withinPx: 10 }), true);
  assert.equal(isDoubleClick(first, second, { withinMs: 499, withinPx: 10 }), false, 'one millisecond too late');
  assert.equal(isDoubleClick(first, second, { withinMs: 500 }), false, 'the other limit keeps its default');
});

// (Ruling R37, 2026-10-11) A right press windows the film only once the pointer has moved 3 CSS px from it, so a
// stray right click or a right-first chord formed before any movement decodes nothing.
test('exceedsSlop: 3 CSS px or more from the press, in a straight line', () => {
  const press = { clientX: 200, clientY: 300 };
  assert.equal(exceedsSlop(press, { clientX: 200, clientY: 300 }), false, 'no movement');
  assert.equal(exceedsSlop(press, { clientX: 202.9, clientY: 300 }), false, '2.9 px');
  assert.equal(exceedsSlop(press, { clientX: 197.9, clientY: 302.1 }), false, '2.97 px on the diagonal');
  assert.equal(exceedsSlop(press, { clientX: 203, clientY: 300 }), true, 'exactly 3 px');
  assert.equal(exceedsSlop(press, { clientX: 200, clientY: 297 }), true, 'up 3 px');
  assert.equal(exceedsSlop(press, { clientX: 197.8, clientY: 302.2 }), true, '3.11 px on the diagonal');
});

test('exceedsSlop takes its distance as an option and reads only clientX and clientY', () => {
  const press = { clientX: 0, clientY: 0, button: 2, time: 5 };
  assert.equal(exceedsSlop(press, { clientX: 4, clientY: 0 }, 5), false);
  assert.equal(exceedsSlop(press, { clientX: 3, clientY: 4 }, 5), true, '5 px, the 3-4-5 triangle');
  assert.equal(exceedsSlop(press, { clientX: 1, clientY: 0, buttons: 2 }, 1), true);
});
