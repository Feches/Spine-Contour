import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RIM_HANDLES, levelHandles, handleAt, moveHandle, nudgeHandle, hitTestLevelHandles, handleOrder, nextLevelHandle,
} from '../renderer/viewer/level-handles.js';
import {
  LEVEL_CODES, openEditor, selectLevel, startPlacing, cancelPlacing, toggleVisible, toggleGroup,
  synthesizeRim, fitRim,
} from '../renderer/data/levels.js';

// ---------- fixtures (inline: the shapes the level model stores) ----------

const body = (x, y) => ({ superior: [[x, y], [x + 10, y]], inferior: [[x, y + 10], [x + 10, y + 10]] });
const c2 = { inferior: [[40, 20], [50, 20]], centroid: [45, 12] };
const endplate = { superior: [[10, 110], [20, 112]] };
const centroid = { centroid: [30, 40] };
const circle = { center: [50, 50], radius: 10, rim: null };

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// The study geometry the app stores: a lumbar film with L3 missing (L1, L2, L4, L5, S1, both heads).
function lumbarGeometry() {
  const frame = (x, y) => ({ ...body(x, y), quadrilateral: null });
  return {
    region: 'lumbar',
    vertebrae: { L1: frame(10, 10), L2: frame(10, 30), L4: frame(10, 70), L5: frame(10, 90) },
    s1_superior: [[10, 110], [20, 110]],
    femoral_circles: [[10, 140, 5], [20, 140, 5]],
  };
}

function lumbarEditor() {
  return openEditor({
    study: { id: 'SP-0001', geometry: lumbarGeometry(), labelFile: null },
    region: 'lumbar', modelGeometry: lumbarGeometry(), saved: null,
  });
}

// A full-spine editor holding every kind of level: C2 and C3 from the study, T1 and T4 from a saved record.
function everyKindEditor() {
  const geometry = {
    region: 'full_spine',
    vertebrae: {
      C2: { superior: null, inferior: [[40, 20], [50, 20]], quadrilateral: null },
      C3: { ...body(10, 30), quadrilateral: null },
    },
    c2_centroid: [45, 12],
    s1_superior: [[10, 110], [20, 110]],
    femoral_circles: [[10, 140, 5]],
  };
  const saved = {
    file: null,
    levels: {
      T1: { visible: true, source: 'annotator', geometry: endplate },
      T4: { visible: true, source: 'annotator', geometry: centroid },
    },
  };
  return openEditor({ study: { id: 'SP-0003', geometry, labelFile: null }, region: 'full_spine', modelGeometry: geometry, saved });
}

// A real editor with the focused handle set to one the caller names (one field overridden, nothing else hand-written).
const at = (editor, code, handle) => ({ ...editor, selected: code, handle: { code, handle } });

const fakeCanvas = (width, height, rect) => ({ width, height, getBoundingClientRect: () => rect });
const DOUBLE = { left: 0, top: 0, width: 400, height: 200 };   // a 200 x 100 image shown at 2x

// ---------- levelHandles ----------

test('RIM_HANDLES names the four rim points', () => {
  assert.deepEqual(RIM_HANDLES, ['R0', 'R1', 'R2', 'R3']);
});

test('a body has SA, SP, IA and IP, in Tab order, coloured by corner', () => {
  const geometry = body(10, 20);
  assert.deepEqual(levelHandles('L3', geometry), [
    { handle: 'SA', point: [10, 20], colorKey: 'SA' },
    { handle: 'SP', point: [20, 20], colorKey: 'SP' },
    { handle: 'IA', point: [10, 30], colorKey: 'IA' },
    { handle: 'IP', point: [20, 30], colorKey: 'IP' },
  ]);
  assert.deepEqual(levelHandles('C5', geometry).map(h => h.handle), ['SA', 'SP', 'IA', 'IP']);
});

test('C2 has IA, IP and its centroid, the centroid coloured by the level', () => {
  assert.deepEqual(levelHandles('C2', c2), [
    { handle: 'IA', point: [40, 20], colorKey: 'IA' },
    { handle: 'IP', point: [50, 20], colorKey: 'IP' },
    { handle: 'CENTROID', point: [45, 12], colorKey: 'level' },
  ]);
});

test('an endplate level has SA and SP, a centroid level has its centroid', () => {
  assert.deepEqual(levelHandles('S1', endplate), [
    { handle: 'SA', point: [10, 110], colorKey: 'SA' },
    { handle: 'SP', point: [20, 112], colorKey: 'SP' },
  ]);
  assert.deepEqual(levelHandles('T1', endplate).map(h => h.handle), ['SA', 'SP']);
  assert.deepEqual(levelHandles('T4', centroid), [{ handle: 'CENTROID', point: [30, 40], colorKey: 'level' }]);
});

test('a circle with rim points has one R handle per point, coloured as the trace', () => {
  const rim = [[60, 50], [50, 60], [40, 50], [50, 40]];
  assert.deepEqual(levelHandles('FH1', { center: [50, 50], radius: 10, rim }), [
    { handle: 'R0', point: [60, 50], colorKey: 'trace' },
    { handle: 'R1', point: [50, 60], colorKey: 'trace' },
    { handle: 'R2', point: [40, 50], colorKey: 'trace' },
    { handle: 'R3', point: [50, 40], colorKey: 'trace' },
  ]);
  const two = levelHandles('FH2', { center: [50, 50], radius: 10, rim: [[60, 50], [40, 50]] });
  assert.deepEqual(two.map(h => h.handle), ['R0', 'R1']);
});

test('a model circle with rim null shows four synthesised handles', () => {
  const handles = levelHandles('FH1', circle);
  assert.deepEqual(handles.map(h => h.handle), RIM_HANDLES);
  assert.deepEqual(handles.map(h => h.point), synthesizeRim(circle));
  assert.ok(handles.every(h => h.colorKey === 'trace'));
});

test('null geometry has no handles', () => {
  assert.deepEqual(levelHandles('L3', null), []);
  assert.deepEqual(levelHandles('FH1', null), []);
  assert.deepEqual(levelHandles('L3', undefined), []);
});

test('the first handle agrees with the one selectLevel focuses, for every kind of level', () => {
  const editor = everyKindEditor();
  for (const code of ['C2', 'C3', 'T1', 'T4', 'S1', 'FH1']) {
    const first = levelHandles(code, editor.levels[code].geometry)[0].handle;
    assert.equal(selectLevel(editor, code).handle.handle, first, code);
  }
});

// ---------- handleAt ----------

test('handleAt returns the handle’s point, or null when the level lacks it', () => {
  assert.deepEqual(handleAt('L3', body(10, 20), 'IA'), [10, 30]);
  assert.deepEqual(handleAt('C2', c2, 'CENTROID'), [45, 12]);
  assert.deepEqual(handleAt('FH1', circle, 'R2'), synthesizeRim(circle)[2]);
  assert.equal(handleAt('S1', endplate, 'IA'), null);
  assert.equal(handleAt('FH1', { center: [50, 50], radius: 10, rim: [[60, 50], [40, 50]] }, 'R3'), null);
  assert.equal(handleAt('L3', null, 'SA'), null);
});

// ---------- moveHandle ----------

test('moving a body corner sets the matching pair entry and nothing else', () => {
  const geometry = deepFreeze(body(10, 20));
  const sa = moveHandle('L3', geometry, 'SA', [1, 2]);
  assert.deepEqual(sa, { superior: [[1, 2], [20, 20]], inferior: [[10, 30], [20, 30]] });
  assert.deepEqual(moveHandle('L3', geometry, 'SP', [1, 2]).superior, [[10, 20], [1, 2]]);
  assert.deepEqual(moveHandle('L3', geometry, 'IA', [1, 2]).inferior, [[1, 2], [20, 30]]);
  assert.deepEqual(moveHandle('L3', geometry, 'IP', [1, 2]).inferior, [[10, 30], [1, 2]]);
  assert.notEqual(sa, geometry);
  assert.notEqual(sa.superior, geometry.superior);
});

test('moving C2’s corners and centroid, an endplate corner and a centroid', () => {
  const frozenC2 = deepFreeze({ inferior: [[40, 20], [50, 20]], centroid: [45, 12] });
  assert.deepEqual(moveHandle('C2', frozenC2, 'IP', [51, 22]), { inferior: [[40, 20], [51, 22]], centroid: [45, 12] });
  assert.deepEqual(moveHandle('C2', frozenC2, 'CENTROID', [44, 11]), { inferior: [[40, 20], [50, 20]], centroid: [44, 11] });
  const frozenEndplate = deepFreeze({ superior: [[10, 110], [20, 112]] });
  assert.deepEqual(moveHandle('S1', frozenEndplate, 'SP', [22, 111]), { superior: [[10, 110], [22, 111]] });
  const frozenCentroid = deepFreeze({ centroid: [30, 40] });
  assert.deepEqual(moveHandle('T4', frozenCentroid, 'CENTROID', [31, 41]), { centroid: [31, 41] });
});

test('moving the point does not alias the caller’s array', () => {
  const point = [1, 2];
  const moved = moveHandle('T4', centroid, 'CENTROID', point);
  point[0] = 99;
  assert.deepEqual(moved.centroid, [1, 2]);
});

test('moving a rim point of a circle with rim null materialises all four and refits', () => {
  const frozen = deepFreeze({ center: [50, 50], radius: 10, rim: null });
  const moved = moveHandle('FH1', frozen, 'R0', [62, 50]);
  assert.equal(moved.rim.length, 4);
  assert.deepEqual(moved.rim[0], [62, 50]);
  assert.deepEqual(moved.rim.slice(1), synthesizeRim(frozen).slice(1));
  assert.deepEqual(moved.center, [50.9, 49.4]);
  assert.equal(moved.radius, 10.6);
  assert.deepEqual(moved, fitRim(moved.rim, Infinity));
  assert.equal(frozen.rim, null);
});

test('moving a rim point of a circle that has a rim replaces that point and refits over the rim', () => {
  const rim = deepFreeze([[60, 50], [50, 60], [40, 50], [50, 40]]);
  const moved = moveHandle('FH2', { center: [50, 50], radius: 10, rim }, 'R2', [38, 50]);
  assert.deepEqual(moved.rim, [[60, 50], [50, 60], [38, 50], [50, 40]]);
  assert.deepEqual(moved, fitRim(moved.rim, Infinity));
});

test('a two-point rim is a diameter, and moving one end refits it', () => {
  const moved = moveHandle('FH1', { center: [50, 50], radius: 10, rim: [[60, 50], [40, 50]] }, 'R1', [30, 50]);
  assert.deepEqual(moved.rim, [[60, 50], [30, 50]]);
  assert.deepEqual(moved.center, [45, 50]);
  assert.equal(moved.radius, 15);
});

test('a rim move that would leave the head under 0.5 px is refused and returns the geometry unchanged (R25)', () => {
  const rimTwo = deepFreeze({ center: [50, 50], radius: 10, rim: [[60, 50], [40, 50]] });
  assert.equal(moveHandle('FH1', rimTwo, 'R1', [60, 50]), rimTwo);      // onto the other point: radius 0
  assert.equal(moveHandle('FH1', rimTwo, 'R1', [59.4, 50]), rimTwo);    // 0.6 px apart: radius 0.3
  assert.equal(nudgeHandle('FH1', rimTwo, 'R1', 20, 0), rimTwo);        // the nudge lands on R0 too
  const atFloor = moveHandle('FH1', rimTwo, 'R1', [59, 50]);            // 1 px apart: radius 0.5, the floor, kept
  assert.deepEqual(atFloor, { center: [59.5, 50], radius: 0.5, rim: [[60, 50], [59, 50]] });
});

test('a rim drag has no radius cap', () => {
  const moved = moveHandle('FH1', circle, 'R0', [5000, 50]);
  assert.equal(moved.rim.length, 4);
  assert.deepEqual(moved, fitRim(moved.rim, Infinity));
  assert.ok(moved.radius > 1000);
  assert.notDeepEqual(moved, fitRim(moved.rim, 1000));   // a cap would have swapped the fit for the farthest-pair diameter
});

test('moving a handle the geometry lacks returns the geometry it was given', () => {
  const geometry = deepFreeze(endplate);
  assert.equal(moveHandle('S1', geometry, 'IA', [1, 2]), geometry);
  assert.equal(moveHandle('S1', geometry, 'CENTROID', [1, 2]), geometry);
  const rimTwo = { center: [50, 50], radius: 10, rim: [[60, 50], [40, 50]] };
  assert.equal(moveHandle('FH1', rimTwo, 'R3', [1, 2]), rimTwo);
  assert.equal(moveHandle('L3', null, 'SA', [1, 2]), null);
});

// ---------- nudgeHandle ----------

test('nudging a body corner moves only that corner', () => {
  const geometry = deepFreeze(body(10, 20));
  const nudged = nudgeHandle('L3', geometry, 'SA', 1, -2);
  assert.deepEqual(nudged, { superior: [[11, 18], [20, 20]], inferior: [[10, 30], [20, 30]] });
  assert.notEqual(nudged, geometry);
});

test('nudging a rim point of a circle with rim null moves the synthesised point and refits', () => {
  const start = synthesizeRim(circle)[1];
  const nudged = nudgeHandle('FH1', circle, 'R1', 3, 0);
  assert.equal(nudged.rim.length, 4);
  assert.deepEqual(nudged.rim[1], [start[0] + 3, start[1]]);
  assert.deepEqual(nudged, fitRim(nudged.rim, Infinity));
});

test('nudging a handle that does not exist returns the geometry it was given', () => {
  const geometry = deepFreeze(endplate);
  assert.equal(nudgeHandle('S1', geometry, 'IA', 1, 1), geometry);
  assert.equal(nudgeHandle('L3', null, 'SA', 1, 1), null);
});

// ---------- hitTestLevelHandles ----------

test('hit-testing picks the nearest handle within 14 CSS px of the click, in client space', () => {
  const canvas = fakeCanvas(200, 100, DOUBLE);
  // image (100, 50) and (106, 50) sit at client (200, 100) and (212, 100)
  const handles = [{ handle: 'SA', point: [100, 50], colorKey: 'SA' }, { handle: 'SP', point: [106, 50], colorKey: 'SP' }];
  assert.equal(hitTestLevelHandles(handles, 203, 100, canvas), 'SA');
  assert.equal(hitTestLevelHandles(handles, 209, 100, canvas), 'SP');
  assert.equal(hitTestLevelHandles(handles, 206, 100, canvas), 'SA');   // a tie goes to the earlier handle
});

test('hit-testing reaches 14 CSS px and no further', () => {
  const canvas = fakeCanvas(200, 100, DOUBLE);
  const handles = [{ handle: 'IA', point: [100, 50], colorKey: 'IA' }];
  assert.equal(hitTestLevelHandles(handles, 214, 100, canvas), 'IA');
  assert.equal(hitTestLevelHandles(handles, 215, 100, canvas), null);
  assert.equal(hitTestLevelHandles(handles, 200, 115, canvas), null);
  assert.equal(hitTestLevelHandles(handles, 215, 100, canvas, 16), 'IA');
});

test('hit-testing has the same reach at any zoom and offset', () => {
  const small = fakeCanvas(200, 100, { left: 50, top: 20, width: 100, height: 50 });   // 0.5x, offset
  const handles = [{ handle: 'R0', point: [100, 50], colorKey: 'trace' }];   // client (100, 45)
  assert.equal(hitTestLevelHandles(handles, 100, 59, small), 'R0');
  assert.equal(hitTestLevelHandles(handles, 100, 60, small), null);
});

test('hit-testing nothing, or a degenerate canvas, finds nothing', () => {
  assert.equal(hitTestLevelHandles([], 10, 10, fakeCanvas(200, 100, DOUBLE)), null);
  const handles = [{ handle: 'SA', point: [10, 10], colorKey: 'SA' }];
  assert.equal(hitTestLevelHandles(handles, 20, 20, fakeCanvas(0, 0, DOUBLE)), null);
});

// ---------- handleOrder ----------

const orderCodes = order => order.map(entry => entry.code).filter((code, i, all) => all.indexOf(code) === i);

test('handle order walks visible, placed levels in LEVEL_CODES order, a level’s handles in Tab order', () => {
  const order = handleOrder(lumbarEditor());
  assert.deepEqual(orderCodes(order), ['L1', 'L2', 'L4', 'L5', 'S1', 'FH1', 'FH2']);   // L3 is visible but not placed
  assert.deepEqual(order.slice(0, 5), [
    { code: 'L1', handle: 'SA' }, { code: 'L1', handle: 'SP' }, { code: 'L1', handle: 'IA' }, { code: 'L1', handle: 'IP' },
    { code: 'L2', handle: 'SA' },
  ]);
  assert.equal(order.length, 4 * 4 + 2 + 2 * 4);   // four bodies, S1, two heads of four synthesised rim points
  assert.deepEqual(order[order.length - 1], { code: 'FH2', handle: 'R3' });
  assert.deepEqual(orderCodes(order), LEVEL_CODES.filter(code => orderCodes(order).includes(code)));
});

test('handle order skips a level that is not visible, though it keeps its geometry', () => {
  const editor = toggleVisible(lumbarEditor(), 'L2');
  assert.ok(editor.levels.L2.geometry);
  assert.deepEqual(orderCodes(handleOrder(editor)), ['L1', 'L4', 'L5', 'S1', 'FH1', 'FH2']);
  assert.deepEqual(orderCodes(handleOrder(toggleGroup(lumbarEditor(), 'femoral'))), ['L1', 'L2', 'L4', 'L5', 'S1']);
});

test('handle order skips the level being placed', () => {
  const editor = startPlacing(lumbarEditor(), 'L4');   // re-placing a placed level
  assert.deepEqual(orderCodes(handleOrder(editor)), ['L1', 'L2', 'L5', 'S1', 'FH1', 'FH2']);
});

test('handle order covers every kind of level, T1 and T4 included', () => {
  const order = handleOrder(everyKindEditor());
  assert.deepEqual(orderCodes(order), ['C2', 'C3', 'T1', 'T4', 'S1', 'FH1']);
  assert.deepEqual(order.filter(entry => entry.code === 'C2').map(entry => entry.handle), ['IA', 'IP', 'CENTROID']);
  assert.deepEqual(order.filter(entry => entry.code === 'T4').map(entry => entry.handle), ['CENTROID']);
});

test('handle order is empty when nothing is placed', () => {
  const editor = openEditor({ study: { id: 'SP-0002', geometry: null, labelFile: null }, region: 'lumbar', modelGeometry: null, saved: null });
  assert.deepEqual(handleOrder(editor), []);
});

// ---------- nextLevelHandle ----------

test('Tab steps to the next handle of a level, and from its last handle to the next level’s first', () => {
  const editor = lumbarEditor();
  assert.deepEqual(nextLevelHandle(at(editor, 'L1', 'SA'), 1), { code: 'L1', handle: 'SP' });
  assert.deepEqual(nextLevelHandle(at(editor, 'L1', 'IP'), 1), { code: 'L2', handle: 'SA' });
  assert.deepEqual(nextLevelHandle(at(editor, 'L2', 'IP'), 1), { code: 'L4', handle: 'SA' });   // L3 has no geometry
});

test('Tab wraps from the last handle of the last placed level to the first of the first', () => {
  const editor = lumbarEditor();
  assert.deepEqual(nextLevelHandle(at(editor, 'FH2', 'R3'), 1), { code: 'L1', handle: 'SA' });
});

test('Shift+Tab steps backwards, across levels and around the wrap', () => {
  const editor = lumbarEditor();
  assert.deepEqual(nextLevelHandle(at(editor, 'L1', 'SP'), -1), { code: 'L1', handle: 'SA' });
  assert.deepEqual(nextLevelHandle(at(editor, 'L2', 'SA'), -1), { code: 'L1', handle: 'IP' });
  assert.deepEqual(nextLevelHandle(at(editor, 'L1', 'SA'), -1), { code: 'FH2', handle: 'R3' });
});

test('the same walk from selectLevel reaches the same places', () => {
  let editor = selectLevel(lumbarEditor(), 'FH2');
  assert.deepEqual(editor.handle, { code: 'FH2', handle: 'R0' });
  for (const handle of ['R1', 'R2', 'R3']) {
    const next = nextLevelHandle(editor, 1);
    assert.deepEqual(next, { code: 'FH2', handle });
    editor = { ...editor, handle: next };
  }
  assert.deepEqual(nextLevelHandle(editor, 1), { code: 'L1', handle: 'SA' });
});

test('a lone handle wraps to itself', () => {
  const editor = openEditor({
    study: { id: 'SP-0004', geometry: null, labelFile: null }, region: 'full_spine', modelGeometry: null,
    saved: { file: null, levels: { T4: { visible: true, source: 'annotator', geometry: centroid } } },
  });
  assert.deepEqual(handleOrder(editor), [{ code: 'T4', handle: 'CENTROID' }]);
  assert.deepEqual(nextLevelHandle(at(editor, 'T4', 'CENTROID'), 1), { code: 'T4', handle: 'CENTROID' });
  assert.deepEqual(nextLevelHandle(at(editor, 'T4', 'CENTROID'), -1), { code: 'T4', handle: 'CENTROID' });
});

test('with no focused handle and nothing selected, Tab goes to the first entry and Shift+Tab to the last', () => {
  const editor = lumbarEditor();
  assert.equal(editor.handle, null);
  assert.equal(editor.selected, null);
  assert.deepEqual(nextLevelHandle(editor, 1), { code: 'L1', handle: 'SA' });
  assert.deepEqual(nextLevelHandle(editor, -1), { code: 'FH2', handle: 'R3' });
});

test('with no focused handle, the selected level’s first handle (Tab) or last handle (Shift+Tab)', () => {
  const editor = cancelPlacing(startPlacing(lumbarEditor(), 'L4'));   // selected L4, no handle, L4 placed
  assert.equal(editor.selected, 'L4');
  assert.equal(editor.handle, null);
  assert.deepEqual(nextLevelHandle(editor, 1), { code: 'L4', handle: 'SA' });
  assert.deepEqual(nextLevelHandle(editor, -1), { code: 'L4', handle: 'IP' });
});

test('a selected level that is not in the order falls back to the first or last entry', () => {
  const editor = selectLevel(lumbarEditor(), 'L3');   // visible, not placed: no handle
  assert.equal(editor.handle, null);
  assert.deepEqual(nextLevelHandle(editor, 1), { code: 'L1', handle: 'SA' });
  assert.deepEqual(nextLevelHandle(editor, -1), { code: 'FH2', handle: 'R3' });
});

test('an empty order has no next handle', () => {
  const editor = openEditor({ study: { id: 'SP-0002', geometry: null, labelFile: null }, region: 'lumbar', modelGeometry: null, saved: null });
  assert.equal(nextLevelHandle(editor, 1), null);
  assert.equal(nextLevelHandle(editor, -1), null);
});

test('a handle on a level that was hidden is treated as no current handle, not as a place in the order', () => {
  // toggleVisible keeps editor.handle on L2 although L2 is now hidden.
  const editor = toggleVisible(selectLevel(lumbarEditor(), 'L2'), 'L2');
  assert.deepEqual(editor.handle, { code: 'L2', handle: 'SA' });
  assert.equal(editor.levels.L2.visible, false);
  assert.deepEqual(nextLevelHandle(editor, 1), { code: 'L1', handle: 'SA' });     // not L4, L2's neighbour
  assert.deepEqual(nextLevelHandle(editor, -1), { code: 'FH2', handle: 'R3' });   // not L1's last handle
});

test('a handle on the level being placed is treated as no current handle too', () => {
  const editor = { ...selectLevel(lumbarEditor(), 'L4'), placing: { code: 'L4', points: [null, null, null, null], current: 0, history: [] } };
  assert.deepEqual(handleOrder(editor).filter(entry => entry.code === 'L4'), []);
  assert.deepEqual(nextLevelHandle(editor, 1), { code: 'L1', handle: 'SA' });
});

test('a stale handle falls back to the selected level when that level is in the order', () => {
  const editor = { ...toggleVisible(selectLevel(lumbarEditor(), 'L2'), 'L2'), selected: 'L5' };
  assert.deepEqual(nextLevelHandle(editor, 1), { code: 'L5', handle: 'SA' });
  assert.deepEqual(nextLevelHandle(editor, -1), { code: 'L5', handle: 'IP' });
});

test('a handle the level no longer has is treated as no current handle', () => {
  const editor = lumbarEditor();
  // S1 has SA and SP only: with nothing selected the walk starts from the ends of the order,
  // with S1 selected (the `at` helper selects it) from S1's own ends.
  assert.deepEqual(nextLevelHandle({ ...at(editor, 'S1', 'IA'), selected: null }, 1), { code: 'L1', handle: 'SA' });
  assert.deepEqual(nextLevelHandle(at(editor, 'S1', 'IA'), 1), { code: 'S1', handle: 'SA' });
  assert.deepEqual(nextLevelHandle(at(editor, 'S1', 'IA'), -1), { code: 'S1', handle: 'SP' });
});

test('the handle returned is a new object, safe to store', () => {
  const editor = lumbarEditor();
  const current = { code: 'L1', handle: 'SA' };
  const next = nextLevelHandle({ ...editor, selected: 'L1', handle: current }, 1);
  assert.notEqual(next, current);
  assert.deepEqual(current, { code: 'L1', handle: 'SA' });
});
