import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVEL_GROUPS, LEVEL_CODES, MEASUREMENT_INPUTS,
  kindOf, groupOf, rowName, fullName, filmTypeDefaults, sameGeometry, levelState, badgeFor,
  placementSteps, geometryFromPoints, fitRim, synthesizeRim, levelsFromGeometry, openEditor,
  toggleVisible, toggleGroup, toggleOpen, selectLevel, startPlacing, addPoint, undoPoint, cancelPlacing,
  finishPlacing, canFinishPlacing, clearLevel, setLevelGeometry, unsavedCount, canSave, unsavedText, summaryText,
  groupCountText, groupCheckState, trainingStatus, placingLabel, placingHelp, dependencyNote,
  markSaved, revertToBaseline,
} from '../renderer/data/levels.js';
import { SEGMENTAL_PAIRS } from '../renderer/data/segmental.js';
import { DISC_LEVEL_PAIRS } from '../renderer/data/disc-heights.js';

const IMAGE = { width: 200, height: 160 };
const DASH = '\u2014';

// ---------- fixtures (inline: the study geometry shape the app stores) ----------

function body(x, y) {
  return {
    superior: [[x, y], [x + 10, y]],
    inferior: [[x, y + 10], [x + 10, y + 10]],
    quadrilateral: [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]],
  };
}

// A lumbar film with L3 missing: L1, L2, L4, L5, S1 and both femoral heads.
function lumbarGeometry() {
  return {
    region: 'lumbar',
    vertebrae: { L1: body(10, 10), L2: body(10, 30), L4: body(10, 70), L5: body(10, 90) },
    s1_superior: [[10, 110], [20, 110]],
    femoral_circles: [[10, 140, 5], [20, 140, 5]],
  };
}

function cervicalGeometry() {
  return {
    region: 'cervical',
    vertebrae: {
      C2: { superior: null, inferior: [[40, 20], [50, 20]], quadrilateral: null },
      C3: body(10, 30), C4: body(10, 50), C5: body(10, 70), C6: body(10, 90), C7: body(10, 110),
    },
    c2_centroid: [45, 12],
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function lumbarEditor(extra = {}) {
  return openEditor({
    study: { id: 'SP-0001', geometry: lumbarGeometry(), labelFile: null },
    region: 'lumbar', modelGeometry: lumbarGeometry(), saved: null, ...extra,
  });
}

function blankEditor(region = 'lumbar') {
  return openEditor({ study: { id: 'SP-0002', geometry: null, labelFile: null }, region, modelGeometry: null, saved: null });
}

// ---------- codes, groups, names ----------

test('LEVEL_CODES lists the sixteen levels in panel order', () => {
  assert.deepEqual(LEVEL_CODES,
    ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1', 'T4', 'L1', 'L2', 'L3', 'L4', 'L5', 'S1', 'FH1', 'FH2']);
});

test('LEVEL_GROUPS are the five groups in handoff order with the verbatim ranges', () => {
  assert.deepEqual(LEVEL_GROUPS.map(g => g.key), ['cervical', 'thoracic', 'lumbar', 'sacral', 'femoral']);
  assert.deepEqual(LEVEL_GROUPS.map(g => g.title), ['Cervical', 'Thoracic', 'Lumbar', 'Sacral', 'Femoral heads']);
  assert.deepEqual(LEVEL_GROUPS.map(g => g.range),
    ['C2–C7', 'T1 · T4', 'L1–L5', 'S1 ENDPLATE', '2–4 RIM POINTS']);
  assert.deepEqual(LEVEL_GROUPS.flatMap(g => g.codes), LEVEL_CODES);
});

test('kindOf names the placement kind of every level', () => {
  assert.equal(kindOf('C2'), 'c2');
  for (const code of ['C3', 'C4', 'C5', 'C6', 'C7', 'L1', 'L2', 'L3', 'L4', 'L5']) assert.equal(kindOf(code), 'body', code);
  assert.equal(kindOf('T1'), 'endplate');
  assert.equal(kindOf('S1'), 'endplate');
  assert.equal(kindOf('T4'), 'centroid');
  assert.equal(kindOf('FH1'), 'circle');
  assert.equal(kindOf('FH2'), 'circle');
});

test('groupOf returns the group key of every level', () => {
  assert.deepEqual(LEVEL_CODES.map(groupOf), [
    'cervical', 'cervical', 'cervical', 'cervical', 'cervical', 'cervical', 'thoracic', 'thoracic',
    'lumbar', 'lumbar', 'lumbar', 'lumbar', 'lumbar', 'sacral', 'femoral', 'femoral',
  ]);
});

test('rowName and fullName give the panel row and the sentence names', () => {
  assert.deepEqual(LEVEL_CODES.map(rowName), [
    'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1 endplate', 'T4 centroid', 'L1', 'L2', 'L3', 'L4', 'L5', 'S1', 'Head 1', 'Head 2',
  ]);
  assert.deepEqual(LEVEL_CODES.map(fullName), [
    'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1 superior endplate', 'T4 centroid', 'L1', 'L2', 'L3', 'L4', 'L5', 'S1',
    'femoral head 1', 'femoral head 2',
  ]);
});

// ---------- film-type defaults ----------

test('filmTypeDefaults picks the visible-at-start levels per film type (D5, D6)', () => {
  assert.deepEqual([...filmTypeDefaults('lumbar')].sort(), ['FH1', 'FH2', 'L1', 'L2', 'L3', 'L4', 'L5', 'S1']);
  assert.deepEqual([...filmTypeDefaults('cervical')].sort(), ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1']);
  assert.equal(filmTypeDefaults('full_spine').size, 16);
  assert.equal(filmTypeDefaults('auto').size, 16);
  assert.equal(filmTypeDefaults(null).size, 16);
  assert.equal(filmTypeDefaults(undefined).size, 16);
  assert.equal(filmTypeDefaults('constructor').size, 16, 'inherited object keys are not regions');
  assert.ok(filmTypeDefaults('cervical') instanceof Set);
});

// ---------- geometry comparison and state ----------

test('sameGeometry compares within eps and treats null as equal to null', () => {
  const g = { superior: [[1, 2], [3, 4]], inferior: [[1, 6], [3, 8]] };
  assert.equal(sameGeometry(null, null), true);
  assert.equal(sameGeometry(undefined, null), true);
  assert.equal(sameGeometry(g, null), false);
  assert.equal(sameGeometry(null, g), false);
  assert.equal(sameGeometry(g, structuredClone(g)), true);
  const nudged = structuredClone(g);
  nudged.superior[0][0] += 1e-9;
  assert.equal(sameGeometry(g, nudged), true, 'inside the default 1e-6');
  nudged.superior[0][0] += 0.01;
  assert.equal(sameGeometry(g, nudged), false);
  assert.equal(sameGeometry(g, nudged, 0.1), true, 'a looser eps');
  assert.equal(sameGeometry(g, { superior: g.superior }), false, 'a missing pair is a difference');
  const c2 = { inferior: [[1, 2], [3, 4]], centroid: [2, 1] };
  assert.equal(sameGeometry(c2, { ...c2, centroid: [2, 1.5] }), false);
});

test('sameGeometry compares circles by centre and radius only', () => {
  const circle = { center: [10, 20], radius: 5, rim: null };
  assert.equal(sameGeometry(circle, { center: [10, 20], radius: 5, rim: [[5, 20], [15, 20]] }), true);
  assert.equal(sameGeometry(circle, { center: [10, 20], radius: 5.5, rim: null }), false);
  assert.equal(sameGeometry(circle, { center: [10, 21], radius: 5, rim: null }), false);
});

test('levelState derives the five states from visibility, geometry and the model', () => {
  const g = { superior: [[1, 2], [3, 4]], inferior: [[1, 6], [3, 8]] };
  const moved = { superior: [[1, 2], [3, 5]], inferior: [[1, 6], [3, 8]] };
  assert.equal(levelState({ visible: true, geometry: g }, g), 'segmented');
  assert.equal(levelState({ visible: true, geometry: moved }, g), 'edited');
  assert.equal(levelState({ visible: true, geometry: g }, null), 'manual');
  assert.equal(levelState({ visible: true, geometry: null }, null), 'not_placed');
  assert.equal(levelState({ visible: false, geometry: g }, g), 'not_visible');
  assert.equal(levelState({ visible: true, geometry: null }, g), 'not_placed', 'a model level the annotator cleared');
  assert.equal(levelState({ visible: false, geometry: null }, null), 'not_visible', 'hidden wins over unplaced');
});

test('badgeFor maps each state to its class and label, and Placing… overrides', () => {
  assert.deepEqual(badgeFor('segmented', false), { className: 'badge badge-seg', label: 'Segmented' });
  assert.deepEqual(badgeFor('edited', false), { className: 'badge badge-ok', label: 'Edited' });
  assert.deepEqual(badgeFor('manual', false), { className: 'badge badge-ok', label: 'Manual' });
  assert.deepEqual(badgeFor('not_placed', false), { className: 'badge badge-rev', label: 'Not placed' });
  assert.deepEqual(badgeFor('not_visible', false), { className: 'badge badge-proc', label: 'Not visible' });
  for (const state of ['segmented', 'edited', 'manual', 'not_placed', 'not_visible']) {
    assert.deepEqual(badgeFor(state, true), { className: 'badge badge-rev', label: 'Placing…' }, state);
  }
  assert.equal(badgeFor('segmented').label, 'Segmented', 'placing is optional');
});

// ---------- placement ----------

test('placementSteps describes a vertebral body: four corners SA SP IA IP', () => {
  assert.deepEqual(placementSteps('L3'), {
    need: 4, fitFrom: 4,
    steps: [
      { label: 'SA', help: 'Click the superior-anterior corner (SA).', colorKey: 'SA' },
      { label: 'SP', help: 'Click the superior-posterior corner (SP).', colorKey: 'SP' },
      { label: 'IA', help: 'Click the inferior-anterior corner (IA).', colorKey: 'IA' },
      { label: 'IP', help: 'Click the inferior-posterior corner (IP).', colorKey: 'IP' },
    ],
  });
  assert.deepEqual(placementSteps('C5'), placementSteps('L3'));
});

test('placementSteps describes C2: IA, IP and the centroid', () => {
  assert.deepEqual(placementSteps('C2'), {
    need: 3, fitFrom: 3,
    steps: [
      { label: 'IA', help: 'Click the inferior-anterior corner of C2 (IA).', colorKey: 'IA' },
      { label: 'IP', help: 'Click the inferior-posterior corner of C2 (IP).', colorKey: 'IP' },
      { label: 'CENTROID', help: 'Click the centroid of the C2 body.', colorKey: 'level' },
    ],
  });
});

test('placementSteps describes the T1 and S1 endplates', () => {
  assert.deepEqual(placementSteps('T1'), {
    need: 2, fitFrom: 2,
    steps: [
      { label: 'ANT', help: 'Click the anterior corner of the T1 superior endplate.', colorKey: 'SA' },
      { label: 'POST', help: 'Click the posterior corner of the T1 superior endplate.', colorKey: 'SP' },
    ],
  });
  assert.equal(placementSteps('S1').steps[0].help, 'Click the anterior corner of the S1 superior endplate.');
  assert.equal(placementSteps('S1').steps[1].help, 'Click the posterior corner of the S1 superior endplate.');
});

test('placementSteps describes the T4 centroid', () => {
  assert.deepEqual(placementSteps('T4'), {
    need: 1, fitFrom: 1,
    steps: [{ label: 'CENTROID', help: 'Click the centroid of T4.', colorKey: 'level' }],
  });
});

test('placementSteps describes a femoral head: four rim points, fit from two', () => {
  assert.deepEqual(placementSteps('FH1'), {
    need: 4, fitFrom: 2,
    steps: [
      { label: 'P1', help: 'Click a point on the rim of the femoral head.', colorKey: 'trace' },
      { label: 'P2', help: 'Click a second rim point. Two points are read as the ends of a diameter.', colorKey: 'trace' },
      { label: 'P3', help: 'Fit now, or click up to 2 more rim points for a better fit.', colorKey: 'trace' },
      { label: 'P4', help: 'Fit now, or click one more rim point.', colorKey: 'trace' },
    ],
  });
  assert.deepEqual(placementSteps('FH2'), placementSteps('FH1'));
});

test('geometryFromPoints builds each kind from its clicks in order', () => {
  const p = [[1, 2], [3, 4], [5, 6], [7, 8]];
  assert.deepEqual(geometryFromPoints('L2', p), { superior: [[1, 2], [3, 4]], inferior: [[5, 6], [7, 8]] });
  assert.deepEqual(geometryFromPoints('C2', p.slice(0, 3)), { inferior: [[1, 2], [3, 4]], centroid: [5, 6] });
  assert.deepEqual(geometryFromPoints('S1', p.slice(0, 2)), { superior: [[1, 2], [3, 4]] });
  assert.deepEqual(geometryFromPoints('T1', p.slice(0, 2)), { superior: [[1, 2], [3, 4]] });
  assert.deepEqual(geometryFromPoints('T4', p.slice(0, 1)), { centroid: [1, 2] });
});

test('geometryFromPoints fits a femoral circle with the image diagonal as the radius cap', () => {
  const rim = [[120, 100], [100, 120], [80, 100], [100, 80]];
  assert.deepEqual(geometryFromPoints('FH1', rim, IMAGE), { center: [100, 100], radius: 20, rim });
  // Nearly collinear rim points fit a circle far larger than the film: fall back to the diameter.
  const flat = geometryFromPoints('FH2', [[0, 0], [100, 0], [199, 1]], IMAGE);
  assert.ok(flat.radius < 150, `radius ${flat.radius}`);
  assert.deepEqual(flat.center, [99.5, 0.5]);
});

test('fitRim reads two points as the ends of a diameter', () => {
  assert.deepEqual(fitRim([[0, 0], [10, 0]], 1000), { center: [5, 0], radius: 5, rim: [[0, 0], [10, 0]] });
  assert.equal(fitRim([[0, 0], [1, 1]], 1000).radius, 0.7, 'rounded to 0.1 px');
  assert.deepEqual(fitRim([[0, 0], [1, 1]], 1000).center, [0.5, 0.5]);
  assert.equal(fitRim([[4, 4], [4, 4]], 1000).radius, 0, 'a tiny radius is accepted (handoff 11)');
});

test('fitRim fits three or four points as a circle', () => {
  const three = fitRim([[10, 0], [0, 10], [-10, 0]], 1000);
  assert.deepEqual(three.center, [0, 0]);
  assert.equal(three.radius, 10);
  const four = fitRim([[120, 100], [100, 120], [80, 100], [100, 80]], 1000);
  assert.deepEqual([four.center, four.radius], [[100, 100], 20]);
  assert.equal(four.rim.length, 4, 'the rim is kept as given');
});

test('fitRim falls back to the farthest pair when the fit is degenerate or absurd', () => {
  assert.deepEqual(fitRim([[0, 0], [10, 0], [20, 0]], 1000).center, [10, 0]);   // collinear
  assert.equal(fitRim([[0, 0], [10, 0], [20, 0]], 1000).radius, 10);
  const shallow = [[0, 0], [100, 0], [200, 1]];
  assert.ok(fitRim(shallow, 20000).radius > 9000, 'a legitimate huge circle when the cap allows it');
  const capped = fitRim(shallow, 1000);
  assert.deepEqual(capped.center, [100, 0.5]);
  assert.equal(capped.radius, 100);
  assert.deepEqual(capped.rim, shallow, 'the rim keeps every point given');
});

test('fitRim copies the rim points and returns null below two points', () => {
  const pts = [[0, 0], [10, 0]];
  const fit = fitRim(pts, 1000);
  assert.notEqual(fit.rim, pts);
  assert.notEqual(fit.rim[0], pts[0]);
  assert.equal(fitRim([[1, 1]], 1000), null);
  assert.equal(fitRim([], 1000), null);
});

test('synthesizeRim places four points at -45, 45, 135 and 225 degrees (y down)', () => {
  const rim = synthesizeRim({ center: [100, 50], radius: 10, rim: null });
  const k = 10 * Math.SQRT1_2;
  const expected = [[100 + k, 50 - k], [100 + k, 50 + k], [100 - k, 50 + k], [100 - k, 50 - k]];
  assert.equal(rim.length, 4);
  rim.forEach((point, i) => {
    assert.ok(Math.abs(point[0] - expected[i][0]) < 1e-9 && Math.abs(point[1] - expected[i][1]) < 1e-9, `point ${i}`);
  });
});

test('refitting a synthesized rim reproduces the circle', () => {
  const circle = { center: [100.5, 50.5], radius: 12.3, rim: null };
  const refit = fitRim(synthesizeRim(circle), 1000);
  assert.deepEqual([refit.center, refit.radius], [[100.5, 50.5], 12.3]);
});

// ---------- the study geometry projection ----------

test('levelsFromGeometry reads the lumbar fixture and leaves the missing level null', () => {
  const levels = levelsFromGeometry(lumbarGeometry());
  assert.deepEqual(Object.keys(levels), LEVEL_CODES);
  assert.deepEqual(levels.L1, { superior: [[10, 10], [20, 10]], inferior: [[10, 20], [20, 20]] });
  assert.equal(levels.L3, null);
  assert.deepEqual(levels.S1, { superior: [[10, 110], [20, 110]] });
  assert.deepEqual(levels.FH1, { center: [10, 140], radius: 5, rim: null });
  assert.deepEqual(levels.FH2, { center: [20, 140], radius: 5, rim: null });
  for (const code of ['C2', 'C3', 'C7', 'T1', 'T4']) assert.equal(levels[code], null, code);
});

test('levelsFromGeometry reads C2 only when both its inferior pair and centroid exist', () => {
  const levels = levelsFromGeometry(cervicalGeometry());
  assert.deepEqual(levels.C2, { inferior: [[40, 20], [50, 20]], centroid: [45, 12] });
  assert.deepEqual(levels.C3, { superior: [[10, 30], [20, 30]], inferior: [[10, 40], [20, 40]] });
  assert.equal(levels.S1, null);
  assert.equal(levels.FH1, null);
  const noCentroid = cervicalGeometry();
  noCentroid.c2_centroid = null;
  assert.equal(levelsFromGeometry(noCentroid).C2, null);
  const noInferior = cervicalGeometry();
  noInferior.vertebrae.C2.inferior = null;
  assert.equal(levelsFromGeometry(noInferior).C2, null);
});

test('levelsFromGeometry needs both pairs of a body, and always leaves T1 and T4 null', () => {
  const geometry = lumbarGeometry();
  geometry.vertebrae.L3 = { superior: [[10, 50], [20, 50]], inferior: null, quadrilateral: null };
  geometry.vertebrae.T1 = body(10, 0);
  geometry.vertebrae.T4 = body(10, 5);
  const levels = levelsFromGeometry(geometry);
  assert.equal(levels.L3, null);
  assert.equal(levels.T1, null);
  assert.equal(levels.T4, null);
});

test('levelsFromGeometry maps one femoral circle to FH1 only', () => {
  const geometry = lumbarGeometry();
  geometry.femoral_circles = [[30, 40, 6]];
  const levels = levelsFromGeometry(geometry);
  assert.deepEqual(levels.FH1, { center: [30, 40], radius: 6, rim: null });
  assert.equal(levels.FH2, null);
});

test('levelsFromGeometry of no geometry is sixteen nulls, in a fresh object each time', () => {
  for (const empty of [null, undefined]) {
    const levels = levelsFromGeometry(empty);
    assert.deepEqual(Object.keys(levels), LEVEL_CODES);
    assert.ok(Object.values(levels).every(v => v === null));
  }
  assert.notEqual(levelsFromGeometry(null), levelsFromGeometry(null));
});

test('levelsFromGeometry does not share point arrays with the study geometry', () => {
  const geometry = lumbarGeometry();
  const levels = levelsFromGeometry(geometry);
  assert.notEqual(levels.L1.superior, geometry.vertebrae.L1.superior);
  assert.notEqual(levels.L1.superior[0], geometry.vertebrae.L1.superior[0]);
  assert.notEqual(levels.S1.superior, geometry.s1_superior);
});

// ---------- opening the editor ----------

test('openEditor on a lumbar film shows the lumbar defaults and records where each level came from', () => {
  const e = lumbarEditor();
  assert.deepEqual(Object.keys(e.levels), LEVEL_CODES);
  const visible = LEVEL_CODES.filter(c => e.levels[c].visible);
  assert.deepEqual(visible, ['L1', 'L2', 'L3', 'L4', 'L5', 'S1', 'FH1', 'FH2']);
  assert.equal(e.levels.L3.geometry, null);
  assert.equal(e.levels.L3.source, 'film_type');
  assert.equal(e.levels.L1.source, 'model');
  assert.equal(e.levels.C4.source, 'film_type');
  assert.deepEqual(e.levels.L1.geometry, levelsFromGeometry(lumbarGeometry()).L1);
  assert.equal(e.studyId, 'SP-0001');
  assert.equal(e.region, 'lumbar');
  assert.equal(e.selected, null);
  assert.equal(e.handle, null);
  assert.equal(e.placing, null);
  assert.equal(e.window, null);
  assert.equal(e.exitPrompt, null);
});

test('openEditor takes the model snapshot from modelGeometry, not from the study', () => {
  const edited = lumbarGeometry();
  edited.vertebrae.L1 = body(15, 10);
  const e = openEditor({ study: { id: 'x', geometry: edited }, region: 'lumbar', modelGeometry: lumbarGeometry(), saved: null });
  assert.deepEqual(e.model, levelsFromGeometry(lumbarGeometry()));
  assert.equal(levelState(e.levels.L1, e.model.L1), 'edited');
  assert.equal(levelState(e.levels.L2, e.model.L2), 'segmented');
  const none = openEditor({ study: { id: 'x', geometry: lumbarGeometry() }, region: 'lumbar', modelGeometry: null, saved: null });
  assert.ok(Object.values(none.model).every(v => v === null));
  assert.equal(none.levels.L1.source, 'film_type');
  assert.equal(levelState(none.levels.L1, none.model.L1), 'manual');
});

test('openEditor keeps a level with geometry visible even when the film type would hide it', () => {
  const e = openEditor({ study: { id: 'x', geometry: lumbarGeometry() }, region: 'cervical', modelGeometry: null, saved: null });
  assert.equal(e.levels.L1.visible, true);
  assert.equal(e.levels.C3.visible, true, 'a cervical default with no geometry is still visible');
  assert.equal(e.levels.T4.visible, false, 'cervical starts T4 not visible (D5)');
});

test('openEditor on a film with no result starts every level visible for Auto (D6) and by film type otherwise', () => {
  const auto = blankEditor('auto');
  assert.ok(LEVEL_CODES.every(c => auto.levels[c].visible));
  assert.ok(LEVEL_CODES.every(c => auto.levels[c].geometry === null));
  const full = blankEditor('full_spine');
  assert.ok(LEVEL_CODES.every(c => full.levels[c].visible));
  const cervical = blankEditor('cervical');
  assert.deepEqual(LEVEL_CODES.filter(c => cervical.levels[c].visible), ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1']);
  assert.equal(blankEditor(null).region, 'auto', 'no region reads as Auto');
});

test('openEditor opens the groups that hold a visible level', () => {
  assert.deepEqual(lumbarEditor().open,
    { cervical: false, thoracic: false, lumbar: true, sacral: true, femoral: true });
  assert.deepEqual(blankEditor('cervical').open,
    { cervical: true, thoracic: true, lumbar: false, sacral: false, femoral: false });
});

test('openEditor starts with the baseline equal to the opening levels and no record', () => {
  const e = lumbarEditor();
  assert.deepEqual(e.baseline, e.levels);
  assert.deepEqual(e.record, { file: null, exists: false });
  assert.equal(unsavedCount(e), 0);
  const labelled = openEditor({ study: { id: 'x', geometry: null, labelFile: 'a.label.json' }, region: 'lumbar', modelGeometry: null, saved: null });
  assert.deepEqual(labelled.record, { file: 'a.label.json', exists: false });
});

test('openEditor restores a saved record: visibility, source, T1/T4 geometry, baseline and record', () => {
  const t1 = { superior: [[30, 5], [60, 7]] };
  const saved = {
    file: 'film.label.json',
    levels: Object.fromEntries(LEVEL_CODES.map(code => [code, { visible: false, source: 'annotator', geometry: null }])),
  };
  saved.levels.T1 = { visible: true, source: 'annotator', geometry: t1 };
  saved.levels.L3 = { visible: true, source: 'annotator', geometry: { superior: [[1, 1], [2, 1]], inferior: [[1, 3], [2, 3]] } };
  saved.levels.L1 = { visible: false, source: 'annotator', geometry: null };
  const e = lumbarEditor({ saved, study: { id: 'SP-0001', geometry: lumbarGeometry(), labelFile: 'older.label.json' } });
  assert.deepEqual(e.levels.T1, { visible: true, source: 'annotator', geometry: t1 });
  assert.equal(e.levels.L1.visible, false, 'the record decides visibility');
  assert.deepEqual(e.levels.L1.geometry, levelsFromGeometry(lumbarGeometry()).L1, 'the study geometry decides geometry for what it carries');
  assert.equal(e.levels.L3.visible, true);
  assert.deepEqual(e.levels.L3.geometry, saved.levels.L3.geometry, 'a code the study lacks takes the record geometry');
  assert.equal(e.levels.L2.source, 'annotator', 'source comes from the record');
  assert.deepEqual(e.baseline, saved.levels);
  assert.deepEqual(e.record, { file: 'film.label.json', exists: true });
  assert.equal(e.open.thoracic, true);
  assert.equal(e.open.cervical, false);
});

test('openEditor completes a saved record that lacks some codes', () => {
  const saved = { file: 'f.label.json', levels: { T1: { visible: true, source: 'annotator', geometry: { superior: [[1, 1], [2, 2]] } } } };
  const e = lumbarEditor({ saved });
  assert.deepEqual(Object.keys(e.baseline), LEVEL_CODES);
  assert.equal(e.levels.L2.visible, true, 'falls back to the film-type default');
  assert.deepEqual(e.baseline.T1, saved.levels.T1);
  assert.equal(unsavedCount(e), 0);
});

// R9: study.geometry.femoral_circles is a compact array (a hidden Head 1 beside a placed Head 2 stores ONE
// circle at slot 0), so with a saved record the circles are matched to the heads before slot order applies.
function headsRecord(fh1, fh2) {
  const head = geometry => ({ visible: geometry != null, source: 'annotator', geometry });
  return { file: 'film.label.json', levels: { FH1: head(fh1), FH2: head(fh2) } };
}

function withCircles(circles, saved, modelGeometry = lumbarGeometry()) {
  const geometry = lumbarGeometry();
  geometry.femoral_circles = circles;
  return openEditor({ study: { id: 'SP-0003', geometry }, region: 'lumbar', modelGeometry, saved });
}

test('openEditor puts a lone study circle on the head the saved record says it is (R9)', () => {
  const head2 = { center: [20, 140], radius: 5, rim: null };
  const e = withCircles([[20, 140, 5]], headsRecord(null, head2));
  assert.equal(e.levels.FH1.geometry, null, 'Head 1 is hidden in the record: nothing slides into it');
  assert.equal(e.levels.FH1.visible, false);
  assert.deepEqual(e.levels.FH2.geometry, head2);
  assert.equal(e.levels.FH2.visible, true);
  assert.equal(levelState(e.levels.FH2, e.model.FH2), 'segmented');
  assert.equal(unsavedCount(e), 0, 'the opening levels equal the record baseline');
});

test('openEditor matches circles to heads by centre and radius, not by slot, when a record is given (R9)', () => {
  const head1 = { center: [10, 140], radius: 5, rim: null };
  const head2 = { center: [20, 140], radius: 5, rim: null };
  const swapped = withCircles([[20, 140, 5], [10, 140, 5]], headsRecord(head1, head2));
  assert.deepEqual(swapped.levels.FH1.geometry, head1);
  assert.deepEqual(swapped.levels.FH2.geometry, head2);
  const mixed = withCircles([[99, 99, 4], [20, 140, 5]], headsRecord(head1, head2));
  assert.deepEqual(mixed.levels.FH2.geometry, head2, 'the matching circle takes its head');
  assert.deepEqual(mixed.levels.FH1.geometry, { center: [99, 99], radius: 4, rim: null }, 'the stray circle takes the head left over');
});

test('openEditor fills the heads in order FH1, FH2 with circles that match nothing in the record (R9)', () => {
  const stale = headsRecord({ center: [1, 1], radius: 2, rim: null }, { center: [3, 3], radius: 2, rim: null });
  const e = withCircles([[10, 140, 5], [20, 140, 5]], stale);
  assert.deepEqual(e.levels.FH1.geometry, { center: [10, 140], radius: 5, rim: null });
  assert.deepEqual(e.levels.FH2.geometry, { center: [20, 140], radius: 5, rim: null });
  const lone = withCircles([[10, 140, 5]], stale);
  assert.deepEqual(lone.levels.FH1.geometry, { center: [10, 140], radius: 5, rim: null });
  assert.equal(lone.levels.FH2.geometry.center[0], 3, 'Head 2 keeps the record geometry the study lacks');
});

test('openEditor keeps a saved rim: a matched head takes the saved geometry, not the study [x, y, r] circle (R9)', () => {
  const rim = [[5, 140], [15, 140], [10, 135], [10, 145]];
  const head1 = { center: [10, 140], radius: 5, rim };
  const head2 = { center: [20, 140], radius: 5, rim: null };
  const saved = headsRecord(head1, head2);
  const e = withCircles([[10, 140, 5], [20, 140, 5]], saved);
  assert.deepEqual(e.levels.FH1.geometry, head1, 'the four clicked rim points survive a reopen');
  assert.deepEqual(e.levels.FH1.geometry.rim, rim);
  assert.deepEqual(e.levels.FH2.geometry, head2);
  assert.deepEqual(e.baseline.FH1.geometry.rim, rim);
  assert.equal(unsavedCount(e), 0);
  assert.notEqual(e.levels.FH1.geometry, saved.levels.FH1.geometry, 'the level holds a copy, not the saved object');
  assert.notEqual(e.levels.FH1.geometry.rim, rim);
  assert.notEqual(e.levels.FH1.geometry.rim[0], rim[0]);
  assert.notEqual(e.levels.FH1.geometry.center, head1.center);
  const lone = withCircles([[10, 140, 5]], headsRecord(head1, null));
  assert.deepEqual(lone.levels.FH1.geometry.rim, rim, 'a lone matched circle keeps the rim too');
  assert.equal(lone.levels.FH2.geometry, null);
});

test('openEditor puts a circle that matches nothing on a head the record does not hide (R9)', () => {
  const head2 = { center: [20, 140], radius: 5, rim: null };
  // Head 1 is hidden in the record and Head 2 was dragged after the save: the one study circle matches neither.
  const dragged = withCircles([[22, 141, 5]], headsRecord(null, head2));
  assert.equal(dragged.levels.FH1.geometry, null, 'the hidden head stays empty');
  assert.equal(dragged.levels.FH1.visible, false);
  assert.deepEqual(dragged.levels.FH2.geometry, { center: [22, 141], radius: 5, rim: null });
  assert.equal(dragged.levels.FH2.visible, true);
  assert.equal(unsavedCount(dragged), 1, 'only Head 2 differs from the record');
  // Head 2 hidden instead: the stray circle takes Head 1.
  const head1 = { center: [10, 140], radius: 5, rim: null };
  const other = withCircles([[12, 141, 5]], headsRecord(head1, null));
  assert.deepEqual(other.levels.FH1.geometry, { center: [12, 141], radius: 5, rim: null });
  assert.equal(other.levels.FH2.geometry, null);
  // Both heads hidden in the record: the order FH1, FH2 stands.
  const hidden = withCircles([[12, 141, 5]], headsRecord(null, null));
  assert.deepEqual(hidden.levels.FH1.geometry, { center: [12, 141], radius: 5, rim: null });
  assert.equal(hidden.levels.FH2.geometry, null);
  // A hidden head is still used when the other is taken by a matching circle.
  const both = withCircles([[20, 140, 5], [50, 50, 3]], headsRecord(null, head2));
  assert.deepEqual(both.levels.FH2.geometry, head2);
  assert.deepEqual(both.levels.FH1.geometry, { center: [50, 50], radius: 3, rim: null });
});

test('openEditor without a record keeps slot order: slot 0 is Head 1, slot 1 is Head 2 (R9)', () => {
  const one = withCircles([[20, 140, 5]], null);
  assert.deepEqual(one.levels.FH1.geometry, { center: [20, 140], radius: 5, rim: null });
  assert.equal(one.levels.FH2.geometry, null);
  const two = withCircles([[10, 140, 5], [20, 140, 5]], null);
  assert.deepEqual(two.levels.FH1.geometry, { center: [10, 140], radius: 5, rim: null });
  assert.deepEqual(two.levels.FH2.geometry, { center: [20, 140], radius: 5, rim: null });
});

test('openEditor reads only study.geometry, study.labelFile and an optional id', () => {
  const e = openEditor({ study: { geometry: lumbarGeometry() }, region: 'lumbar', modelGeometry: null, saved: null });
  assert.equal(e.studyId, null);
  assert.deepEqual(e.record, { file: null, exists: false });
});

// ---------- visibility ----------

test('toggleVisible flips visibility, marks the annotator, keeps geometry, and returns a new editor', () => {
  const e = lumbarEditor();
  const hidden = toggleVisible(e, 'L1');
  assert.notEqual(hidden, e);
  assert.equal(hidden.levels.L1.visible, false);
  assert.equal(hidden.levels.L1.source, 'annotator');
  assert.deepEqual(hidden.levels.L1.geometry, e.levels.L1.geometry, 'hiding keeps the geometry');
  assert.equal(e.levels.L1.visible, true, 'the original is untouched');
  assert.equal(e.levels.L1.source, 'model');
  assert.equal(hidden.levels.L2, e.levels.L2, 'other levels share their reference');
  const back = toggleVisible(hidden, 'L1');
  assert.equal(back.levels.L1.visible, true);
  assert.deepEqual(back.levels.L1.geometry, e.levels.L1.geometry, 're-checking restores it');
  assert.equal(toggleVisible(e, 'C4').levels.C4.visible, true);
});

test('toggleVisible on the level being placed cancels the placement', () => {
  const placing = startPlacing(lumbarEditor(), 'L3');
  assert.equal(toggleVisible(placing, 'L3').placing, null);
  assert.deepEqual(toggleVisible(placing, 'L1').placing, placing.placing, 'another level leaves it');
});

test('toggleGroup hides a fully visible group, shows a partly visible one, and round-trips', () => {
  const e = lumbarEditor();
  assert.equal(groupCheckState(e, 'lumbar'), 'all');
  const none = toggleGroup(e, 'lumbar');
  assert.equal(groupCheckState(none, 'lumbar'), 'none');
  assert.ok(['L1', 'L2', 'L3', 'L4', 'L5'].every(c => none.levels[c].visible === false && none.levels[c].source === 'annotator'));
  assert.deepEqual(none.levels.L1.geometry, e.levels.L1.geometry, 'geometry kept');
  const all = toggleGroup(none, 'lumbar');
  assert.equal(groupCheckState(all, 'lumbar'), 'all');
  assert.ok(['L1', 'L2', 'L3', 'L4', 'L5'].every(c => all.levels[c].visible && all.levels[c].source === 'annotator'));
  const mixed = toggleVisible(e, 'L2');
  assert.equal(groupCheckState(mixed, 'lumbar'), 'mixed');
  assert.equal(groupCheckState(toggleGroup(mixed, 'lumbar'), 'lumbar'), 'all', 'mixed becomes all visible');
  assert.equal(toggleGroup(e, 'cervical').levels.C2.visible, true, 'none becomes all visible');
  assert.equal(e.levels.C2.visible, false);
  assert.equal(toggleGroup(e, 'nonsense'), e, 'an unknown group changes nothing');
});

test('toggleGroup cancels a placement whose level becomes hidden, and keeps one that stays visible', () => {
  const placing = startPlacing(lumbarEditor(), 'L3');
  assert.equal(toggleGroup(placing, 'lumbar').placing, null);
  assert.deepEqual(toggleGroup(placing, 'femoral').placing, placing.placing);
  const partly = toggleVisible(placing, 'L1');
  assert.deepEqual(toggleGroup(partly, 'lumbar').placing, partly.placing, 'showing the group does not hide L3');
});

test('groupCheckState reports all, none or mixed', () => {
  const e = lumbarEditor();
  assert.equal(groupCheckState(e, 'lumbar'), 'all');
  assert.equal(groupCheckState(e, 'cervical'), 'none');
  assert.equal(groupCheckState(toggleVisible(e, 'FH2'), 'femoral'), 'mixed');
});

test('toggleOpen flips one group and leaves the rest', () => {
  const e = lumbarEditor();
  const next = toggleOpen(e, 'lumbar');
  assert.equal(next.open.lumbar, false);
  assert.equal(next.open.sacral, true);
  assert.equal(toggleOpen(next, 'lumbar').open.lumbar, true);
  assert.equal(e.open.lumbar, true);
});

// ---------- selecting and placing ----------

test('selectLevel selects the row and focuses its first handle', () => {
  const e = lumbarEditor();
  assert.deepEqual(selectLevel(e, 'L2').handle, { code: 'L2', handle: 'SA' });
  assert.equal(selectLevel(e, 'L2').selected, 'L2');
  assert.deepEqual(selectLevel(e, 'S1').handle, { code: 'S1', handle: 'SA' });
  assert.deepEqual(selectLevel(e, 'FH1').handle, { code: 'FH1', handle: 'R0' });
  assert.equal(selectLevel(e, 'L3').handle, null, 'a level with no geometry has no handle');
  assert.equal(selectLevel(e, 'L3').selected, 'L3');
  assert.equal(selectLevel(toggleVisible(e, 'L2'), 'L2').handle, null, 'a hidden level shows no handles');
  const c2 = openEditor({ study: { id: 'x', geometry: cervicalGeometry() }, region: 'cervical', modelGeometry: null, saved: null });
  assert.deepEqual(selectLevel(c2, 'C2').handle, { code: 'C2', handle: 'IA' });
  assert.deepEqual(selectLevel(c2, 'C3').handle, { code: 'C3', handle: 'SA' });
});

test('selectLevel cancels a placement of another level but keeps a placement of the same one', () => {
  const placing = addPoint(startPlacing(lumbarEditor(), 'L3'), [50, 50], IMAGE);
  assert.equal(selectLevel(placing, 'L1').placing, null);
  const same = selectLevel(placing, 'L3');
  assert.deepEqual(same.placing, placing.placing);
  assert.equal(same.handle, null);
});

test('startPlacing begins an empty placement, selects the level and drops the focused handle', () => {
  const e = selectLevel(lumbarEditor(), 'L2');
  const placing = startPlacing(e, 'L3');
  assert.deepEqual(placing.placing, { code: 'L3', points: [] });
  assert.equal(placing.selected, 'L3');
  assert.equal(placing.handle, null);
  assert.equal(e.placing, null, 'the original is untouched');
});

test('addPoint clamps clicks to the image and finishes a body on the fourth corner', () => {
  let e = startPlacing(lumbarEditor(), 'L3');
  e = addPoint(e, [-5, 20.5], IMAGE);
  assert.deepEqual(e.placing.points, [[0, 20.5]]);
  e = addPoint(e, [500, 20], IMAGE);
  assert.deepEqual(e.placing.points[1], [199, 20], 'width - 1');
  e = addPoint(e, [10, 900], IMAGE);
  assert.deepEqual(e.placing.points[2], [10, 159], 'height - 1');
  assert.equal(e.levels.L3.geometry, null, 'not finished at three');
  e = addPoint(e, [60, 140], IMAGE);
  assert.equal(e.placing, null);
  assert.deepEqual(e.levels.L3.geometry, { superior: [[0, 20.5], [199, 20]], inferior: [[10, 159], [60, 140]] });
  assert.equal(e.levels.L3.visible, true);
  assert.equal(e.levels.L3.source, 'annotator');
  assert.equal(e.selected, 'L3');
  assert.equal(levelState(e.levels.L3, e.model.L3), 'manual');
});

test('addPoint drops a click within one pixel of the previous point for bodies, C2 and endplates', () => {
  let e = startPlacing(lumbarEditor(), 'L3');
  e = addPoint(e, [50, 50], IMAGE);
  assert.equal(addPoint(e, [50.5, 50.4], IMAGE), e, 'ignored: the editor comes back unchanged');
  assert.equal(addPoint(e, [50, 50], IMAGE), e);
  assert.equal(addPoint(e, [51, 50], IMAGE).placing.points.length, 2, 'exactly 1 px apart is accepted');
  const c2 = addPoint(startPlacing(blankEditor('cervical'), 'C2'), [20, 20], IMAGE);
  assert.equal(c2.placing.points.length, 1, 'the first click has no previous point');
  assert.equal(addPoint(c2, [20.2, 20.2], IMAGE), c2);
  const endplate = addPoint(startPlacing(blankEditor('lumbar'), 'S1'), [30, 30], IMAGE);
  assert.equal(addPoint(endplate, [30, 30], IMAGE), endplate);
});

test('addPoint compares the clamped click, so two clicks past the same edge are one point', () => {
  let e = startPlacing(blankEditor('lumbar'), 'L3');
  e = addPoint(e, [500, 50], IMAGE);
  assert.equal(addPoint(e, [900, 50], IMAGE), e);
});

test('addPoint drops a femoral head click within one pixel of ANY of its rim points (R22)', () => {
  let e = startPlacing(lumbarEditor(), 'FH1');
  e = addPoint(e, [50, 50], IMAGE);
  assert.equal(addPoint(e, [50, 50], IMAGE), e, 'a double-click is one rim point: the editor comes back unchanged');
  assert.equal(addPoint(e, [50.6, 50.6], IMAGE), e, 'within 1 px of the first');
  e = addPoint(e, [80, 50], IMAGE);
  assert.equal(e.placing.points.length, 2);
  assert.equal(addPoint(e, [50.3, 49.8], IMAGE), e, 'within 1 px of an earlier rim point, not only the last one');
  assert.equal(addPoint(e, [79.5, 50], IMAGE), e, 'within 1 px of the last');
  assert.equal(addPoint(e, [51, 50], IMAGE).placing.points.length, 3, 'exactly 1 px apart is accepted');
  const clamped = addPoint(startPlacing(blankEditor('lumbar'), 'FH2'), [500, 50], IMAGE);
  assert.equal(addPoint(clamped, [900, 50], IMAGE), clamped, 'the clamped click is compared');
});

test('two near-identical rim points cannot finish a femoral head: no radius under 0.5 px (R22)', () => {
  // Two rim points 0.8 px apart. addPoint now drops such a second click, so the placement is built directly, as a
  // double-click left it before R22; finishPlacing must refuse it on its own.
  const near = { ...startPlacing(blankEditor('lumbar'), 'FH1'), placing: { code: 'FH1', points: [[50, 50], [50.8, 50]] } };
  assert.equal(fitRim(near.placing.points).radius, 0.4, 'the fit itself would be 0.4 px');
  assert.equal(canFinishPlacing(near, IMAGE), false);
  assert.equal(finishPlacing(near, IMAGE), near, 'FIT is a no-op');
  const same = { ...near, placing: { code: 'FH1', points: [[50, 50], [50, 50]] } };
  assert.equal(canFinishPlacing(same, IMAGE), false, 'radius 0');
  assert.equal(finishPlacing(same, IMAGE), same);
  const third = addPoint(near, [70, 60], IMAGE);
  assert.equal(third.placing.points.length, 3, 'a third distinct point is taken');
  assert.equal(canFinishPlacing(third, IMAGE), true, 'and the fit now has a radius');
  const done = finishPlacing(third, IMAGE);
  assert.equal(done.placing, null);
  assert.ok(done.levels.FH1.geometry.radius >= 0.5);
});

test('canFinishPlacing follows fitFrom and need, and is false with nothing being placed', () => {
  assert.equal(canFinishPlacing(lumbarEditor(), IMAGE), false, 'idle');
  let fh = startPlacing(blankEditor('lumbar'), 'FH1');
  assert.equal(canFinishPlacing(fh, IMAGE), false, 'no rim points');
  fh = addPoint(fh, [10, 10], IMAGE);
  assert.equal(canFinishPlacing(fh, IMAGE), false, 'one rim point');
  fh = addPoint(fh, [11, 10], IMAGE);
  assert.equal(canFinishPlacing(fh, IMAGE), true, 'two rim points 1 px apart: radius 0.5, the floor');
  let body3 = startPlacing(blankEditor('lumbar'), 'L3');
  body3 = addPoint(addPoint(addPoint(body3, [10, 10], IMAGE), [30, 10], IMAGE), [10, 30], IMAGE);
  assert.equal(canFinishPlacing(body3, IMAGE), false, 'a body needs all four corners');
});

test('addPoint finishes a femoral head on the fourth rim point and fits the circle', () => {
  let e = startPlacing(blankEditor('lumbar'), 'FH1');
  for (const point of [[120, 100], [100, 120], [80, 100]]) {
    e = addPoint(e, point, IMAGE);
    assert.ok(e.placing, 'still placing before the fourth');
  }
  e = addPoint(e, [100, 80], IMAGE);
  assert.equal(e.placing, null);
  assert.deepEqual(e.levels.FH1.geometry,
    { center: [100, 100], radius: 20, rim: [[120, 100], [100, 120], [80, 100], [100, 80]] });
  assert.equal(e.levels.FH1.visible, true);
  assert.equal(e.levels.FH1.source, 'annotator');
  assert.equal(e.selected, 'FH1');
});

test('addPoint finishes C2 at three clicks, an endplate at two and a centroid at one', () => {
  let c2 = startPlacing(blankEditor('cervical'), 'C2');
  c2 = addPoint(addPoint(c2, [10, 10], IMAGE), [30, 10], IMAGE);
  assert.ok(c2.placing);
  c2 = addPoint(c2, [20, 5], IMAGE);
  assert.equal(c2.placing, null);
  assert.deepEqual(c2.levels.C2.geometry, { inferior: [[10, 10], [30, 10]], centroid: [20, 5] });

  let s1 = startPlacing(blankEditor('lumbar'), 'S1');
  s1 = addPoint(addPoint(s1, [10, 100], IMAGE), [40, 104], IMAGE);
  assert.equal(s1.placing, null);
  assert.deepEqual(s1.levels.S1.geometry, { superior: [[10, 100], [40, 104]] });

  let t4 = startPlacing(blankEditor('full_spine'), 'T4');
  t4 = addPoint(t4, [70, 70], IMAGE);
  assert.equal(t4.placing, null);
  assert.deepEqual(t4.levels.T4.geometry, { centroid: [70, 70] });
});

test('a placement that finishes makes a hidden level visible', () => {
  let e = startPlacing(blankEditor('lumbar'), 'T4');
  assert.equal(e.levels.T4.visible, false);
  e = addPoint(e, [70, 70], IMAGE);
  assert.equal(e.levels.T4.visible, true);
});

test('addPoint does nothing when no placement is in progress', () => {
  const e = lumbarEditor();
  assert.equal(addPoint(e, [5, 5], IMAGE), e);
});

test('undoPoint removes the last point, and is a no-op at zero points', () => {
  let e = startPlacing(lumbarEditor(), 'L3');
  assert.equal(undoPoint(e), e);
  e = addPoint(addPoint(e, [10, 10], IMAGE), [30, 10], IMAGE);
  const undone = undoPoint(e);
  assert.deepEqual(undone.placing, { code: 'L3', points: [[10, 10]] });
  assert.equal(e.placing.points.length, 2, 'the original is untouched');
  const idle = lumbarEditor();
  assert.equal(undoPoint(idle), idle);
});

test('cancelPlacing ends the placement and changes no level', () => {
  const e = addPoint(startPlacing(lumbarEditor(), 'L3'), [10, 10], IMAGE);
  const cancelled = cancelPlacing(e);
  assert.equal(cancelled.placing, null);
  assert.equal(cancelled.levels, e.levels);
  const idle = lumbarEditor();
  assert.equal(cancelPlacing(idle), idle);
});

test('finishPlacing fits a femoral head from two points, and waits for need on everything else', () => {
  let fh = startPlacing(blankEditor('lumbar'), 'FH2');
  assert.equal(finishPlacing(fh, IMAGE), fh, 'no points');
  fh = addPoint(fh, [10, 10], IMAGE);
  assert.equal(finishPlacing(fh, IMAGE), fh, 'one point is not enough');
  fh = addPoint(fh, [30, 10], IMAGE);
  const done = finishPlacing(fh, IMAGE);
  assert.equal(done.placing, null);
  assert.deepEqual(done.levels.FH2.geometry, { center: [20, 10], radius: 10, rim: [[10, 10], [30, 10]] });
  assert.equal(done.levels.FH2.source, 'annotator');
  assert.equal(done.selected, 'FH2');
  const three = finishPlacing(addPoint(fh, [20, 20], IMAGE), IMAGE);
  assert.equal(three.levels.FH2.geometry.rim.length, 3);

  let body3 = startPlacing(blankEditor('lumbar'), 'L3');
  body3 = addPoint(addPoint(addPoint(body3, [10, 10], IMAGE), [30, 10], IMAGE), [10, 30], IMAGE);
  assert.equal(finishPlacing(body3, IMAGE), body3, 'a body needs all four corners');
  const idle = lumbarEditor();
  assert.equal(finishPlacing(idle, IMAGE), idle);
});

test('finishPlacing replaces a segmented femoral head and the head becomes edited', () => {
  let e = startPlacing(lumbarEditor(), 'FH1');
  assert.equal(levelState(e.levels.FH1, e.model.FH1), 'segmented');
  e = finishPlacing(addPoint(addPoint(e, [100, 100], IMAGE), [120, 100], IMAGE), IMAGE);
  assert.equal(levelState(e.levels.FH1, e.model.FH1), 'edited');
  assert.deepEqual(e.model.FH1, { center: [10, 140], radius: 5, rim: null }, 'the model circle is kept');
});

// ---------- clear and set ----------

test('clearLevel removes the geometry of a manual level only', () => {
  let e = startPlacing(blankEditor('lumbar'), 'L3');
  for (const point of [[10, 10], [30, 10], [10, 30], [30, 30]]) e = addPoint(e, point, IMAGE);
  assert.equal(levelState(e.levels.L3, e.model.L3), 'manual');
  const cleared = clearLevel(e, 'L3');
  assert.equal(cleared.levels.L3.geometry, null);
  assert.equal(cleared.levels.L3.source, 'annotator');
  assert.equal(cleared.levels.L3.visible, true);
  assert.equal(levelState(cleared.levels.L3, cleared.model.L3), 'not_placed');
  assert.notEqual(cleared, e);
  assert.ok(e.levels.L3.geometry, 'the original is untouched');
});

test('clearLevel is a no-op for segmented, edited, hidden and unplaced levels', () => {
  const e = lumbarEditor();
  assert.equal(clearLevel(e, 'L1'), e, 'segmented');
  const edited = setLevelGeometry(e, 'L1', body(15, 10));
  assert.equal(clearLevel(edited, 'L1'), edited, 'edited');
  assert.equal(clearLevel(e, 'L3'), e, 'not placed');
  assert.equal(clearLevel(e, 'C4'), e, 'not visible');
});

test('clearLevel drops a focused handle of the cleared level', () => {
  let e = startPlacing(blankEditor('lumbar'), 'T4');
  e = addPoint(e, [70, 70], IMAGE);
  e = selectLevel(e, 'T4');
  assert.deepEqual(e.handle, { code: 'T4', handle: 'CENTROID' });
  assert.equal(clearLevel(e, 'T4').handle, null);
});

test('setLevelGeometry replaces the geometry and marks the annotator', () => {
  const e = lumbarEditor();
  const moved = body(15, 10);
  const next = setLevelGeometry(e, 'L1', moved);
  assert.equal(next.levels.L1.geometry, moved);
  assert.equal(next.levels.L1.source, 'annotator');
  assert.equal(next.levels.L1.visible, true);
  assert.equal(levelState(next.levels.L1, next.model.L1), 'edited');
  assert.equal(e.levels.L1.source, 'model');
  assert.equal(next.levels.L2, e.levels.L2);
});

// ---------- unsaved changes, save and revert ----------

test('unsavedCount counts levels whose visibility or geometry differ from the baseline', () => {
  const e = lumbarEditor();
  assert.equal(unsavedCount(e), 0);
  assert.equal(unsavedCount(toggleVisible(e, 'C3')), 1);
  assert.equal(unsavedCount(toggleVisible(toggleVisible(e, 'C3'), 'C3')), 0, 'a toggle and its reverse leaves nothing');
  assert.equal(unsavedCount(toggleGroup(e, 'lumbar')), 5);
  assert.equal(unsavedCount(setLevelGeometry(e, 'L1', body(15, 10))), 1);
});

test('unsavedCount ignores a source-only change and sub-eps geometry noise', () => {
  const e = lumbarEditor();
  const twice = toggleVisible(toggleVisible(e, 'L2'), 'L2');
  assert.equal(twice.levels.L2.source, 'annotator');
  assert.equal(unsavedCount(twice), 0);
  const noisy = structuredClone(e.levels.L1.geometry);
  noisy.superior[0][0] += 1e-9;
  assert.equal(unsavedCount(setLevelGeometry(e, 'L1', noisy)), 0);
});

test('unsavedCount sees a circle move but not a rim-only change', () => {
  const e = lumbarEditor();
  const same = { ...e.levels.FH1.geometry, rim: [[5, 140], [15, 140]] };
  assert.equal(unsavedCount(setLevelGeometry(e, 'FH1', same)), 0);
  assert.equal(unsavedCount(setLevelGeometry(e, 'FH1', { ...same, radius: 6 })), 1);
});

test('canSave allows the first save, then needs a change (D10)', () => {
  const e = lumbarEditor();
  assert.equal(canSave(e), true, 'no record yet');
  const saved = markSaved(e, 'film.label.json');
  assert.equal(canSave(saved), false);
  assert.equal(canSave(toggleVisible(saved, 'C3')), true);
  assert.equal(canSave(toggleVisible(toggleVisible(saved, 'C3'), 'C3')), false);
});

test('unsavedText words the count', () => {
  assert.equal(unsavedText(2), '2 UNSAVED CHANGES');
  assert.equal(unsavedText(1), '1 UNSAVED CHANGE');
  assert.equal(unsavedText(0), 'NOTHING TO SAVE');
  assert.equal(unsavedText(16), '16 UNSAVED CHANGES');
});

test('markSaved snapshots the levels as the baseline and records the file', () => {
  const changed = toggleVisible(lumbarEditor(), 'C3');
  const saved = markSaved(changed, 'film.label.json');
  assert.deepEqual(saved.record, { file: 'film.label.json', exists: true });
  assert.deepEqual(saved.baseline, changed.levels);
  assert.equal(unsavedCount(saved), 0);
  assert.equal(saved.levels, changed.levels, 'the working levels are not replaced');
  assert.equal(unsavedCount(toggleVisible(saved, 'C3')), 1);
  assert.equal(markSaved(changed).record.file, null, 'no file given keeps the existing one');
  assert.equal(markSaved(markSaved(changed, 'a.label.json')).record.file, 'a.label.json');
});

test('revertToBaseline restores visibility, source and geometry, and ends a placement', () => {
  const saved = markSaved(lumbarEditor(), 'film.label.json');
  let e = toggleGroup(saved, 'lumbar');
  e = setLevelGeometry(e, 'S1', { superior: [[0, 0], [5, 5]] });
  e = startPlacing(e, 'FH1');
  const reverted = revertToBaseline(e);
  assert.deepEqual(reverted.levels, saved.baseline);
  assert.equal(reverted.levels.L1.source, 'model');
  assert.equal(reverted.placing, null);
  assert.equal(unsavedCount(reverted), 0);
  assert.equal(reverted.record, e.record);
  assert.deepEqual(reverted.baseline, saved.baseline);
  assert.equal(unsavedCount(e) > 0, true, 'the original is untouched');
});

test('revertToBaseline of a fresh editor goes back to the state at entry', () => {
  const e = lumbarEditor();
  const reverted = revertToBaseline(toggleVisible(setLevelGeometry(e, 'L1', body(15, 10)), 'C4'));
  assert.deepEqual(reverted.levels, e.levels);
});

// ---------- summary, counts and training status ----------

test('summaryText counts placed, to place and not visible', () => {
  assert.equal(summaryText(lumbarEditor()), '7 PLACED · 1 TO PLACE · 8 NOT VISIBLE');
});

test('summaryText always writes PLACED and omits the other zero clauses', () => {
  assert.equal(summaryText(blankEditor('full_spine')), '0 PLACED · 16 TO PLACE');
  const hidden = toggleGroup(toggleGroup(toggleGroup(blankEditor('lumbar'), 'lumbar'), 'sacral'), 'femoral');
  assert.equal(summaryText(hidden), '0 PLACED · 16 NOT VISIBLE');
  const everything = Object.fromEntries(LEVEL_CODES.map(code =>
    [code, { visible: true, source: 'annotator', geometry: { centroid: [1, 1] } }]));
  const full = openEditor({ study: { id: 'x', geometry: null }, region: 'full_spine', modelGeometry: null, saved: { file: 'f', levels: everything } });
  assert.equal(summaryText(full), '16 PLACED');
});

test('groupCountText counts one group, omitting zero clauses and empty groups', () => {
  const e = lumbarEditor();
  assert.equal(groupCountText(e, 'lumbar'), '4 PLACED · 1 TO PLACE');
  assert.equal(groupCountText(e, 'cervical'), '6 NOT VISIBLE');
  assert.equal(groupCountText(e, 'thoracic'), '2 NOT VISIBLE');
  assert.equal(groupCountText(e, 'sacral'), '1 PLACED');
  assert.equal(groupCountText(e, 'femoral'), '2 PLACED');
  assert.equal(groupCountText(toggleVisible(e, 'FH2'), 'femoral'), '1 PLACED · 1 NOT VISIBLE');
  assert.equal(groupCountText(e, 'nonsense'), '', 'every clause zero reads as empty');
});

test('trainingStatus is complete when every visible level is placed', () => {
  const e = toggleVisible(lumbarEditor(), 'L3');
  assert.deepEqual(trainingStatus(e), {
    complete: true,
    label: 'TRAINING LABEL · COMPLETE',
    text: 'Every level is placed or marked not visible.',
    missing: [],
  });
});

test('trainingStatus names one missing level in the singular', () => {
  assert.deepEqual(trainingStatus(lumbarEditor()), {
    complete: false,
    label: 'TRAINING LABEL · INCOMPLETE',
    text: `L3 is visible but not placed ${DASH} place it or uncheck it.`,
    missing: ['L3'],
  });
});

test('trainingStatus lists several missing levels as "a, b and c" with the first letter capitalised', () => {
  const e = toggleVisible(lumbarEditor(), 'T1');         // T1 shown without geometry, L3 already missing
  const two = trainingStatus(e);
  assert.deepEqual(two.missing, ['T1 superior endplate', 'L3']);
  assert.equal(two.text, `T1 superior endplate and L3 are visible but not placed ${DASH} place them or uncheck them.`);
  const three = trainingStatus(toggleVisible(e, 'C2'));
  assert.deepEqual(three.missing, ['C2', 'T1 superior endplate', 'L3']);
  assert.equal(three.text, `C2, T1 superior endplate and L3 are visible but not placed ${DASH} place them or uncheck them.`);
  const heads = trainingStatus(toggleGroup(toggleGroup(blankEditor('lumbar'), 'lumbar'), 'sacral'));
  assert.deepEqual(heads.missing, ['femoral head 1', 'femoral head 2']);
  assert.equal(heads.text, `Femoral head 1 and femoral head 2 are visible but not placed ${DASH} place them or uncheck them.`);
});

// ---------- placing label and help ----------

test('placingLabel names the level and the step for a body, C2, an endplate and a centroid', () => {
  assert.equal(placingLabel(lumbarEditor()), null);
  let e = startPlacing(lumbarEditor(), 'L3');
  assert.equal(placingLabel(e), 'PLACING L3 · 1 OF 4');
  e = addPoint(e, [10, 10], IMAGE);
  assert.equal(placingLabel(e), 'PLACING L3 · 2 OF 4');
  e = addPoint(addPoint(e, [30, 10], IMAGE), [10, 30], IMAGE);
  assert.equal(placingLabel(e), 'PLACING L3 · 4 OF 4');
  assert.equal(placingLabel(startPlacing(blankEditor('cervical'), 'C2')), 'PLACING C2 · 1 OF 3');
  assert.equal(placingLabel(startPlacing(blankEditor('cervical'), 'T1')), 'PLACING T1 SUPERIOR ENDPLATE · 1 OF 2');
  assert.equal(placingLabel(startPlacing(blankEditor('full_spine'), 'T4')), 'PLACING T4 CENTROID · 1 OF 1');
});

test('placingLabel counts the rim points already placed for a femoral head', () => {
  let e = startPlacing(blankEditor('lumbar'), 'FH1');
  assert.equal(placingLabel(e), 'PLACING FEMORAL HEAD 1 · 0 OF 4 RIM POINTS');
  e = addPoint(addPoint(e, [10, 10], IMAGE), [30, 10], IMAGE);
  assert.equal(placingLabel(e), 'PLACING FEMORAL HEAD 1 · 2 OF 4 RIM POINTS');
  assert.equal(placingLabel(startPlacing(blankEditor('lumbar'), 'FH2')), 'PLACING FEMORAL HEAD 2 · 0 OF 4 RIM POINTS');
});

test('placingHelp is the help for the next point, or null when idle', () => {
  assert.equal(placingHelp(lumbarEditor()), null);
  let e = startPlacing(lumbarEditor(), 'L3');
  assert.equal(placingHelp(e), 'Click the superior-anterior corner (SA).');
  e = addPoint(addPoint(e, [10, 10], IMAGE), [30, 10], IMAGE);
  assert.equal(placingHelp(e), 'Click the inferior-anterior corner (IA).');
  let fh = startPlacing(blankEditor('lumbar'), 'FH1');
  assert.equal(placingHelp(fh), 'Click a point on the rim of the femoral head.');
  fh = addPoint(addPoint(addPoint(fh, [10, 10], IMAGE), [30, 10], IMAGE), [20, 30], IMAGE);
  assert.equal(placingHelp(fh), 'Fit now, or click one more rim point.');
  assert.equal(placingHelp(startPlacing(blankEditor('lumbar'), 'T4')), 'Click the centroid of T4.');
});

// ---------- measurement inputs and dependency notes ----------

test('MEASUREMENT_INPUTS lists the measurements in panel order, built from the segmental pairs', () => {
  assert.deepEqual(MEASUREMENT_INPUTS.map(m => m.label), [
    'LL', 'PI', 'PT', 'SS', 'PI–LL', 'L1PA',
    'C2–C3', 'C3–C4', 'C4–C5', 'C5–C6', 'C6–C7',
    'L1–L2', 'L2–L3', 'L3–L4', 'L4–L5', 'L5–S1',
    'C2–C7 Cobb', 'C2–C7 SVA', 'C7–S1 SVA',
  ]);
  const byLabel = Object.fromEntries(MEASUREMENT_INPUTS.map(m => [m.label, m]));
  assert.deepEqual(byLabel.LL, { key: 'LL', label: 'LL', regions: ['lumbar', 'full_spine'], codes: ['L1', 'S1'] });
  assert.deepEqual(byLabel.PI.codes, ['S1', 'FH1', 'FH2']);
  assert.deepEqual(byLabel.PT.codes, ['S1', 'FH1', 'FH2']);
  assert.deepEqual(byLabel.SS.codes, ['S1']);
  assert.deepEqual(byLabel['PI–LL'].codes, ['L1', 'S1', 'FH1', 'FH2']);
  assert.deepEqual(byLabel.L1PA.codes, ['L1', 'S1', 'FH1', 'FH2']);
  assert.deepEqual(byLabel['C3–C4'], { key: 'C3-C4', label: 'C3–C4', regions: ['cervical', 'full_spine'], codes: ['C3', 'C4'] });
  assert.deepEqual(byLabel['L5–S1'], { key: 'L5-S1', label: 'L5–S1', regions: ['lumbar', 'full_spine'], codes: ['L5', 'S1'] });
  assert.deepEqual(byLabel['C2–C7 Cobb'], { key: 'C2C7_COBB', label: 'C2–C7 Cobb', regions: ['cervical', 'full_spine'], codes: ['C2', 'C7'] });
  assert.deepEqual(byLabel['C2–C7 SVA'].codes, ['C2', 'C7']);
  assert.deepEqual(byLabel['C2–C7 SVA'].regions, ['cervical', 'full_spine']);
  assert.deepEqual(byLabel['C7–S1 SVA'], { key: 'GLOBAL_SVA', label: 'C7–S1 SVA', regions: ['full_spine'], codes: ['C7', 'S1'] });
});

test('MEASUREMENT_INPUTS has one segmental entry per pair and the disc-height pairs add nothing', () => {
  const pairs = [...SEGMENTAL_PAIRS.cervical, ...SEGMENTAL_PAIRS.lumbar];
  const segmental = MEASUREMENT_INPUTS.filter(m => pairs.some(([a, b]) => m.key === `${a}-${b}`));
  assert.equal(segmental.length, pairs.length);
  assert.deepEqual(DISC_LEVEL_PAIRS, SEGMENTAL_PAIRS.lumbar, 'disc heights read the lumbar pairs, so they need no entries of their own');
});

test('MEASUREMENT_INPUTS only names real levels and real regions, and shares no arrays between entries', () => {
  for (const input of MEASUREMENT_INPUTS) {
    assert.ok(input.codes.every(code => LEVEL_CODES.includes(code)), input.label);
    assert.ok(input.regions.every(region => ['lumbar', 'cervical', 'full_spine'].includes(region)), input.label);
  }
  const arrays = MEASUREMENT_INPUTS.flatMap(m => [m.regions, m.codes]);
  assert.equal(new Set(arrays).size, arrays.length);
});

test('dependencyNote names the measurements that will show an em dash', () => {
  assert.equal(dependencyNote('L1', 'lumbar'), 'LL, PI–LL, L1PA and L1–L2 will show \u2014');
  assert.equal(dependencyNote('S1', 'lumbar'), 'LL, PI, PT, SS, PI–LL, L1PA and L5–S1 will show \u2014');
  assert.equal(dependencyNote('FH1', 'lumbar'), 'PI, PT, PI–LL and L1PA will show \u2014');
  assert.equal(dependencyNote('FH2', 'lumbar'), dependencyNote('FH1', 'lumbar'));
  assert.equal(dependencyNote('C3', 'cervical'), 'C2–C3 and C3–C4 will show \u2014');
  assert.equal(dependencyNote('L3', 'lumbar'), 'L2–L3 and L3–L4 will show \u2014');
});

test('dependencyNote is null when no measurement of the film type reads the level', () => {
  assert.equal(dependencyNote('C3', 'lumbar'), null);
  assert.equal(dependencyNote('T1', 'full_spine'), null);
  assert.equal(dependencyNote('T4', 'lumbar'), null);
  assert.equal(dependencyNote('S1', 'cervical'), null);
  assert.equal(dependencyNote('L1', 'cervical'), null);
});

test('dependencyNote counts an Auto region as every region', () => {
  assert.equal(dependencyNote('T1', 'auto'), null);
  assert.equal(dependencyNote('C7', 'full_spine'),
    'C6–C7, C2–C7 Cobb, C2–C7 SVA and C7–S1 SVA will show \u2014');
  assert.equal(dependencyNote('C7', 'auto'), dependencyNote('C7', 'full_spine'));
  assert.equal(dependencyNote('C7', null), dependencyNote('C7', 'full_spine'));
  assert.equal(dependencyNote('C7', 'cervical'), 'C6–C7, C2–C7 Cobb and C2–C7 SVA will show \u2014');
  assert.equal(dependencyNote('C7', 'lumbar'), null);
});

// ---------- immutability ----------

test('no operation mutates the editor or the inputs it was given', () => {
  const study = deepFreeze({ id: 'SP-0001', geometry: lumbarGeometry(), labelFile: null });
  const modelGeometry = deepFreeze(lumbarGeometry());
  const saved = deepFreeze({ file: 'f.label.json', levels: Object.fromEntries(LEVEL_CODES.map(code =>
    [code, { visible: true, source: 'annotator', geometry: null }])) });
  let e = deepFreeze(openEditor({ study, region: 'lumbar', modelGeometry, saved }));
  const next = (fn) => { e = deepFreeze(fn(e)); };
  next(x => toggleVisible(x, 'L1'));
  next(x => toggleGroup(x, 'cervical'));
  next(x => toggleOpen(x, 'lumbar'));
  next(x => selectLevel(x, 'L2'));
  next(x => startPlacing(x, 'FH1'));
  next(x => addPoint(x, deepFreeze([20, 20]), IMAGE));
  next(x => addPoint(x, deepFreeze([40, 20]), IMAGE));
  next(x => undoPoint(x));
  next(x => addPoint(x, deepFreeze([40, 20]), IMAGE));
  next(x => finishPlacing(x, IMAGE));
  next(x => startPlacing(x, 'L3'));
  next(x => cancelPlacing(x));
  next(x => setLevelGeometry(x, 'L3', deepFreeze(body(15, 50))));
  next(x => clearLevel(x, 'L3'));
  assert.equal(e.levels.L3.geometry, null, 'the manual level was cleared');
  next(x => markSaved(x, 'g.label.json'));
  next(x => revertToBaseline(x));
  assert.equal(e.record.file, 'g.label.json');
});
