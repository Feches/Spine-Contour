import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVEL_RGB, BASE_OVERLAY_ALPHA, FEMORAL_OVERLAY_COLOR, CORNER_COLORS, TRACE_COLOR, buildLabelColorMap, buildOverlayPixels,
  drawDynamicLayer, drawStaticLayer, drawLevelEditor, colorFor, constructionLabel, thumbnailSize, imagesFromRaw, disposeStudyImages,
} from '../renderer/viewer/canvas.js';
import { LEVEL_CODES, openEditor, selectLevel, setLevelGeometry, startPlacing, addPoint, setPlacingStep, toggleVisible } from '../renderer/data/levels.js';

test('buildLabelColorMap maps L1..L5 backend label ids to the fixed RGB ramp', () => {
  const labels = { BACKGROUND: 0, L1: 20, L2: 21, L3: 22, L4: 23, L5: 24, S1: 25 };
  const map = buildLabelColorMap(labels);
  assert.deepEqual(map[20], LEVEL_RGB.L1);
  assert.deepEqual(map[21], LEVEL_RGB.L2);
  assert.deepEqual(map[24], LEVEL_RGB.L5);
  assert.equal(map[25], undefined);
  assert.equal(map[0], undefined);
});

test('full-spine and cervical vertebral outlines use the lumbar level palette', () => {
  const strokes = [];
  const ctx = new Proxy({ stroke() { strokes.push(this.strokeStyle); } }, {
    get(target, prop) { return prop in target ? target[prop] : () => {}; },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  const body = { quadrilateral: [[1, 1], [4, 1], [4, 4], [1, 4]] };
  drawDynamicLayer(ctx, { width: 200, height: 200 },
    { region: 'full_spine', vertebrae: { C3: body, L1: body } },
    { selectedLevel: null, editing: false, measurements: null });
  assert.deepEqual(strokes.slice(0, 2), ['rgb(255,99,132)', 'rgb(255,99,132)']);
  assert.notDeepEqual(LEVEL_RGB.C2, LEVEL_RGB.C3);
});

test('buildOverlayPixels colours a labelled mask pixel and leaves background transparent', () => {
  // Two RGBA pixels: pixel 0 has mask value 20 (L1), pixel 1 has mask value 0 (background).
  const maskPixels = new Uint8ClampedArray([20, 20, 20, 255, 0, 0, 0, 255]);
  const femoralPixels = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0]);
  const colorByLabel = { 20: [255, 99, 132] };
  const overlay = buildOverlayPixels(maskPixels, femoralPixels, colorByLabel, BASE_OVERLAY_ALPHA);
  assert.deepEqual([...overlay.slice(0, 4)], [255, 99, 132, BASE_OVERLAY_ALPHA]);
  assert.deepEqual([...overlay.slice(4, 8)], [0, 0, 0, 0]);
});

test('buildOverlayPixels never renders raw femoral masks, including saved legacy masks', () => {
  const maskPixels = new Uint8ClampedArray([0, 0, 0, 255]);
  const femoralPixels = new Uint8ClampedArray([1, 0, 0, 255]);
  const overlay = buildOverlayPixels(maskPixels, femoralPixels, {}, BASE_OVERLAY_ALPHA);
  assert.deepEqual([...overlay], [0, 0, 0, 0]);
});

function fakeGeometry() {
  return {
    vertebrae: {
      L1: { superior: [[10, 10], [20, 10]], inferior: [[10, 20], [20, 20]], quadrilateral: [[10, 10], [20, 10], [20, 20], [10, 20]] },
      L2: { superior: [[10, 30], [20, 30]], inferior: [[10, 40], [20, 40]], quadrilateral: [[10, 30], [20, 30], [20, 40], [10, 40]] },
      L3: { superior: [[10, 50], [20, 50]], inferior: [[10, 60], [20, 60]], quadrilateral: [[10, 50], [20, 50], [20, 60], [10, 60]] },
      L4: { superior: [[10, 70], [20, 70]], inferior: [[10, 80], [20, 80]], quadrilateral: [[10, 70], [20, 70], [20, 80], [10, 80]] },
      L5: { superior: [[10, 90], [20, 90]], inferior: [[10, 100], [20, 100]], quadrilateral: [[10, 90], [20, 90], [20, 100], [10, 100]] },
    },
    s1_superior: [[10, 110], [20, 110]],
    l1_center: [15, 15],
    hip_midpoint: [15, 130],
    femoral_circles: [[10, 140, 5], [20, 140, 5]],
  };
}

// A 2D context stand-in that records every method call, and every property write in
// `writes`. Canvas code is otherwise untestable here; this pins the one structural fact the
// design depends on -- how many handles exist, and when. It also keeps the drawing state a real
// context keeps (a save/restore stack over the style properties and the line dash) and snapshots
// that state into `painted` at every fill(), stroke() and fillText(), so a test can say which colour,
// width and dash a shape was painted with. `without` names methods the context must not have.
const STATE_PROPS = ['strokeStyle', 'fillStyle', 'lineWidth', 'globalAlpha', 'font', 'textBaseline', 'lineJoin', 'lineDash'];

function recordingContext({ without = [] } = {}) {
  const calls = [];
  const writes = [];
  const painted = [];
  const stack = [];
  const target = { lineDash: [] };
  const record = (prop, args) => { calls.push([prop, args]); };
  const ctx = new Proxy(target, {
    get(t, prop) {
      if (without.includes(prop)) return undefined;
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'setLineDash') return (dash) => { record(prop, [dash]); t.lineDash = dash; };
      if (prop === 'save') return () => { record(prop, []); stack.push(Object.fromEntries(STATE_PROPS.map(key => [key, t[key]]))); };
      if (prop === 'restore') return () => { record(prop, []); Object.assign(t, stack.pop()); };
      if (prop === 'fill' || prop === 'stroke' || prop === 'fillText') {
        return (...args) => {
          record(prop, args);
          painted.push({ name: prop, args, strokeStyle: t.strokeStyle, fillStyle: t.fillStyle, lineWidth: t.lineWidth, lineDash: t.lineDash, font: t.font, textBaseline: t.textBaseline });
        };
      }
      if (prop in t) return t[prop];
      return (...args) => record(prop, args);
    },
    set(t, prop, value) {
      writes.push([prop, value]);
      t[prop] = value;
      return true;
    },
  });
  return { ctx, calls, writes, painted };
}

function arcCount(calls) {
  return calls.filter(([name]) => name === 'arc').length;
}

test('drawDynamicLayer draws no handles outside edit mode', () => {
  const { ctx, calls } = recordingContext();
  drawDynamicLayer(ctx, { width: 200, height: 150 }, fakeGeometry(), { selectedLevel: null, measurements: null, editing: false });
  assert.equal(arcCount(calls), 2, 'only the two femoral circles');
});

function fullMeasurements() {
  return { SS: 40, PI: 50, PT: 10, L1PA: 5, LL: { 'L1-S1': 50, 'L2-S1': 45, 'L3-S1': 40, 'L4-S1': 35, 'L5-S1': 25 } };
}

test('constructionLabel anchors endplate constructions beyond the anterior corner, away from the body', () => {
  // fakeGeometry's L3 endplate runs from SA [10,50] to SP [20,50] (length 10): anterior is leftward,
  // the anchor sits 15% of the endplate beyond SA, and the chip extends further left.
  assert.deepEqual(constructionLabel(fakeGeometry(), 'L3', fullMeasurements()), { text: 'LL L3-S1 40.0°', anchor: [8.5, 50], side: -1 });
  assert.deepEqual(constructionLabel(fakeGeometry(), 'SS', fullMeasurements()), { text: 'SS 40.0°', anchor: [8.5, 110], side: -1 });
});

test('constructionLabel anchors hip-line constructions at the line midpoint', () => {
  // s1 midpoint [15,110], hip [15,130], L1 centre [15,15].
  assert.deepEqual(constructionLabel(fakeGeometry(), 'PT', fullMeasurements()), { text: 'PT 10.0°', anchor: [15, 120], side: 1 });
  assert.deepEqual(constructionLabel(fakeGeometry(), 'PI', fullMeasurements()), { text: 'PI 50.0°', anchor: [15, 120], side: 1 });
  assert.deepEqual(constructionLabel(fakeGeometry(), 'S1', fullMeasurements()), { text: 'PI 50.0°  PT 10.0°  SS 40.0°', anchor: [15, 120], side: 1 });
  assert.deepEqual(constructionLabel(fakeGeometry(), 'L1PA', fullMeasurements()), { text: 'L1PA 5.0°', anchor: [15, 72.5], side: 1 });
});

test('constructionLabel is null with no construction, no measurements, or a missing value', () => {
  assert.equal(constructionLabel(fakeGeometry(), null, fullMeasurements()), null);
  assert.equal(constructionLabel(fakeGeometry(), 'L3', null), null);
  assert.equal(constructionLabel(fakeGeometry(), 'L3', { ...fullMeasurements(), LL: {} }), null);
  assert.equal(constructionLabel(fakeGeometry(), 'SVA', fullMeasurements()), null);
});

test('drawDynamicLayer draws no label plate on the canvas', () => {
  const { ctx, calls } = recordingContext();
  drawDynamicLayer(ctx, { width: 200, height: 150 }, fakeGeometry(), { selectedLevel: 'L3', measurements: fullMeasurements() });
  assert.equal(calls.filter(([name]) => name === 'fillRect').length, 0);
  assert.deepEqual(calls.filter(([name]) => name === 'fillText').map(([, args]) => args[0]), ['L3'], 'only the level name is text on the canvas');
});

test('drawDynamicLayer with the old edit-mode options and no level editor draws no handles', () => {
  const { ctx, calls } = recordingContext();
  drawDynamicLayer(ctx, { width: 200, height: 150 }, fakeGeometry(), {
    selectedLevel: null, measurements: null, editing: false, selection: { kind: 'landmark', level: 'L2', corner: 'SA' }, pixelRatio: 1,
  });
  assert.equal(arcCount(calls), 2, 'only the two femoral circles');
});

// ---- the level editor on the dynamic layer (2026-10-10) ----

const EDITOR_CANVAS = { width: 200, height: 150 };
const ACCENT = '#D45A32';
const PLATE = 'rgba(11,10,9,.78)';
const STAGE_BG = '#0B0A09';
const GHOST = 'rgba(250,247,242,.7)';
const half = BASE_OVERLAY_ALPHA / 255 * 0.5;   // the default opacity slider position, 50

const rgba = (color, alpha) => `rgba(${color.join(',')},${alpha})`;

// A lumbar film the model segmented: L1-L5, S1 and both heads placed and visible; C2-C7, T1, T4 not visible.
function lumbarEditor(selected = null) {
  const editor = openEditor({ study: { geometry: fakeGeometry() }, region: 'lumbar', modelGeometry: fakeGeometry(), saved: null });
  return selected ? selectLevel(editor, selected) : editor;
}

// A film with no result: every level visible, none placed.
function emptyEditor() {
  return openEditor({ study: { geometry: null }, region: 'auto', modelGeometry: null, saved: null });
}

const BODY = { superior: [[30, 20], [60, 20]], inferior: [[30, 50], [60, 50]] };

function drawEditor(editor, extra = {}, { without } = {}) {
  const rec = recordingContext({ without });
  drawLevelEditor(rec.ctx, EDITOR_CANVAS, editor, { overlays: true, overlayOpacity: 50, pixelRatio: 1, handle: null, dragGeometry: null, ...extra });
  return rec;
}

const arcsOf = (calls) => calls.filter(([name]) => name === 'arc').map(([, args]) => args);
const labelsOf = (calls) => calls.filter(([name]) => name === 'fillText').map(([, args]) => args[0]);
const dashed = (calls, dash) => calls.filter(([name, args]) => name === 'setLineDash' && args[0].length === dash.length && args[0].every((v, i) => v === dash[i]));
// A stroke that outlines a level (not a handle, whose outline is the stage background).
const levelStrokes = (painted) => painted.filter(p => p.name === 'stroke' && p.strokeStyle !== STAGE_BG);

test('LEVEL_RGB gains T1, T4 and S1 and keeps every shipped entry', () => {
  assert.deepEqual(LEVEL_RGB.T1, [255, 159, 64]);
  assert.deepEqual(LEVEL_RGB.T4, [255, 205, 86]);
  assert.deepEqual(LEVEL_RGB.S1, [255, 99, 132]);
  assert.deepEqual(LEVEL_RGB.C2, [183, 139, 244]);
  assert.deepEqual(LEVEL_RGB.C3, [255, 99, 132]);
  assert.deepEqual(LEVEL_RGB.L5, [54, 162, 235]);
});

test('the mask overlay colours no S1, T1 or T4 label, so the stored image is painted as before', () => {
  const map = buildLabelColorMap({ BACKGROUND: 0, S1: 25, T1: 26, T4: 27, L1: 20, C2: 10 });
  assert.deepEqual(Object.keys(map).sort(), ['10', '20']);
});

test('CORNER_COLORS and TRACE_COLOR are exported with their shipped values', () => {
  assert.deepEqual(CORNER_COLORS, { SA: '#32d4ff', SP: '#64e19a', IA: '#ffb259', IP: '#fa78d4' });
  assert.equal(TRACE_COLOR, '#ffe071');
});

test('colorFor maps a colour key to the canvas colour', () => {
  assert.equal(colorFor('SA', 'L3'), '#32d4ff');
  assert.equal(colorFor('IP', 'S1'), '#fa78d4');
  assert.equal(colorFor('trace', 'FH1'), '#ffe071');
  assert.equal(colorFor('level', 'T4'), 'rgb(255,205,86)');
  assert.equal(colorFor('level', 'C2'), 'rgb(183,139,244)');
  assert.equal(colorFor('level', 'FH1'), `rgb(${FEMORAL_OVERLAY_COLOR.join(',')})`);
  assert.equal(colorFor('level', 'FH2'), 'rgb(98,210,111)');
});

test('a lumbar editor with L3 selected draws the two circles and the four handles of L3 and no other arc', () => {
  const { ctx, calls } = recordingContext();
  drawDynamicLayer(ctx, EDITOR_CANVAS, fakeGeometry(), {
    selectedLevel: null, measurements: null, editing: true, editor: lumbarEditor('L3'), pixelRatio: 1,
  });
  const arcs = arcsOf(calls);
  assert.equal(arcs.length, 2 + 4);
  const handles = arcs.filter(([, , radius]) => radius === 6);
  assert.deepEqual(handles.map(([x, y]) => [x, y]), [[10, 50], [20, 50], [10, 60], [20, 60]], 'SA SP IA IP of L3');
  assert.deepEqual(arcs.filter(([, , radius]) => radius === 5).map(([x, y]) => [x, y]), [[10, 140], [20, 140]], 'the circles');
});

test('the handles take the corner colours and are outlined in the stage background', () => {
  const { painted } = drawEditor(lumbarEditor('L3'));
  const handleFills = painted.filter(p => p.name === 'fill' && Object.values(CORNER_COLORS).includes(p.fillStyle));
  assert.deepEqual(handleFills.map(p => p.fillStyle), [CORNER_COLORS.SA, CORNER_COLORS.SP, CORNER_COLORS.IA, CORNER_COLORS.IP]);
  const outlines = painted.filter(p => p.name === 'stroke' && p.strokeStyle === STAGE_BG);
  assert.equal(outlines.length, 4);
  assert.ok(outlines.every(p => p.lineWidth === 2));
});

// (Gate feedback G8, decision D21) Drawn at the R28-floored pixelRatio: the handle is 6 CSS px at 1:1 and shrinks with the film below it
// to 3 CSS px (ratio 2 and beyond), its outline and focus ring in step; the outline is never under 1 CSS px.
test('the handle, its outline and its focus ring shrink with the film below 1:1 to a floor of 3 CSS px', () => {
  const editor = lumbarEditor('L3');
  const focus = { handle: { code: 'L3', handle: 'SP' } };
  const sizes = (ratio) => {
    const { calls, painted } = drawEditor(editor, { ...focus, pixelRatio: ratio });
    const arcsAt = ([px, py]) => arcsOf(calls).filter(([x, y]) => x === px && y === py).map(([, , r]) => r);
    // SA SP IA IP of L3; the focused SP carries the ring first, then its disc.
    const radii = [[10, 50], [20, 50], [10, 60], [20, 60]].map(point => arcsAt(point).at(-1));
    return { radii, ring: arcsAt([20, 50])[0], outlines: painted.filter(p => p.name === 'stroke' && p.strokeStyle === STAGE_BG).map(p => p.lineWidth) };
  };
  assert.deepEqual(sizes(1), { radii: [6, 6, 6, 6], ring: 10, outlines: [2, 2, 2, 2] }, '1:1 as before');
  assert.deepEqual(sizes(2), { radii: [6, 6, 6, 6], ring: 10, outlines: [2, 2, 2, 2] }, '3 CSS px: 6 image px at ratio 2, ring 5 CSS px, outline 1 CSS px');
  assert.deepEqual(sizes(4), { radii: [12, 12, 12, 12], ring: 20, outlines: [4, 4, 4, 4] }, '3 CSS px at ratio 4');
  const mid = sizes(1.5);
  assert.deepEqual(mid.radii, [6, 6, 6, 6], '4 CSS px at ratio 1.5');
  assert.ok(Math.abs(mid.ring - 10) < 1e-9 && mid.outlines.every(w => Math.abs(w - 2) < 1e-9));
  const zoomedIn = sizes(0.25);
  assert.deepEqual(zoomedIn, sizes(1), 'past 1:1 the ratio is floored at 1, so the handle grows with the film as it did');
});

test('the outline of a handle is never under 1 CSS px', () => {
  for (const ratio of [1, 1.5, 2, 3, 8]) {
    const outlines = drawEditor(lumbarEditor('L3'), { pixelRatio: ratio }).painted.filter(p => p.name === 'stroke' && p.strokeStyle === STAGE_BG);
    assert.ok(outlines.length === 4 && outlines.every(p => p.lineWidth >= ratio), `ratio ${ratio}`);
  }
});

test('the dots of a placement shrink with the film like the handles', () => {
  let editor = startPlacing(emptyEditor(), 'L3');
  editor = addPoint(editor, [30, 20], { width: 200, height: 150 });
  for (const [ratio, radius, outline] of [[1, 6, 2], [2, 6, 2], [4, 12, 4]]) {
    const { calls, painted } = drawEditor(editor, { pixelRatio: ratio });
    assert.deepEqual(arcsOf(calls).map(([x, y, r]) => [x, y, r]), [[30, 20, radius]], `ratio ${ratio}`);
    assert.deepEqual(painted.filter(p => p.name === 'stroke' && p.strokeStyle === STAGE_BG).map(p => p.lineWidth), [outline], `ratio ${ratio}`);
  }
});

test('selecting a femoral head draws four rim handles and a non-draggable centre dot', () => {
  const { calls, painted } = drawEditor(lumbarEditor('FH1'));
  const arcs = arcsOf(calls);
  assert.equal(arcs.length, 2 + 4 + 1);
  assert.equal(arcs.filter(([, , radius]) => radius === 6).length, 4);
  const centre = arcs.filter(([, , radius]) => radius === 3.5);
  assert.deepEqual(centre.map(([x, y]) => [x, y]), [[10, 140]]);
  assert.ok(painted.some(p => p.name === 'fill' && p.fillStyle === '#FAF7F2'), 'the centre dot is ink');
  const rim = painted.filter(p => p.name === 'fill' && p.fillStyle === TRACE_COLOR);
  assert.equal(rim.length, 4, 'rim handles are the trace colour');
});

test('only the selected level has handles; none is drawn for a hidden or unplaced level', () => {
  assert.equal(arcsOf(drawEditor(lumbarEditor()).calls).length, 2, 'nothing selected: the two circles');
  const hidden = toggleVisible(lumbarEditor('L3'), 'L3');
  assert.equal(arcsOf(drawEditor(hidden).calls).length, 2, 'L3 hidden: no handles');
  const unplaced = selectLevel(emptyEditor(), 'L3');
  assert.equal(arcsOf(drawEditor(unplaced).calls).length, 0, 'L3 visible but not placed: nothing to handle');
});

test('the selected level handles are drawn above every level, including the ones after it', () => {
  const { calls } = drawEditor(lumbarEditor('L3'));
  const arcs = arcsOf(calls);
  const lastDisc = arcs.map(([, , radius], i) => (radius === 5 ? i : -1)).reduce((a, b) => Math.max(a, b));
  const firstHandle = arcs.findIndex(([, , radius]) => radius === 6);
  assert.ok(firstHandle > lastDisc, 'the two femoral discs (drawn after L3) come before the handles');
});

test('a level whose geometry is not what its kind says draws nothing and does not throw', () => {
  for (const [code, geometry] of [['L3', { superior: [[1, 2]] }], ['C2', { inferior: [[1, 2], [3, 4]] }], ['T4', { centroid: [1] }],
    ['FH1', { center: [1, 2], radius: -3, rim: null }], ['S1', {}]]) {
    const editor = selectLevel(setLevelGeometry(emptyEditor(), code, geometry), code);
    const { calls, painted } = drawEditor(editor);
    assert.deepEqual(calls.filter(([name]) => !['save', 'restore'].includes(name)), [], code);
    assert.deepEqual(painted, [], code);
  }
});

test('the focused handle gets the accent ring; a stale focus draws nothing extra', () => {
  const editor = lumbarEditor('L3');
  const ringed = drawEditor(editor, { handle: { code: 'L3', handle: 'SP' } });
  const ring = arcsOf(ringed.calls).filter(([, , radius]) => radius === 10);
  assert.deepEqual(ring.map(([x, y]) => [x, y]), [[20, 50]]);
  const accentStrokes = (painted) => painted.filter(p => p.name === 'stroke' && p.strokeStyle === ACCENT && p.lineWidth === 2).length;
  assert.equal(accentStrokes(ringed.painted), 2, 'the selected outline and the 2 px ring');
  assert.equal(accentStrokes(drawEditor(editor).painted), 1, 'the outline alone');
  for (const stale of [{ code: 'L2', handle: 'SA' }, { code: 'C4', handle: 'SA' }, { code: 'L3', handle: 'CENTROID' }, { code: 'L3', handle: 'R0' }]) {
    assert.equal(arcsOf(drawEditor(editor, { handle: stale }).calls).length, 2 + 4, `no ring for ${stale.code} ${stale.handle}`);
  }
});

test('an edited selected level draws the model geometry dashed first, and only then', () => {
  const moved = { superior: [[8, 28], [20, 30]], inferior: [[10, 40], [20, 40]] };
  const edited = setLevelGeometry(lumbarEditor('L2'), 'L2', moved);
  const { calls, painted } = drawEditor(edited);
  assert.equal(dashed(calls, [6, 5]).length, 1);
  const at = calls.findIndex(([name, args]) => name === 'setLineDash' && args[0].length === 2);
  assert.deepEqual(calls.slice(at).find(([name]) => name === 'moveTo')[1], [10, 30], 'the ghost starts at the model SA');
  const own = calls.findIndex(([name, args], i) => i > at && name === 'moveTo' && args[0] === 8 && args[1] === 28);
  assert.ok(own > at, 'the current outline is drawn after the ghost');
  const ghost = painted.find(p => p.name === 'stroke' && p.lineDash.length === 2);
  assert.equal(ghost.strokeStyle, GHOST);
  assert.equal(ghost.lineWidth, 1.25);
  const current = painted.filter(p => p.name === 'stroke' && p.strokeStyle === ACCENT);
  assert.deepEqual(current.map(p => [p.lineWidth, p.lineDash]), [[2, []]], 'the dash is restored for the level itself');
  assert.equal(dashed(drawEditor(setLevelGeometry(lumbarEditor('L3'), 'L2', moved)).calls, [6, 5]).length, 0, 'not selected: no ghost');
  assert.equal(dashed(drawEditor(lumbarEditor('L2')).calls, [6, 5]).length, 0, 'selected but segmented: no ghost');
});

test('a femoral head edited away from the model draws the model circle dashed under it', () => {
  const edited = setLevelGeometry(lumbarEditor('FH1'), 'FH1', { center: [12, 141], radius: 6, rim: null });
  const { calls } = drawEditor(edited);
  assert.equal(dashed(calls, [6, 5]).length, 1);
  const ghostArc = arcsOf(calls).filter(([x, y, r]) => x === 10 && y === 140 && r === 5);
  assert.equal(ghostArc.length, 1, 'the model circle, under the edited one');
  assert.ok(arcsOf(calls).some(([x, y, r]) => x === 12 && y === 141 && r === 6), 'the edited circle');
});

test('overlays off: nothing filled or labelled, and only the selected level is stroked', () => {
  const { calls, painted } = drawEditor(lumbarEditor('L3'), { overlays: false });
  const other = painted.filter(p => p.name === 'fill' && !Object.values(CORNER_COLORS).includes(p.fillStyle) && p.fillStyle !== PLATE);
  assert.deepEqual(other, [], 'every fill() is a handle or the selected label plate');
  const strokes = levelStrokes(painted);
  assert.equal(strokes.length, 1);
  assert.deepEqual([strokes[0].strokeStyle, strokes[0].lineWidth], [ACCENT, 2]);
  assert.deepEqual(labelsOf(calls), ['L3'], 'only the selected level keeps its label');
  assert.deepEqual(labelsOf(drawEditor(lumbarEditor(), { overlays: false }).calls), []);
  assert.deepEqual(levelStrokes(drawEditor(lumbarEditor(), { overlays: false }).painted), [], 'nothing selected: nothing stroked');
});

test('overlays on: every visible placed level is filled at the slider opacity and stroked in its colour', () => {
  const { painted } = drawEditor(lumbarEditor('L3'));
  const fills = painted.filter(p => p.name === 'fill' && String(p.fillStyle).startsWith('rgba(') && p.fillStyle !== PLATE);
  assert.deepEqual(fills.map(p => p.fillStyle), [
    rgba(LEVEL_RGB.L1, half), rgba(LEVEL_RGB.L2, half), rgba(LEVEL_RGB.L3, half), rgba(LEVEL_RGB.L4, half), rgba(LEVEL_RGB.L5, half),
    rgba(FEMORAL_OVERLAY_COLOR, half), rgba(FEMORAL_OVERLAY_COLOR, half),
  ], 'bodies and discs; S1 is an endplate line with no area');
  assert.deepEqual(levelStrokes(painted).map(p => [p.strokeStyle, p.lineWidth]), [
    [rgba(LEVEL_RGB.L1, 0.85), 1.25], [rgba(LEVEL_RGB.L2, 0.85), 1.25], [ACCENT, 2], [rgba(LEVEL_RGB.L4, 0.85), 1.25],
    [rgba(LEVEL_RGB.L5, 0.85), 1.25], [rgba(LEVEL_RGB.S1, 0.85), 1.25],
    [rgba(FEMORAL_OVERLAY_COLOR, 0.85), 1.25], [rgba(FEMORAL_OVERLAY_COLOR, 0.85), 1.25],
  ]);
  const full = drawEditor(lumbarEditor(), { overlayOpacity: 100 }).painted.find(p => p.name === 'fill');
  assert.equal(full.fillStyle, rgba(LEVEL_RGB.L1, BASE_OVERLAY_ALPHA / 255));
  const none = drawEditor(lumbarEditor(), { overlayOpacity: 0 }).painted.find(p => p.name === 'fill');
  assert.equal(none.fillStyle, rgba(LEVEL_RGB.L1, 0));
});

test('a body is the closed quadrilateral SA SP IP IA; c2, an endplate, a centroid and a circle have their own shapes', () => {
  const body = drawEditor(setLevelGeometry(emptyEditor(), 'L3', BODY)).calls;
  const path = body.map(([name, args]) => (name === 'moveTo' || name === 'lineTo' ? [name, args] : [name]))
    .filter(([name]) => ['beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke'].includes(name));
  assert.deepEqual(path.slice(0, 8), [
    ['beginPath'], ['moveTo', [30, 20]], ['lineTo', [60, 20]], ['lineTo', [60, 50]], ['lineTo', [30, 50]], ['closePath'], ['fill'], ['stroke'],
  ]);

  const c2 = drawEditor(setLevelGeometry(emptyEditor(), 'C2', { inferior: [[30, 50], [60, 50]], centroid: [45, 30] }));
  assert.deepEqual(arcsOf(c2.calls), [[45, 30, 3, 0, 2 * Math.PI]], 'the centroid dot, radius 3');
  assert.deepEqual(c2.painted.filter(p => p.name === 'fill').map(p => p.fillStyle), [rgba(LEVEL_RGB.C2, half), PLATE],
    'the dot and the label plate: a two-point endplate has no area');
  assert.equal(levelStrokes(c2.painted).length, 2, 'the line and the dot');

  const endplate = drawEditor(setLevelGeometry(emptyEditor(), 'S1', { superior: [[30, 50], [60, 50]] }));
  assert.deepEqual(arcsOf(endplate.calls), []);
  assert.equal(levelStrokes(endplate.painted).length, 1);

  const centroid = drawEditor(setLevelGeometry(emptyEditor(), 'T4', { centroid: [45, 30] }));
  assert.deepEqual(arcsOf(centroid.calls), [[45, 30, 5, 0, 2 * Math.PI]]);
  assert.equal(centroid.painted.find(p => p.name === 'fill').fillStyle, rgba(LEVEL_RGB.T4, half));
  const selectedCentroid = drawEditor(selectLevel(setLevelGeometry(emptyEditor(), 'T4', { centroid: [45, 30] }), 'T4'));
  assert.equal(selectedCentroid.painted.find(p => p.name === 'fill').fillStyle, rgba(LEVEL_RGB.T4, 1), 'opaque when selected');

  const circle = drawEditor(setLevelGeometry(emptyEditor(), 'FH2', { center: [100, 80], radius: 12, rim: null }));
  assert.deepEqual(arcsOf(circle.calls), [[100, 80, 12, 0, 2 * Math.PI]]);
  assert.equal(circle.painted.find(p => p.name === 'fill').fillStyle, rgba(FEMORAL_OVERLAY_COLOR, half));
});

test('labels name each visible placed level that is not a circle, in level order', () => {
  assert.deepEqual(labelsOf(drawEditor(lumbarEditor()).calls), ['L1', 'L2', 'L3', 'L4', 'L5', 'S1'], 'no FH1, no FH2');
  assert.deepEqual(labelsOf(drawEditor(toggleVisible(lumbarEditor(), 'L2')).calls), ['L1', 'L3', 'L4', 'L5', 'S1']);
  assert.deepEqual(labelsOf(drawEditor(lumbarEditor('FH1')).calls), ['L1', 'L2', 'L3', 'L4', 'L5', 'S1']);
  const all = LEVEL_CODES.reduce((editor, code, i) => (code.startsWith('FH') ? editor : setLevelGeometry(editor, code,
    code === 'C2' ? { inferior: [[1, 2 + i], [3, 4 + i]], centroid: [2, 3 + i] }
      : code === 'T4' ? { centroid: [5, 5 + i] }
        : code === 'T1' || code === 'S1' ? { superior: [[1, 2 + i], [3, 4 + i]] } : BODY)), emptyEditor());
  assert.deepEqual(labelsOf(drawEditor(all).calls), LEVEL_CODES.filter(code => !code.startsWith('FH')));
});

test('on a left-facing body a label plate sits 14 px right of the posterior corner, outside the body, centred on it, in the label font', () => {
  // BODY faces left (SA [30,20] and IA [30,50] are anterior): its posterior edge is on the right.
  const body = drawEditor(setLevelGeometry(emptyEditor(), 'L3', BODY));
  // SP [60,20] and IP [60,50]: the posterior edge's middle is [60,35]; text width 10 -> plate 22 x 18.
  assert.deepEqual(body.calls.filter(([name]) => name === 'roundRect').map(([, args]) => args), [[74, 26, 22, 18, 4]]);
  const text = body.painted.find(p => p.name === 'fillText');
  assert.deepEqual(text.args, ['L3', 80, 35]);
  assert.equal(text.font, "500 11px 'Chivo Mono', monospace");
  assert.equal(text.textBaseline, 'middle');
  assert.equal(text.fillStyle, 'rgba(250,247,242,.75)');
  assert.equal(body.painted.filter(p => p.name === 'fill').pop().fillStyle, PLATE);

  const where = (code, geometry) => drawEditor(setLevelGeometry(emptyEditor(), code, geometry)).painted.find(p => p.name === 'fillText').args;
  assert.deepEqual(where('C2', { inferior: [[30, 50], [60, 54]], centroid: [45, 30] }), ['C2', 80, 54], 'IP');
  assert.deepEqual(where('S1', { superior: [[30, 50], [60, 56]] }), ['S1', 80, 56], 'SP');
  assert.deepEqual(where('T4', { centroid: [45, 30] }), ['T4', 65, 30], 'the point');

  const selected = drawEditor(selectLevel(setLevelGeometry(emptyEditor(), 'L3', BODY), 'L3')).painted.find(p => p.name === 'fillText');
  assert.equal(selected.fillStyle, ACCENT);
});

test('a plate stays wholly on the film however far it is dragged, pushed inward at the edge (R45)', () => {
  const [w, h] = [22, 18];
  const rects = (rec) => rec.calls.filter(([name]) => name === 'roundRect').map(([, args]) => args);
  const text = (rec) => rec.painted.find(p => p.name === 'fillText').args;
  const far = drawEditor(setLevelGeometry(emptyEditor(), 'L3', BODY), { platePositions: { L3: [5000, 5000] } });
  assert.deepEqual(rects(far), [[EDITOR_CANVAS.width - w, EDITOR_CANVAS.height - h, w, h, 4]], 'held at the bottom-right corner');
  assert.deepEqual(text(far), ['L3', EDITOR_CANVAS.width - w + 6, EDITOR_CANVAS.height - h / 2], 'the text follows the clamped plate');
  const back = drawEditor(setLevelGeometry(emptyEditor(), 'L3', BODY), { platePositions: { L3: [-5000, -5000] } });
  assert.deepEqual(rects(back), [[0, 0, w, h, 4]], 'held at the top-left corner');
  assert.deepEqual(text(back), ['L3', 6, h / 2]);
  const returned = (() => { const rec = recordingContext(); return drawLevelEditor(rec.ctx, EDITOR_CANVAS, setLevelGeometry(emptyEditor(), 'L3', BODY), { pixelRatio: 1, platePositions: { L3: [5000, 5000] } }); })();
  assert.deepEqual(returned, [{ code: 'L3', x: EDITOR_CANVAS.width - w, y: EDITOR_CANVAS.height - h, width: w, height: h }], 'the returned rect is the clamped one');
});

test('a label plate falls back to fillRect without roundRect, and scales with the pixel ratio', () => {
  const plain = drawEditor(setLevelGeometry(emptyEditor(), 'L3', BODY), {}, { without: ['roundRect'] });
  assert.deepEqual(plain.calls.filter(([name]) => name === 'fillRect').map(([, args]) => args), [[74, 26, 22, 18]]);
  const scaled = drawEditor(setLevelGeometry(emptyEditor(), 'L3', BODY), { pixelRatio: 2 });
  assert.deepEqual(scaled.calls.filter(([name]) => name === 'roundRect').map(([, args]) => args), [[88, 17, 34, 36, 8]]);
  assert.equal(scaled.painted.find(p => p.name === 'fillText').font, "500 22px 'Chivo Mono', monospace");
});

// (Gate feedback G7, 2026-10-13; plan D20, ruling R43) The mirror: a film facing right, as the owner's does.
const MIRRORED = { superior: [[90, 20], [60, 20]], inferior: [[90, 50], [60, 50]] };
const rectsOf = (calls, name = 'roundRect') => calls.filter(([n]) => n === name).map(([, args]) => args);
const textAt = (rec) => rec.painted.find(p => p.name === 'fillText').args;

test('on a right-facing body the plate\'s right edge sits 14 px left of the posterior corner, outside the body (R43)', () => {
  // SA [90,20] and IA [90,50] are anterior; SP [60,20] and IP [60,50] posterior: the anchor is [60,35] and the
  // 22 x 18 plate runs from x = 60 - 14 - 22 = 24 to 46, left of the body's posterior edge at x 60.
  const body = drawEditor(setLevelGeometry(emptyEditor(), 'L3', MIRRORED));
  assert.deepEqual(rectsOf(body.calls), [[24, 26, 22, 18, 4]]);
  assert.deepEqual(textAt(body), ['L3', 30, 35], 'the text starts one pad inside the plate, centred on the anchor');
  const plain = drawEditor(setLevelGeometry(emptyEditor(), 'L3', MIRRORED), {}, { without: ['roundRect'] });
  assert.deepEqual(rectsOf(plain.calls, 'fillRect'), [[24, 26, 22, 18]], 'the fillRect fallback, mirrored too');
  const scaled = drawEditor(setLevelGeometry(emptyEditor(), 'L3', MIRRORED), { pixelRatio: 2 });
  // 60 - 28 - 34 = -2 would start off the film's left edge; the plate is held at 0 instead (R45).
  assert.deepEqual(rectsOf(scaled.calls), [[0, 17, 34, 36, 8]], 'the gap and the plate scale with the pixel ratio, clamped to the film');

  const where = (code, geometry, extra) => textAt(drawEditor(setLevelGeometry(emptyEditor(), code, geometry), extra));
  assert.deepEqual(where('C2', { inferior: [[90, 50], [60, 54]], centroid: [75, 30] }), ['C2', 30, 54], 'C2: IP left of the centroid');
  assert.deepEqual(where('S1', { superior: [[90, 50], [60, 56]] }), ['S1', 30, 56], 'S1: SP left of SA');
  assert.deepEqual(where('T4', { centroid: [45, 30] }, { anteriorSide: 'right' }), ['T4', 15, 30], 'T4 on a film facing right: left');
  assert.deepEqual(where('T4', { centroid: [45, 30] }, { anteriorSide: 'left' }), ['T4', 65, 30], 'T4 on a film facing left: right');
  assert.deepEqual(where('L3', BODY, { anteriorSide: 'right' }), ['L3', 80, 35], 'a body says its own side, whatever the film');
});

test('a plate moves by its level\'s drag offset in image px; a missing or bad offset moves nothing (R44)', () => {
  const editor = setLevelGeometry(setLevelGeometry(emptyEditor(), 'L3', BODY), 'S1', { superior: [[30, 70], [60, 76]] });
  const moved = drawEditor(editor, { platePositions: { L3: [5, -4], S1: ['a', 2] } });
  assert.deepEqual(rectsOf(moved.calls), [[79, 22, 22, 18, 4], [74, 67, 22, 18, 4]]);
  assert.deepEqual(moved.painted.filter(p => p.name === 'fillText').map(p => p.args), [['L3', 85, 31], ['S1', 80, 76]]);
  const scaled = drawEditor(editor, { platePositions: { L3: [5, -4] }, pixelRatio: 2 });
  assert.deepEqual(rectsOf(scaled.calls)[0], [88 + 5, 17 - 4, 34, 36, 8], 'the offset is image px, not scaled by the ratio');
  const mirrored = drawEditor(setLevelGeometry(emptyEditor(), 'L3', MIRRORED), { platePositions: { L3: [-10, 6] } });
  assert.deepEqual(rectsOf(mirrored.calls), [[14, 32, 22, 18, 4]]);
  for (const platePositions of [null, {}, { L3: [NaN, 1] }, { L3: [1] }]) {
    assert.deepEqual(rectsOf(drawEditor(setLevelGeometry(emptyEditor(), 'L3', BODY), { platePositions }).calls), [[74, 26, 22, 18, 4]], JSON.stringify(platePositions));
  }
});

test('drawLevelEditor returns the plates it drew, in image px after the offset, in level order (R43, R44)', () => {
  const one = drawEditor(setLevelGeometry(emptyEditor(), 'L3', BODY), { platePositions: { L3: [5, -4] } });
  const rec = recordingContext();
  const plates = drawLevelEditor(rec.ctx, EDITOR_CANVAS, setLevelGeometry(emptyEditor(), 'L3', BODY), { pixelRatio: 1, platePositions: { L3: [5, -4] } });
  assert.deepEqual(plates, [{ code: 'L3', x: 79, y: 22, width: 22, height: 18 }]);
  assert.deepEqual(rec.calls, one.calls, 'returning the plates changes nothing drawn');

  const lumbar = recordingContext();
  const all = drawLevelEditor(lumbar.ctx, EDITOR_CANVAS, lumbarEditor('L3'), { pixelRatio: 1 });
  assert.deepEqual(all.map(p => p.code), ['L1', 'L2', 'L3', 'L4', 'L5', 'S1'], 'no plate for a head');
  // fakeGeometry's L1 faces left: SP [20,10] and IP [20,20], the anchor [20,15].
  assert.deepEqual(all[0], { code: 'L1', x: 34, y: 6, width: 22, height: 18 });
  const mirrored = recordingContext();
  assert.deepEqual(drawLevelEditor(mirrored.ctx, EDITOR_CANVAS, setLevelGeometry(emptyEditor(), 'L3', MIRRORED), {}),
    [{ code: 'L3', x: 24, y: 26, width: 22, height: 18 }]);

  const off = recordingContext();
  assert.deepEqual(drawLevelEditor(off.ctx, EDITOR_CANVAS, lumbarEditor(), { overlays: false, pixelRatio: 1 }), [], 'overlays off, nothing selected: no plate');
  const selectedOnly = recordingContext();
  assert.deepEqual(drawLevelEditor(selectedOnly.ctx, EDITOR_CANVAS, lumbarEditor('L2'), { overlays: false, pixelRatio: 1 }).map(p => p.code), ['L2']);
  const placing = recordingContext();
  assert.deepEqual(drawLevelEditor(placing.ctx, EDITOR_CANVAS, startPlacing(lumbarEditor(), 'L3'), { pixelRatio: 1 }).map(p => p.code),
    ['L1', 'L2', 'L4', 'L5', 'S1'], 'the level being placed has no plate');
  const empty = recordingContext();
  assert.deepEqual(drawLevelEditor(empty.ctx, EDITOR_CANVAS, emptyEditor(), { pixelRatio: 1 }), []);
});

test('drawDynamicLayer returns the editor\'s plates in edit mode and none outside it, passing the side and the offsets', () => {
  const inEdit = recordingContext();
  const plates = drawDynamicLayer(inEdit.ctx, EDITOR_CANVAS, null, {
    editor: setLevelGeometry(emptyEditor(), 'T4', { centroid: [45, 30] }), pixelRatio: 1, anteriorSide: 'right', platePositions: { T4: [1, 2] },
  });
  assert.deepEqual(plates, [{ code: 'T4', x: 45 - 14 - 22 + 1, y: 21 + 2, width: 22, height: 18 }]);
  const outside = recordingContext();
  assert.deepEqual(drawDynamicLayer(outside.ctx, EDITOR_CANVAS, fakeGeometry(), { selectedLevel: 'L3', measurements: fullMeasurements(), editing: false }), []);
  const bare = recordingContext();
  assert.deepEqual(drawDynamicLayer(bare.ctx, EDITOR_CANVAS, null, { editing: false }), []);
});

test('sizes that are screen sizes scale with the pixel ratio', () => {
  const { calls, painted } = drawEditor(setLevelGeometry(lumbarEditor('L3'), 'L2', { superior: [[8, 28], [20, 30]], inferior: [[10, 40], [20, 40]] }), { pixelRatio: 2, handle: { code: 'L3', handle: 'SA' } });
  assert.equal(arcsOf(calls).filter(([, , radius]) => radius === 6).length, 4, 'handles are 3 CSS px at ratio 2, the floor (G8, D21)');
  assert.equal(arcsOf(calls).filter(([, , radius]) => radius === 10).length, 1, 'the ring is 5 CSS px');
  assert.deepEqual(painted.filter(p => p.name === 'stroke' && p.strokeStyle === STAGE_BG).map(p => p.lineWidth), [2, 2, 2, 2], 'the outline is 1 CSS px');
  assert.deepEqual(levelStrokes(painted).filter(p => p.strokeStyle === rgba(LEVEL_RGB.L4, 0.85)).map(p => p.lineWidth), [2.5]);
  assert.equal(dashed(calls, [6, 5]).length, 0);
  const ghost = drawEditor(setLevelGeometry(lumbarEditor('L2'), 'L2', { superior: [[8, 28], [20, 30]], inferior: [[10, 40], [20, 40]] }), { pixelRatio: 2 });
  assert.equal(dashed(ghost.calls, [12, 10]).length, 1);
});

test('past 1:1 the editor keeps its image-pixel size: a pixel ratio under 1 paints exactly as 1 does (R28)', () => {
  const size = { width: 200, height: 150 };
  const edited = { superior: [[8, 28], [20, 30]], inferior: [[10, 40], [20, 40]] };
  // Every screen-sized part between them: outlines, fills and label plates; the selected level's handles and the focus
  // ring; an edited level's dashed ghost; the C2 and T4 dots; a body placement's dots and dashed line; a femoral head
  // placement's dashed preview and centre dot.
  const scenes = [
    [setLevelGeometry(lumbarEditor('L3'), 'L2', edited), { handle: { code: 'L3', handle: 'SA' } }],
    [setLevelGeometry(lumbarEditor('L2'), 'L2', edited), {}],
    [setLevelGeometry(setLevelGeometry(emptyEditor(), 'C2', { inferior: [[30, 50], [60, 50]], centroid: [45, 30] }), 'T4', { centroid: [45, 10] }), {}],
    [addPoint(addPoint(startPlacing(emptyEditor(), 'L3'), [30, 20], size), [60, 20], size), {}],
    [addPoint(addPoint(startPlacing(emptyEditor(), 'FH1'), [20, 30], size), [60, 30], size), {}],
  ];
  for (const [editor, extra] of scenes) {
    const one = drawEditor(editor, { ...extra, pixelRatio: 1 });
    for (const pixelRatio of [0.25, 0.5, 0.999]) {
      const zoomed = drawEditor(editor, { ...extra, pixelRatio });
      assert.deepEqual(zoomed.calls, one.calls, `pixel ratio ${pixelRatio}: every path, radius, dash and plate as at 1`);
      assert.deepEqual(zoomed.painted, one.painted, `pixel ratio ${pixelRatio}: every width, dash and font as at 1`);
    }
  }

  const [handles, extra] = scenes[0];
  const { calls, painted } = drawEditor(handles, { ...extra, pixelRatio: 0.25 });
  assert.equal(arcsOf(calls).filter(([, , radius]) => radius === 6).length, 4, 'handles are 6 image px, not 1.5');
  assert.equal(arcsOf(calls).filter(([, , radius]) => radius === 10).length, 1, 'the ring is 10 image px');
  assert.deepEqual(painted.filter(p => p.name === 'stroke' && p.strokeStyle === STAGE_BG).map(p => p.lineWidth), [2, 2, 2, 2]);
  assert.equal(painted.find(p => p.name === 'fillText').font, "500 11px 'Chivo Mono', monospace");
  const ghost = drawEditor(scenes[1][0], { pixelRatio: 0.25 });
  assert.equal(dashed(ghost.calls, [6, 5]).length, 1, 'the ghost dash is 6 5 image px');
  const placing = drawEditor(scenes[3][0], { pixelRatio: 0.25 });
  assert.equal(placing.painted.find(p => p.name === 'stroke' && p.lineDash.length === 2).lineWidth, 1.5);

  const doubled = drawEditor(handles, { ...extra, pixelRatio: 2 });
  assert.equal(arcsOf(doubled.calls).filter(([, , radius]) => radius === 6).length, 4, 'below 1:1 the handles shrink with the film, 6 image px = 3 CSS px at ratio 2 (G8, D21)');
  assert.equal(doubled.painted.find(p => p.name === 'fillText').font, "500 22px 'Chivo Mono', monospace");
});

test('drawDynamicLayer outside edit mode keeps the hip line and markers at their image-pixel size past 1:1 (R28)', () => {
  const paint = (pixelRatio) => {
    const rec = recordingContext();
    drawDynamicLayer(rec.ctx, { width: 200, height: 150 }, fakeGeometry(), { selectedLevel: null, measurements: null, editing: false, pixelRatio });
    return rec;
  };
  const hipLine = (rec) => rec.painted.find(p => p.name === 'stroke' && p.lineDash.length === 2);
  const one = paint(1);
  for (const pixelRatio of [0.25, 0.5, 0.999]) {
    const past = paint(pixelRatio);
    assert.deepEqual([hipLine(past).lineWidth, hipLine(past).lineDash], [1.5, [4, 3]], `the 1.5 px line stays 1.5 at ${pixelRatio}`);
    assert.deepEqual(past.calls, one.calls, `the centre crosses and the midpoint diamond as at 1 (${pixelRatio})`);
  }
  const doubled = paint(2);
  assert.deepEqual([hipLine(doubled).lineWidth, hipLine(doubled).lineDash], [3, [8, 6]], 'below 1:1 it still scales');
});

test('a placement shows its points in the step colours and joins them with a dashed accent line', () => {
  let editor = startPlacing(emptyEditor(), 'L3');
  editor = addPoint(editor, [30, 20], { width: 200, height: 150 });
  const one = drawEditor(editor);
  assert.deepEqual(arcsOf(one.calls).map(([x, y, r]) => [x, y, r]), [[30, 20, 6]]);
  assert.equal(dashed(one.calls, [6, 5]).length, 0, 'one point: no line yet');

  editor = addPoint(editor, [60, 20], { width: 200, height: 150 });
  const { calls, painted } = drawEditor(editor);
  assert.deepEqual(arcsOf(calls).map(([x, y, r]) => [x, y, r]), [[30, 20, 6], [60, 20, 6]], 'two dots');
  assert.deepEqual(painted.filter(p => p.name === 'fill').map(p => p.fillStyle), [CORNER_COLORS.SA, CORNER_COLORS.SP]);
  assert.equal(dashed(calls, [6, 5]).length, 1);
  assert.ok(calls.some(([name, args]) => name === 'lineTo' && args[0] === 60 && args[1] === 20), 'the polyline');
  const line = painted.find(p => p.name === 'stroke' && p.lineDash.length === 2);
  assert.deepEqual([line.strokeStyle, line.lineWidth], [ACCENT, 1.5]);
  assert.deepEqual(painted.filter(p => p.name === 'stroke' && p.strokeStyle === STAGE_BG).map(p => p.lineWidth), [2, 2]);
  assert.deepEqual(labelsOf(calls), [], 'a placement is no placed level');
});

test('a placement in a chosen order draws each point in its own step colour, the line through them in step order', () => {
  const size = { width: 200, height: 150 };
  let editor = addPoint(setPlacingStep(startPlacing(emptyEditor(), 'L3'), 3), [60, 50], size);   // IP first
  const one = drawEditor(editor);
  assert.deepEqual(arcsOf(one.calls).map(([x, y, r]) => [x, y, r]), [[60, 50, 6]]);
  assert.deepEqual(one.painted.filter(p => p.name === 'fill').map(p => p.fillStyle), [CORNER_COLORS.IP]);
  assert.equal(dashed(one.calls, [6, 5]).length, 0, 'one point: no line yet');

  editor = addPoint(editor, [30, 20], size);   // SA, the first empty step
  const { calls, painted } = drawEditor(editor);
  assert.deepEqual(arcsOf(calls).map(([x, y, r]) => [x, y, r]), [[30, 20, 6], [60, 50, 6]], 'SA, then IP: step order');
  assert.deepEqual(painted.filter(p => p.name === 'fill').map(p => p.fillStyle), [CORNER_COLORS.SA, CORNER_COLORS.IP]);
  assert.equal(dashed(calls, [6, 5]).length, 1);
  assert.ok(calls.some(([name, args]) => name === 'moveTo' && args[0] === 30 && args[1] === 20), 'the line starts at SA');
  assert.ok(calls.some(([name, args]) => name === 'lineTo' && args[0] === 60 && args[1] === 50), 'and runs to IP');
});

test('the level being placed is not drawn, though it has geometry; its handles are not either', () => {
  const editor = startPlacing(selectLevel(lumbarEditor(), 'L3'), 'L3');
  const { calls } = drawEditor(editor);
  assert.deepEqual(labelsOf(calls), ['L1', 'L2', 'L4', 'L5', 'S1']);
  assert.equal(arcsOf(calls).length, 2, 'the two circles, no handles, no points yet');
});

test('a placement uses the step colour of each kind and finishes at its last point', () => {
  const size = { width: 200, height: 150 };
  const t1 = addPoint(startPlacing(emptyEditor(), 'T1'), [10, 10], size);
  assert.deepEqual(drawEditor(t1).painted.filter(p => p.name === 'fill').map(p => p.fillStyle), [CORNER_COLORS.SA]);
  const c2 = addPoint(addPoint(startPlacing(emptyEditor(), 'C2'), [10, 10], size), [40, 14], size);
  assert.deepEqual(drawEditor(c2).painted.filter(p => p.name === 'fill').map(p => p.fillStyle), [CORNER_COLORS.IA, CORNER_COLORS.IP]);
  assert.equal(dashed(drawEditor(c2).calls, [6, 5]).length, 1, 'the c2 polyline');
  assert.equal(addPoint(c2, [25, 4], size).placing, null, 'the third click finishes C2');
  assert.equal(addPoint(t1, [40, 14], size).placing, null, 'the second click finishes T1');
});

test('a femoral head placement previews the fitted circle dashed, with a centre dot, once it has two points', () => {
  const size = { width: 200, height: 150 };
  let editor = addPoint(startPlacing(emptyEditor(), 'FH1'), [20, 30], size);
  const one = drawEditor(editor);
  assert.deepEqual(arcsOf(one.calls).map(([x, y, r]) => [x, y, r]), [[20, 30, 6]]);
  assert.equal(dashed(one.calls, [6, 5]).length, 0);

  editor = addPoint(editor, [60, 30], size);
  const { calls, painted } = drawEditor(editor);
  const arcs = arcsOf(calls).map(([x, y, r]) => [x, y, r]);
  assert.deepEqual(arcs, [[40, 30, 20], [20, 30, 6], [60, 30, 6], [40, 30, 3.5]], 'preview, two rim points, centre dot');
  assert.equal(dashed(calls, [6, 5]).length, 1);
  assert.ok(!calls.some(([name]) => name === 'lineTo'), 'no polyline for a circle');
  const preview = painted.find(p => p.name === 'stroke' && p.lineDash.length === 2);
  assert.deepEqual([preview.strokeStyle, preview.lineWidth], [ACCENT, 1.5]);
  const fills = painted.filter(p => p.name === 'fill').map(p => p.fillStyle);
  assert.deepEqual(fills, [TRACE_COLOR, TRACE_COLOR, ACCENT]);

  const three = drawEditor(addPoint(editor, [40, 50], size));
  const fitted = arcsOf(three.calls);
  assert.equal(fitted.length, 1 + 3 + 1, 'preview, three rim points, centre dot');
  assert.ok(fitted[0].slice(0, 3).every(Number.isFinite), 'the three-point fit is a finite circle');
});

test('a drag draws the dragged geometry for that level only, with its handles and ghost', () => {
  const moved = { superior: [[5, 45], [20, 50]], inferior: [[10, 60], [20, 60]] };
  const { calls } = drawEditor(lumbarEditor('L3'), { dragGeometry: { code: 'L3', geometry: moved } });
  const handles = arcsOf(calls).filter(([, , radius]) => radius === 6).map(([x, y]) => [x, y]);
  assert.deepEqual(handles, [[5, 45], [20, 50], [10, 60], [20, 60]]);
  assert.equal(dashed(calls, [6, 5]).length, 1, 'dragged away from the model: the ghost shows');
  assert.ok(calls.some(([name, args]) => name === 'moveTo' && args[0] === 5 && args[1] === 45));
  const other = drawEditor(lumbarEditor('L3'), { dragGeometry: { code: 'L2', geometry: moved } });
  assert.deepEqual(arcsOf(other.calls).filter(([, , radius]) => radius === 6).map(([x, y]) => [x, y]), [[10, 50], [20, 50], [10, 60], [20, 60]]);
  assert.equal(dashed(other.calls, [6, 5]).length, 0);
});

test('the editor restores the context state it changes', () => {
  const moved = { superior: [[8, 28], [20, 30]], inferior: [[10, 40], [20, 40]] };
  const size = { width: 200, height: 150 };
  const ghost = setLevelGeometry(lumbarEditor('L2'), 'L2', moved);
  const placing = addPoint(addPoint(startPlacing(emptyEditor(), 'FH2'), [20, 30], size), [60, 30], size);
  for (const [editor, extra] of [[ghost, { handle: { code: 'L2', handle: 'SA' } }], [placing, {}], [lumbarEditor('L3'), {}]]) {
    const { calls, painted } = drawEditor(editor, extra);
    assert.equal(calls.filter(([name]) => name === 'save').length, calls.filter(([name]) => name === 'restore').length);
    assert.ok(calls.some(([name]) => name === 'save'));
    assert.ok(painted.length > 0);
  }
  const rec = recordingContext();
  rec.ctx.textBaseline = 'alphabetic';
  rec.ctx.lineWidth = 7;
  drawLevelEditor(rec.ctx, EDITOR_CANVAS, ghost, { overlays: true, overlayOpacity: 50, pixelRatio: 1, handle: null, dragGeometry: null });
  assert.equal(rec.ctx.textBaseline, 'alphabetic');
  assert.equal(rec.ctx.lineWidth, 7);
  assert.deepEqual(rec.ctx.lineDash, []);
});

test('drawDynamicLayer with an editor skips the region outlines, S1 line, C7 cross and femoral drawing', () => {
  const geometry = { ...fakeGeometry(), region: 'full_spine', c7_centroid: [50, 5] };
  const { ctx, calls, painted } = recordingContext();
  drawDynamicLayer(ctx, EDITOR_CANVAS, geometry, {
    selectedLevel: null, measurements: null, editing: true, editor: emptyEditor(), pixelRatio: 1,
    selection: { kind: 'landmark', level: 'L2', corner: 'SA' }, retracing: true, tracePoints: [[30, 30], [40, 30]],
  });
  assert.deepEqual(calls.filter(([name]) => !['clearRect', 'save', 'restore'].includes(name)), [],
    'an editor with nothing placed draws nothing: no outlines, no S1 line, no C7 cross, no femoral circles, no old handles, no trace points');
  assert.deepEqual(painted, []);
  const lumbar = recordingContext();
  drawDynamicLayer(lumbar.ctx, EDITOR_CANVAS, fakeGeometry(), { editing: true, editor: lumbarEditor(), pixelRatio: 1 });
  assert.equal(dashed(lumbar.calls, [4, 3]).length, 0, 'no hip midpoint connection');
  assert.ok(!lumbar.painted.some(p => p.fillStyle === STAGE_BG), 'no midpoint diamond');
  assert.ok(!lumbar.painted.some(p => p.name === 'stroke' && String(p.strokeStyle).startsWith('rgb(')), 'only the editor strokes, in rgba');
});

test('drawDynamicLayer with an editor draws the selected measurement construction first, then the editor', () => {
  const { ctx, calls, painted } = recordingContext();
  drawDynamicLayer(ctx, EDITOR_CANVAS, fakeGeometry(), {
    selectedLevel: 'SS', measurements: fullMeasurements(), editing: true, editor: lumbarEditor(), pixelRatio: 1,
  });
  const strokes = painted.filter(p => p.name === 'stroke');
  assert.equal(strokes[0].strokeStyle, ACCENT, 'the SS construction');
  assert.ok(strokes.length > 2);
  assert.deepEqual(labelsOf(calls), ['L1', 'L2', 'L3', 'L4', 'L5', 'S1']);
});

test('drawDynamicLayer with an editor and no geometry (a failed film) still draws the editor', () => {
  const editor = setLevelGeometry(emptyEditor(), 'L3', BODY);
  const { ctx, calls } = recordingContext();
  assert.doesNotThrow(() => drawDynamicLayer(ctx, EDITOR_CANVAS, null, {
    selectedLevel: 'L3', measurements: fullMeasurements(), editing: true, editor: selectLevel(editor, 'L3'), pixelRatio: 1,
  }));
  assert.equal(arcsOf(calls).length, 4, "L3's four handles");
  assert.deepEqual(labelsOf(calls), ['L3']);
  const bare = recordingContext();
  drawDynamicLayer(bare.ctx, EDITOR_CANVAS, null, { editing: false });
  assert.deepEqual(bare.calls, [['clearRect', [0, 0, 200, 150]]], 'without an editor a null geometry still draws nothing');
});

test('drawDynamicLayer passes the overlay, opacity, handle and drag options to the editor', () => {
  const moved = { superior: [[5, 45], [20, 50]], inferior: [[10, 60], [20, 60]] };
  const { ctx, calls, painted } = recordingContext();
  drawDynamicLayer(ctx, EDITOR_CANVAS, fakeGeometry(), {
    editor: lumbarEditor('L3'), overlays: false, overlayOpacity: 80, pixelRatio: 3, handle: { code: 'L3', handle: 'IP' }, dragGeometry: { code: 'L3', geometry: moved },
  });
  assert.equal(arcsOf(calls).filter(([, , radius]) => radius === 9).length, 4, 'pixelRatio reaches the handles: 3 CSS px at 3, 9 image px (G8, D21); ratio 1 would draw 6');
  assert.equal(arcsOf(calls).filter(([, , radius]) => Math.abs(radius - 15) < 1e-9).length, 1, 'the focused handle ring: 15 image px at 3; ratio 1 would draw 10');
  assert.ok(arcsOf(calls).some(([x, y, radius]) => x === 5 && y === 45 && radius === 9), 'the drag geometry');
  assert.deepEqual(painted.filter(p => p.name === 'fill' && String(p.fillStyle).startsWith('rgba(') && p.fillStyle !== PLATE), [], 'overlays false: no level fill');
  const defaults = recordingContext();
  drawDynamicLayer(defaults.ctx, EDITOR_CANVAS, fakeGeometry(), { editor: lumbarEditor() });
  assert.equal(defaults.painted.find(p => p.name === 'fill').fillStyle, rgba(LEVEL_RGB.L1, half), 'overlays on at 50 by default');
});


test('thumbnailSize scales the long edge down to the limit and never up', () => {
  assert.deepEqual(thumbnailSize(1000, 2000), [64, 128]);
  assert.deepEqual(thumbnailSize(2000, 1000, 128), [128, 64]);
  assert.deepEqual(thumbnailSize(100, 50), [100, 50]);
  assert.deepEqual(thumbnailSize(0, 0), [1, 1]);
});

test('hip midpoint marker and centre connection require two circles', () => {
  const geometry = fakeGeometry();
  const full = recordingContext();
  drawDynamicLayer(full.ctx, { width: 200, height: 150 }, geometry, { editing: false });
  assert.ok(full.calls.some(([name, [dash]]) => name === 'setLineDash' && dash.length === 2));
  assert.equal(full.calls.filter(([name]) => name === 'fill').length, 1, 'one midpoint diamond');
  geometry.femoral_circles.pop(); geometry.hip_midpoint = null;
  const partial = recordingContext();
  drawDynamicLayer(partial.ctx, { width: 200, height: 150 }, geometry, { editing: false });
  assert.equal(arcCount(partial.calls), 1);
  assert.equal(partial.calls.filter(([name]) => name === 'fill').length, 0, 'no bilateral midpoint for one head');
});

// (2026-10-10, level editor) The static layer: the film, optionally windowed from the decoded
// original, and the mask overlay, which edit mode never draws.
const FILM = { name: 'film' };
const OVERLAY = { name: 'overlay' };
const STAGE = { width: 2, height: 1 };

// A RawFilm two pixels wide and one row high: values 0 and 100.
function rawFilm() {
  return { pixels: new Uint16Array([0, 100]), width: 2, height: 1, valueMin: 0, valueMax: 100, bitsStored: 16, window: null, scale: 1 };
}

// ImageData is a browser global; this stand-in keeps what it was built from.
class FakeImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

function withImageData(body) {
  const saved = globalThis.ImageData;
  globalThis.ImageData = FakeImageData;
  try {
    return body();
  } finally {
    globalThis.ImageData = saved;
  }
}

test('drawStaticLayer without the new options draws the film, then the overlay at the chosen opacity', () => {
  const { ctx, calls, writes } = recordingContext();
  drawStaticLayer(ctx, STAGE, { image: FILM, overlayCanvas: OVERLAY }, { overlays: true, overlayOpacity: 50 });
  assert.deepEqual(calls, [['clearRect', [0, 0, 2, 1]], ['drawImage', [FILM, 0, 0]], ['drawImage', [OVERLAY, 0, 0]]]);
  assert.deepEqual(writes, [['globalAlpha', 0.5], ['globalAlpha', 1]]);
});

test('drawStaticLayer in edit mode never draws the mask overlay', () => {
  const { ctx, calls, writes } = recordingContext();
  drawStaticLayer(ctx, STAGE, { image: FILM, overlayCanvas: OVERLAY }, { overlays: true, overlayOpacity: 50, editing: true });
  assert.deepEqual(calls.filter(([name]) => name === 'drawImage'), [['drawImage', [FILM, 0, 0]]]);
  assert.deepEqual(writes, [], 'no globalAlpha write');
});

test('drawStaticLayer with a window and a decoded film puts the windowed pixels and does not draw the stored image', () => {
  withImageData(() => {
    const { ctx, calls } = recordingContext();
    drawStaticLayer(ctx, STAGE, { image: FILM, overlayCanvas: OVERLAY, raw: rawFilm() },
      { overlays: false, overlayOpacity: 50, window: { width: 100, level: 50 } });
    assert.equal(calls.filter(([name]) => name === 'drawImage').length, 0);
    const puts = calls.filter(([name]) => name === 'putImageData');
    assert.equal(puts.length, 1);
    const [imageData, x, y] = puts[0][1];
    assert.ok(imageData instanceof FakeImageData);
    assert.deepEqual([imageData.width, imageData.height, x, y], [2, 1, 0, 0]);
    assert.deepEqual([...imageData.data], [0, 0, 0, 255, 255, 255, 255, 255]);
  });
});

test('drawStaticLayer with a window draws the overlay over the windowed film outside edit mode', () => {
  withImageData(() => {
    const { ctx, calls } = recordingContext();
    drawStaticLayer(ctx, STAGE, { image: FILM, overlayCanvas: OVERLAY, raw: rawFilm() },
      { overlays: true, overlayOpacity: 100, window: { width: 100, level: 50 } });
    assert.deepEqual(calls.map(([name]) => name), ['clearRect', 'putImageData', 'drawImage']);
    assert.equal(calls[2][1][0], OVERLAY);
  });
});

test('drawStaticLayer with a window but no decoded film draws the stored image', () => {
  const { ctx, calls } = recordingContext();
  drawStaticLayer(ctx, STAGE, { image: FILM, overlayCanvas: null }, { overlays: true, overlayOpacity: 50, window: { width: 100, level: 50 } });
  assert.deepEqual(calls, [['clearRect', [0, 0, 2, 1]], ['drawImage', [FILM, 0, 0]]]);
});

test('imagesFromRaw paints the windowed film into a canvas and returns a preview images object', () => {
  const savedDocument = globalThis.document;
  const painted = [];
  const canvas = { width: 0, height: 0, getContext: () => ({ putImageData: (...args) => painted.push(args) }) };
  globalThis.document = { createElement: (tag) => { assert.equal(tag, 'canvas'); return canvas; } };
  try {
    withImageData(() => {
      const film = rawFilm();
      const images = imagesFromRaw(film, { width: 100, level: 50 });
      assert.deepEqual(images, { image: canvas, mask: null, overlayCanvas: null, width: 2, height: 1, raw: film, preview: true });
      assert.deepEqual([canvas.width, canvas.height], [2, 1]);
      assert.equal(painted.length, 1);
      assert.deepEqual([...painted[0][0].data], [0, 0, 0, 255, 255, 255, 255, 255]);
    });
  } finally {
    globalThis.document = savedDocument;
  }
});

test('disposeStudyImages closes bitmaps and tolerates a canvas image', () => {
  const closed = [];
  disposeStudyImages({ image: { close: () => closed.push('image') }, mask: { close: () => closed.push('mask') } });
  assert.deepEqual(closed, ['image', 'mask']);
  assert.doesNotThrow(() => disposeStudyImages({ image: { width: 2, height: 1 }, mask: null }));
  assert.doesNotThrow(() => disposeStudyImages(null));
});
