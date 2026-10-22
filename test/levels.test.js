import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVEL_GROUPS, LEVEL_CODES, MEASUREMENT_INPUTS,
  kindOf, groupOf, rowName, fullName, filmTypeDefaults, sameGeometry, levelState, badgeFor,
  placementSteps, geometryFromPoints, fitRim, synthesizeRim, levelsFromGeometry, openEditor,
  toggleVisible, toggleGroup, toggleOpen, selectLevel, startPlacing, addPoint, undoPoint, cancelPlacing,
  finishPlacing, canFinishPlacing, clearLevel, setLevelGeometry, unsavedCount, canSave, unsavedText, summaryText,
  groupCountText, groupCheckState, trainingStatus, placingLabel, placingHelp, dependencyNote,
  markSaved, revertToBaseline, setPlacingStep, changedPoints, pointKeys, revertLevel, setComment, commentChanged,
  aimHandle, cancelAim, partsOf, partOfHandle, missingParts, isPartial, resumePlacing, removePart, canResume,
  CENTROID_BODIES, hasCentroid, firstHandle,
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

// How many points of the placement in progress are set (its `points` holds one slot per step, null until set).
const placedCount = editor => editor.placing.points.filter(Boolean).length;

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
  assert.equal(sameGeometry({ superior: g.superior, inferior: null }, { superior: g.superior }), false, 'a null part and an absent one differ: the canonical shape matters');
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

// ---------- the points an edit moved (gate feedback G5, plan D18) ----------

test('pointKeys names each kind\'s own geometry keys, in record order (D18)', () => {
  assert.deepEqual(pointKeys('L3'), ['sa', 'sp', 'ia', 'ip']);
  assert.deepEqual(pointKeys('C5'), ['sa', 'sp', 'ia', 'ip']);
  assert.deepEqual(pointKeys('C2'), ['ia', 'ip', 'centroid']);
  assert.deepEqual(pointKeys('T1'), ['sa', 'sp']);
  assert.deepEqual(pointKeys('S1'), ['sa', 'sp']);
  assert.deepEqual(pointKeys('T4'), ['centroid']);
  assert.deepEqual(pointKeys('FH1'), ['center', 'radius']);
  assert.deepEqual(pointKeys('FH2'), ['center', 'radius']);
  assert.deepEqual(pointKeys('L7'), [], 'a code that names no level has no keys');
  const keys = pointKeys('L3');
  keys.push('x');
  assert.deepEqual(pointKeys('L3'), ['sa', 'sp', 'ia', 'ip'], 'a fresh array each call');
});

test('changedPoints names the moved keys of a body, in order', () => {
  const g = { superior: [[1, 2], [3, 4]], inferior: [[1, 6], [3, 8]] };
  assert.deepEqual(changedPoints('L3', g, structuredClone(g)), [], 'the model\'s own geometry moved nothing');
  const sa = structuredClone(g);
  sa.superior[0][0] += 0.5;
  assert.deepEqual(changedPoints('L3', sa, g), ['sa'], 'a moved SA');
  const two = structuredClone(g);
  two.inferior[1][0] -= 2;
  two.superior[1][1] += 1;
  assert.deepEqual(changedPoints('L3', two, g), ['sp', 'ip'], 'record order, not the order they moved in');
  const all = { superior: [[0, 2], [3, 5]], inferior: [[1, 7], [4, 8]] };
  assert.deepEqual(changedPoints('C4', all, g), ['sa', 'sp', 'ia', 'ip']);
  assert.deepEqual(changedPoints('L3', g, null), ['sa', 'sp', 'ia', 'ip'], 'no model geometry: every key (manual)');
  assert.deepEqual(changedPoints('L3', null, g), [], 'no geometry: nothing (a cleared model level)');
  assert.deepEqual(changedPoints('L3', null, null), []);
  assert.deepEqual(changedPoints('L3', undefined, g), []);
});

test('changedPoints names the moved keys of C2, an endplate, T4 and a femoral head', () => {
  const c2 = { inferior: [[1, 2], [3, 4]], centroid: [2, 1] };
  assert.deepEqual(changedPoints('C2', structuredClone(c2), c2), []);
  assert.deepEqual(changedPoints('C2', { ...c2, centroid: [2, 1.5] }, c2), ['centroid']);
  assert.deepEqual(changedPoints('C2', { inferior: [[1, 2], [3, 5]], centroid: [2, 1.5] }, c2), ['ip', 'centroid']);
  assert.deepEqual(changedPoints('C2', { inferior: [[0, 2], [3, 4]], centroid: [2, 1] }, c2), ['ia']);
  assert.deepEqual(changedPoints('C2', c2, null), ['ia', 'ip', 'centroid']);

  const endplate = { superior: [[10, 110], [20, 110]] };
  assert.deepEqual(changedPoints('S1', { superior: [[10, 111], [20, 110]] }, endplate), ['sa']);
  assert.deepEqual(changedPoints('T1', { superior: [[10, 110], [21, 110]] }, endplate), ['sp']);
  assert.deepEqual(changedPoints('S1', structuredClone(endplate), endplate), []);
  assert.deepEqual(changedPoints('T1', endplate, null), ['sa', 'sp']);

  assert.deepEqual(changedPoints('T4', { centroid: [5, 6] }, { centroid: [5, 7] }), ['centroid']);
  assert.deepEqual(changedPoints('T4', { centroid: [5, 6] }, { centroid: [5, 6] }), []);
  assert.deepEqual(changedPoints('T4', { centroid: [5, 6] }, null), ['centroid']);

  const circle = { center: [10, 20], radius: 5, rim: null };
  assert.deepEqual(changedPoints('FH1', { center: [11, 20], radius: 5, rim: null }, circle), ['center']);
  assert.deepEqual(changedPoints('FH1', { center: [10, 20], radius: 5.5, rim: [[4.5, 20], [15.5, 20]] }, circle), ['radius']);
  assert.deepEqual(changedPoints('FH2', { center: [10, 21], radius: 6, rim: null }, circle), ['center', 'radius']);
  assert.deepEqual(changedPoints('FH2', circle, null), ['center', 'radius']);
});

test('changedPoints ignores a rim-only change and a wobble inside sameGeometry\'s eps, as levelState does', () => {
  const circle = { center: [10, 20], radius: 5, rim: null };
  const rimOnly = { center: [10, 20], radius: 5, rim: [[5, 20], [15, 20], [10, 15]] };
  assert.deepEqual(changedPoints('FH1', rimOnly, circle), [], 'the rim is how a circle was fitted, not a point of it');
  assert.equal(levelState({ visible: true, geometry: rimOnly }, circle), 'segmented', 'and the head stays segmented');

  const g = { superior: [[1, 2], [3, 4]], inferior: [[1, 6], [3, 8]] };
  const wobble = structuredClone(g);
  wobble.superior[0][0] += 1e-7;
  wobble.inferior[1][1] -= 1e-7;
  assert.deepEqual(changedPoints('L3', wobble, g), [], 'a 1e-7 wobble moved nothing');
  assert.equal(levelState({ visible: true, geometry: wobble }, g), 'segmented');
  const past = structuredClone(g);
  past.superior[0][0] += 1e-5;
  assert.deepEqual(changedPoints('L3', past, g), ['sa'], 'past the eps it did');
  assert.equal(levelState({ visible: true, geometry: past }, g), 'edited');
  const head = { center: [10, 20 + 1e-7], radius: 5 - 1e-7, rim: null };
  assert.deepEqual(changedPoints('FH1', head, circle), []);
});

test('changedPoints agrees with levelState: edited exactly when a point moved (R38)', () => {
  const fixtures = [
    ['L1', { superior: [[10, 10], [20, 10]], inferior: [[10, 20], [20, 20]] }],
    ['C2', { inferior: [[40, 20], [50, 20]], centroid: [45, 12] }],
    ['S1', { superior: [[10, 110], [20, 110]] }],
    ['T1', { superior: [[30, 5], [60, 7]] }],
    ['T4', { centroid: [5, 6] }],
    ['FH1', { center: [10, 140], radius: 5, rim: null }],
  ];
  // Every number of the geometry (rim excluded) shifted alone, by each delta.
  const deltas = [0, 1e-9, 1e-7, 5e-7, 2e-6, 1e-3, 0.5, 3];
  let checked = 0;
  for (const [code, model] of fixtures) {
    const paths = [];
    (function walk(value, path) {
      if (typeof value === 'number') paths.push(path);
      else if (Array.isArray(value)) value.forEach((v, i) => walk(v, [...path, i]));
      else if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) if (key !== 'rim') walk(value[key], [...path, key]);
      }
    })(model, []);
    for (const path of paths) {
      for (const delta of deltas) {
        const geometry = structuredClone(model);
        const parent = path.slice(0, -1).reduce((node, key) => node[key], geometry);
        parent[path[path.length - 1]] += delta;
        const state = levelState({ visible: true, geometry }, model);
        const points = changedPoints(code, geometry, model);
        assert.equal(state === 'edited', points.length > 0, `${code} ${path.join('.')} +${delta}: ${state} vs ${JSON.stringify(points)}`);
        assert.equal(state === 'segmented', points.length === 0);
        checked += 1;
      }
    }
    assert.equal(levelState({ visible: true, geometry: model }, null), 'manual');
    assert.deepEqual(changedPoints(code, model, null), pointKeys(code), `${code}: manual lists every key`);
  }
  assert.ok(checked > 100, `${checked} perturbations`);
});

test('changedPoints reads its inputs without changing them and returns a fresh array', () => {
  const g = deepFreeze({ superior: [[1, 2], [3, 4]], inferior: [[1, 6], [3, 8]] });
  const moved = deepFreeze({ superior: [[1, 2], [3, 5]], inferior: [[1, 6], [3, 8]] });
  assert.deepEqual(changedPoints('L2', moved, g), ['sp']);
  const first = changedPoints('L2', g, null);
  first.length = 0;
  assert.deepEqual(changedPoints('L2', g, null), ['sa', 'sp', 'ia', 'ip']);
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

test('levelsFromGeometry reads C2 from its inferior pair and centroid, either alone, and from neither as null', () => {
  const levels = levelsFromGeometry(cervicalGeometry());
  assert.deepEqual(levels.C2, { inferior: [[40, 20], [50, 20]], centroid: [45, 12] });
  assert.deepEqual(levels.C3, { superior: [[10, 30], [20, 30]], inferior: [[10, 40], [20, 40]] });
  assert.equal(levels.S1, null);
  assert.equal(levels.FH1, null);
  const noCentroid = cervicalGeometry();
  noCentroid.c2_centroid = null;
  assert.deepEqual(levelsFromGeometry(noCentroid).C2, { inferior: [[40, 20], [50, 20]], centroid: null });
  const noInferior = cervicalGeometry();
  noInferior.vertebrae.C2.inferior = null;
  assert.deepEqual(levelsFromGeometry(noInferior).C2, { inferior: null, centroid: [45, 12] });
  noInferior.c2_centroid = null;
  assert.equal(levelsFromGeometry(noInferior).C2, null);
});

test('levelsFromGeometry reads a body with one pair, and always leaves T1 and T4 null', () => {
  const geometry = lumbarGeometry();
  geometry.vertebrae.L3 = { superior: [[10, 50], [20, 50]], inferior: null, quadrilateral: null };
  geometry.vertebrae.T1 = body(10, 0);
  geometry.vertebrae.T4 = body(10, 5);
  const levels = levelsFromGeometry(geometry);
  assert.deepEqual(levels.L3, { superior: [[10, 50], [20, 50]], inferior: null });
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
  assert.equal('window' in e, false, 'the window / level belongs to the view (state.filmWindow, D15), not the editor');
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

test('openEditor takes the comment from the saved record, else the study, else empty; savedComment matches (spec §3.3)', () => {
  const geometry = lumbarGeometry();
  const withSaved = lumbarEditor({ saved: { file: 'f.label.json', levels: {}, comment: 'x' } });
  assert.equal(withSaved.comment, 'x');
  assert.equal(withSaved.savedComment, 'x');
  // A record that exists decides, even when its comment is empty: the study's display copy is not consulted.
  const emptySaved = lumbarEditor({
    saved: { file: 'f.label.json', levels: {}, comment: '' },
    study: { id: 'SP-0001', geometry, labelFile: null, labelComment: 'stale copy' },
  });
  assert.equal(emptySaved.comment, '');
  // A saved object without a comment key (the shape that predates the comment) reads empty.
  const oldSaved = lumbarEditor({ saved: { file: 'f.label.json', levels: {} } });
  assert.equal(oldSaved.comment, '');
  assert.equal(oldSaved.savedComment, '');
  const badSaved = lumbarEditor({ saved: { file: 'f.label.json', levels: {}, comment: 42 } });
  assert.equal(badSaved.comment, '');
  const fromStudy = lumbarEditor({ study: { id: 'SP-0001', geometry, labelFile: null, labelComment: 'y' } });
  assert.equal(fromStudy.comment, 'y');
  assert.equal(fromStudy.savedComment, 'y');
  const neither = lumbarEditor();
  assert.equal(neither.comment, '');
  assert.equal(neither.savedComment, '');
  const nullCopy = lumbarEditor({ study: { id: 'SP-0001', geometry, labelFile: null, labelComment: null } });
  assert.equal(nullCopy.comment, '');
  assert.equal(unsavedCount(withSaved), 0, 'a comment read from disk is the baseline, not a change');
});

test('openEditor stores the study\'s failure at entry as entryFailure, and every step carries it (the final review of round 2, I1)', () => {
  const failure = { processingError: 'No spine was found on this film.', processingErrorAt: '2026-10-10T08:00:00.000Z' };
  const failed = openEditor({ study: { id: 'SP-0004', geometry: null, labelFile: null, ...failure }, region: 'auto', modelGeometry: null, saved: null });
  assert.deepEqual(failed.entryFailure, failure);
  assert.deepEqual(blankEditor().entryFailure, { processingError: null, processingErrorAt: null }, 'a film with no failure stores nulls');
  assert.deepEqual(lumbarEditor({ study: { id: 'SP-0001', geometry: lumbarGeometry(), labelFile: null, processingError: undefined } }).entryFailure,
    { processingError: null, processingErrorAt: null }, 'an absent field reads null');
  // Every step spreads the editor, so the entry failure rides through placing, clearing, the comment, save and Discard.
  const steps = [
    (e) => toggleVisible(e, 'L3'),
    (e) => toggleGroup(e, 'cervical'),
    (e) => toggleOpen(e, 'lumbar'),
    (e) => selectLevel(e, 'L3'),
    (e) => startPlacing(e, 'L3'),
    (e) => addPoint(e, [20, 20], IMAGE),
    (e) => undoPoint(e),
    (e) => cancelPlacing(e),
    (e) => setLevelGeometry(e, 'L3', body(15, 50)),
    (e) => clearLevel(e, 'L3'),
    (e) => setComment(e, 'typed'),
    (e) => markSaved(e, 'f.label.json'),
    (e) => setLevelGeometry(e, 'L4', body(15, 70)),
    (e) => revertToBaseline(e),
  ];
  let e = deepFreeze(failed);
  for (const step of steps) {
    e = deepFreeze(step(e));
    assert.equal(e.entryFailure, failed.entryFailure, `carried unchanged through ${step.toString()}`);
  }
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

// (2026-10-21) Arming a placed level's point from its chip in the edit bar: the next film click places it.
test('aimHandle focuses the point and arms it; selectLevel, startPlacing, cancelAim and openEditor leave the editor unarmed', () => {
  const e = lumbarEditor();
  assert.equal(e.aiming, false);
  const armed = aimHandle(e, 'L2', 'IP');
  assert.notEqual(armed, e);
  assert.deepEqual(armed.handle, { code: 'L2', handle: 'IP' });
  assert.equal(armed.selected, 'L2');
  assert.equal(armed.aiming, true);
  assert.equal(armed.levels, e.levels, 'no level changed');
  assert.equal(aimHandle(armed, 'L2', 'IP'), armed, 'armed at that point already: the editor unchanged');
  assert.equal(selectLevel(armed, 'L4').aiming, false);
  assert.equal(startPlacing(armed, 'FH1').aiming, false);
  const kept = cancelAim(armed);
  assert.equal(kept.aiming, false);
  assert.deepEqual(kept.handle, { code: 'L2', handle: 'IP' }, 'the focus stays on the point');
  assert.equal(cancelAim(e), e, 'not armed: the editor unchanged');
});

test('aimHandle refuses an unplaced or hidden level and waits out a placement in progress', () => {
  const e = lumbarEditor();
  assert.equal(aimHandle(e, 'L3', 'SA'), e, 'L3 has no geometry');
  const hidden = toggleVisible(e, 'L2');
  assert.equal(aimHandle(hidden, 'L2', 'SA'), hidden, 'a hidden level');
  const placing = startPlacing(e, 'FH1');
  assert.equal(aimHandle(placing, 'L2', 'SA'), placing, 'a placement in progress keeps its own chips');
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
  assert.deepEqual(placing.placing, { code: 'L3', points: [null, null, null, null], current: 0, history: [] });
  assert.equal(placing.selected, 'L3');
  assert.equal(placing.handle, null);
  assert.equal(e.placing, null, 'the original is untouched');
  assert.deepEqual(startPlacing(e, 'C2').placing, { code: 'C2', points: [null, null, null], current: 0, history: [] });
  assert.deepEqual(startPlacing(e, 'S1').placing, { code: 'S1', points: [null, null], current: 0, history: [] });
  assert.deepEqual(startPlacing(e, 'T4').placing, { code: 'T4', points: [null], current: 0, history: [] });
  assert.deepEqual(startPlacing(e, 'FH1').placing, { code: 'FH1', points: [null, null, null, null], current: 0, history: [] });
});

test('addPoint clamps clicks to the image and finishes a body on the fourth corner', () => {
  let e = startPlacing(lumbarEditor(), 'L3');
  e = addPoint(e, [-5, 20.5], IMAGE);
  assert.deepEqual(e.placing.points, [[0, 20.5], null, null, null]);
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
  assert.equal(placedCount(addPoint(e, [51, 50], IMAGE)), 2, 'exactly 1 px apart is accepted');
  const c2 = addPoint(startPlacing(blankEditor('cervical'), 'C2'), [20, 20], IMAGE);
  assert.equal(placedCount(c2), 1, 'the first click has no previous point');
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
  assert.equal(placedCount(e), 2);
  assert.equal(addPoint(e, [50.3, 49.8], IMAGE), e, 'within 1 px of an earlier rim point, not only the last one');
  assert.equal(addPoint(e, [79.5, 50], IMAGE), e, 'within 1 px of the last');
  assert.equal(placedCount(addPoint(e, [51, 50], IMAGE)), 3, 'exactly 1 px apart is accepted');
  const clamped = addPoint(startPlacing(blankEditor('lumbar'), 'FH2'), [500, 50], IMAGE);
  assert.equal(addPoint(clamped, [900, 50], IMAGE), clamped, 'the clamped click is compared');
});

test('two near-identical rim points cannot finish a femoral head: no radius under 0.5 px (R22)', () => {
  // Two rim points 0.8 px apart. addPoint now drops such a second click, so the placement is built directly, as a
  // double-click left it before R22; finishPlacing must refuse it on its own.
  const near = {
    ...startPlacing(blankEditor('lumbar'), 'FH1'),
    placing: { code: 'FH1', points: [[50, 50], [50.8, 50], null, null], current: 2, history: [0, 1] },
  };
  assert.equal(fitRim(near.placing.points.slice(0, 2)).radius, 0.4, 'the fit itself would be 0.4 px');
  assert.equal(canFinishPlacing(near, IMAGE), false);
  assert.equal(finishPlacing(near, IMAGE), near, 'FIT is a no-op');
  const same = { ...near, placing: { ...near.placing, points: [[50, 50], [50, 50], null, null] } };
  assert.equal(canFinishPlacing(same, IMAGE), false, 'radius 0');
  assert.equal(finishPlacing(same, IMAGE), same);
  const third = addPoint(near, [70, 60], IMAGE);
  assert.equal(placedCount(third), 3, 'a third distinct point is taken');
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
  assert.equal(canFinishPlacing(body3, IMAGE), false, 'three corners: a half endplate');
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
  assert.deepEqual(undone.placing, { code: 'L3', points: [[10, 10], null, null, null], current: 1, history: [0] });
  assert.deepEqual(e.placing.points, [[10, 10], [30, 10], null, null], 'the original is untouched');
  assert.deepEqual(e.placing.history, [0, 1]);
  const idle = lumbarEditor();
  assert.equal(undoPoint(idle), idle);
});

// ---------- free-order placement: the step chips (gate feedback G2, 2026-10-11) ----------

test('addPoint on a femoral head fills the first empty rim slot, and UNDO empties the newest', () => {
  let e = startPlacing(blankEditor('lumbar'), 'FH1');
  e = addPoint(addPoint(e, [10, 10], IMAGE), [30, 10], IMAGE);
  assert.deepEqual(e.placing, { code: 'FH1', points: [[10, 10], [30, 10], null, null], current: 2, history: [0, 1] });
  e = undoPoint(e);
  assert.deepEqual(e.placing, { code: 'FH1', points: [[10, 10], null, null, null], current: 1, history: [0] });
  e = addPoint(e, [50, 10], IMAGE);
  assert.deepEqual(e.placing.points, [[10, 10], [50, 10], null, null]);
  assert.deepEqual(e.placing.history, [0, 1]);
});

test('a body can be placed in any order: a chosen step takes the next click, then the next empty step follows', () => {
  let e = startPlacing(blankEditor('lumbar'), 'L3');
  e = setPlacingStep(e, 3);
  assert.equal(e.placing.current, 3);
  e = addPoint(e, [60, 140], IMAGE);                       // IP first
  assert.deepEqual(e.placing.points, [null, null, null, [60, 140]]);
  assert.equal(e.placing.current, 0, 'past the last step the next empty one wraps to the start');
  assert.deepEqual(e.placing.history, [3]);
  e = addPoint(e, [10, 100], IMAGE);                       // SA
  assert.equal(e.placing.current, 1);
  e = addPoint(e, [60, 100], IMAGE);                       // SP
  assert.equal(e.placing.current, 2);
  assert.deepEqual(e.placing.history, [3, 0, 1]);
  e = addPoint(e, [10, 140], IMAGE);                       // IA: no step left empty, so the placement finishes
  assert.equal(e.placing, null);
  assert.deepEqual(e.levels.L3.geometry, { superior: [[10, 100], [60, 100]], inferior: [[10, 140], [60, 140]] });
  assert.equal(e.levels.L3.source, 'annotator');
  assert.equal(e.selected, 'L3');

  // The next empty step is searched from the slot just set, not from the start.
  let skip = addPoint(startPlacing(blankEditor('lumbar'), 'L3'), [10, 100], IMAGE);   // SA; current 1
  skip = addPoint(setPlacingStep(skip, 2), [10, 140], IMAGE);                        // IA
  assert.equal(skip.placing.current, 3, 'IP, after IA, before the empty SP');
  skip = addPoint(skip, [60, 140], IMAGE);
  assert.equal(skip.placing.current, 1, 'then SP, wrapping');
  skip = addPoint(skip, [60, 100], IMAGE);
  assert.deepEqual(skip.levels.L3.geometry, { superior: [[10, 100], [60, 100]], inferior: [[10, 140], [60, 140]] });

  // C2 and an endplate follow the same rule.
  let c2 = addPoint(setPlacingStep(startPlacing(blankEditor('cervical'), 'C2'), 2), [20, 5], IMAGE);   // centroid first
  assert.equal(c2.placing.current, 0);
  c2 = addPoint(addPoint(c2, [10, 10], IMAGE), [30, 10], IMAGE);
  assert.deepEqual(c2.levels.C2.geometry, { inferior: [[10, 10], [30, 10]], centroid: [20, 5] });
  let s1 = addPoint(setPlacingStep(startPlacing(blankEditor('lumbar'), 'S1'), 1), [40, 104], IMAGE);   // POST first
  s1 = addPoint(s1, [10, 100], IMAGE);
  assert.deepEqual(s1.levels.S1.geometry, { superior: [[10, 100], [40, 104]] });
});

test('re-placing a point: the click replaces it, history keeps its slot once, and UNDO then clears it (R27)', () => {
  let e = startPlacing(blankEditor('lumbar'), 'L3');
  e = addPoint(addPoint(e, [10, 100], IMAGE), [60, 100], IMAGE);   // SA, SP; current 2
  e = setPlacingStep(e, 0);
  assert.equal(e.placing.current, 0, 'a placed step can be the current one');
  e = addPoint(e, [12, 98], IMAGE);
  assert.deepEqual(e.placing.points, [[12, 98], [60, 100], null, null], 'SA replaced');
  assert.deepEqual(e.placing.history, [1, 0], 'SA once, now the most recently set');
  assert.equal(e.placing.current, 2, 'the next empty step after SA');
  const undone = undoPoint(e);
  assert.deepEqual(undone.placing.points, [null, [60, 100], null, null], 'R27: the earlier SA is not restored');
  assert.equal(undone.placing.current, 0, 'the cleared step is current');
  assert.deepEqual(undone.placing.history, [1]);
  const twice = undoPoint(undone);
  assert.deepEqual(twice.placing, { code: 'L3', points: [null, null, null, null], current: 1, history: [] });
  assert.equal(undoPoint(twice), twice, 'an empty history: nothing to undo');
  // A re-placed point may land within 1 px of where it was: its own old position is no other point.
  const nudged = addPoint(setPlacingStep(e, 1), [60.5, 100], IMAGE);
  assert.deepEqual(nudged.placing.points[1], [60.5, 100]);
  assert.deepEqual(nudged.placing.history, [0, 1]);
});

test('a click within 1 px of ANY other placed point of a body is dropped (R26); a double-click still counts once', () => {
  let e = startPlacing(blankEditor('lumbar'), 'L3');
  e = addPoint(addPoint(e, [10, 100], IMAGE), [60, 100], IMAGE);   // SA, SP; current 2 (IA)
  assert.equal(addPoint(e, [10.4, 100.4], IMAGE), e, 'within 1 px of SA, not the previous point');
  assert.equal(addPoint(e, [60, 100.5], IMAGE), e, 'within 1 px of SP');
  const chosen = setPlacingStep(e, 3);
  assert.equal(addPoint(chosen, [10, 100.9], IMAGE), chosen, 'a chosen step is held to the same rule');
  const first = addPoint(chosen, [60, 140], IMAGE);
  assert.equal(addPoint(first, [60, 140], IMAGE), first, 'a double-click: the second click lands on the point the first set');
  assert.deepEqual(addPoint(e, [11, 100], IMAGE).placing.points[2], [11, 100], 'exactly 1 px apart is accepted');
  const c2 = addPoint(addPoint(startPlacing(blankEditor('cervical'), 'C2'), [10, 10], IMAGE), [30, 10], IMAGE);
  assert.equal(addPoint(c2, [10.5, 10], IMAGE), c2, 'C2: the centroid on the IA corner');
});

test('setPlacingStep chooses the step of an ordered placement; a no-op for a head, with no placement or out of range', () => {
  const body = startPlacing(blankEditor('lumbar'), 'L3');
  const chosen = setPlacingStep(body, 2);
  assert.equal(chosen.placing.current, 2);
  assert.equal(body.placing.current, 0, 'the original is untouched');
  assert.equal(chosen.levels, body.levels);
  assert.equal(setPlacingStep(body, 0), body, 'already the current step');
  for (const index of [-1, 4, 1.5, Number.NaN, '2', undefined, null]) {
    assert.equal(setPlacingStep(body, index), body, String(index));
  }
  const head = addPoint(startPlacing(blankEditor('lumbar'), 'FH1'), [10, 10], IMAGE);
  assert.equal(setPlacingStep(head, 3), head, 'rim points stay unordered');
  assert.equal(setPlacingStep(head, 0), head);
  const idle = lumbarEditor();
  assert.equal(setPlacingStep(idle, 0), idle);
  const t4 = startPlacing(blankEditor('full_spine'), 'T4');
  assert.equal(setPlacingStep(t4, 0), t4, "T4's one step is always current");
  assert.equal(setPlacingStep(startPlacing(blankEditor('cervical'), 'C2'), 2).placing.current, 2);
  assert.equal(setPlacingStep(startPlacing(blankEditor('lumbar'), 'S1'), 1).placing.current, 1);
  assert.equal(setPlacingStep(startPlacing(blankEditor('lumbar'), 'S1'), 2).placing.current, 0, 'S1 has two steps');
});

test('placingLabel and placingHelp follow the chosen step', () => {
  let e = setPlacingStep(startPlacing(blankEditor('lumbar'), 'L3'), 3);
  assert.equal(placingLabel(e), 'PLACING L3 · 4 OF 4');
  assert.equal(placingHelp(e), 'Click the inferior-posterior corner (IP).');
  e = addPoint(e, [60, 140], IMAGE);
  assert.equal(placingLabel(e), 'PLACING L3 · 1 OF 4', 'back to the first empty step');
  assert.equal(placingHelp(e), 'Click the superior-anterior corner (SA).');
  e = setPlacingStep(e, 3);
  assert.equal(placingLabel(e), 'PLACING L3 · 4 OF 4', 'a placed step chosen again');
  const c2 = setPlacingStep(startPlacing(blankEditor('cervical'), 'C2'), 2);
  assert.equal(placingLabel(c2), 'PLACING C2 · 3 OF 3');
  assert.equal(placingHelp(c2), 'Click the centroid of the C2 body.');
  const t1 = setPlacingStep(startPlacing(blankEditor('cervical'), 'T1'), 1);
  assert.equal(placingLabel(t1), 'PLACING T1 SUPERIOR ENDPLATE · 2 OF 2');
  assert.equal(placingHelp(t1), 'Click the posterior corner of the T1 superior endplate.');
});

test('the sequential flow is unchanged: 1 OF 4 to 4 OF 4, UNDO steps back one, the fourth click finishes', () => {
  const corners = [[10, 100], [60, 100], [10, 140], [60, 140]];
  let e = startPlacing(blankEditor('lumbar'), 'L3');
  for (const [index, corner] of corners.slice(0, 3).entries()) {
    assert.equal(placingLabel(e), `PLACING L3 · ${index + 1} OF 4`);
    e = addPoint(e, corner, IMAGE);
  }
  assert.equal(placingLabel(e), 'PLACING L3 · 4 OF 4');
  assert.deepEqual(e.placing.history, [0, 1, 2]);
  e = undoPoint(e);
  assert.equal(placingLabel(e), 'PLACING L3 · 3 OF 4');
  assert.equal(placingHelp(e), 'Click the inferior-anterior corner (IA).');
  e = undoPoint(e);
  assert.equal(placingLabel(e), 'PLACING L3 · 2 OF 4');
  assert.deepEqual(e.placing, { code: 'L3', points: [[10, 100], null, null, null], current: 1, history: [0] });
  e = addPoint(addPoint(e, corners[1], IMAGE), corners[2], IMAGE);
  assert.equal(placingLabel(e), 'PLACING L3 · 4 OF 4');
  assert.equal(canFinishPlacing(e, IMAGE), false, 'three corners cannot finish');
  e = addPoint(e, corners[3], IMAGE);
  assert.equal(e.placing, null);
  assert.deepEqual(e.levels.L3.geometry, { superior: [[10, 100], [60, 100]], inferior: [[10, 140], [60, 140]] });
});

test('a femoral head fits its placed rim points in slot order, whatever UNDO left empty', () => {
  let fh = startPlacing(blankEditor('lumbar'), 'FH2');
  fh = addPoint(addPoint(addPoint(fh, [120, 100], IMAGE), [100, 120], IMAGE), [80, 100], IMAGE);
  fh = undoPoint(fh);
  assert.equal(placingLabel(fh), 'PLACING FEMORAL HEAD 2 · 2 OF 4 RIM POINTS');
  assert.equal(placingHelp(fh), 'Fit now, or click up to 2 more rim points for a better fit.');
  const done = finishPlacing(fh, IMAGE);
  assert.deepEqual(done.levels.FH2.geometry.rim, [[120, 100], [100, 120]]);
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

// ---------- REVERT one level (annotation editor round 2, spec §5.1) ----------

test('revertLevel returns an Edited level to the model geometry with source model, and reads Segmented (spec §5.1)', () => {
  const e = deepFreeze(selectLevel(setLevelGeometry(lumbarEditor(), 'L4', body(10, 75)), 'L4'));
  assert.equal(levelState(e.levels.L4, e.model.L4), 'edited');
  const reverted = revertLevel(e, 'L4');
  assert.notEqual(reverted, e);
  const entry = reverted.levels.L4;
  assert.ok(sameGeometry(entry.geometry, e.model.L4));
  assert.deepEqual(entry.geometry, e.model.L4);
  assert.equal(entry.source, 'model');
  assert.equal(entry.visible, true);
  assert.equal(levelState(entry, reverted.model.L4), 'segmented');
  assert.equal(unsavedCount(reverted), 0);
  assert.notEqual(entry.geometry, e.model.L4, 'the geometry is a copy');
  assert.notEqual(entry.geometry.superior, e.model.L4.superior, 'no pair is shared with the model');
  assert.notEqual(entry.geometry.superior[0], e.model.L4.superior[0], 'no point is shared with the model');
  assert.notEqual(entry.geometry.inferior[1], e.model.L4.inferior[1], 'no point is shared with the model');
  assert.equal(reverted.levels.L2, e.levels.L2, 'the other levels are untouched');
  for (const key of Object.keys(e).filter(key => key !== 'levels')) assert.equal(reverted[key], e[key], `${key} is kept`);
  assert.equal(e.levels.L4.source, 'annotator', 'the original is untouched');
});

test('revertLevel on a femoral head takes the model circle with rim null and keeps a focused handle (Review Focus 5)', () => {
  let e = setLevelGeometry(lumbarEditor(), 'FH1', { center: [12, 140], radius: 5, rim: [[7, 140], [17, 140]] });
  e = { ...e, handle: { code: 'FH1', handle: 'R0' } };
  assert.equal(levelState(e.levels.FH1, e.model.FH1), 'edited');
  const reverted = revertLevel(e, 'FH1');
  assert.deepEqual(reverted.levels.FH1.geometry, { center: [10, 140], radius: 5, rim: null });
  assert.equal(reverted.levels.FH1.source, 'model');
  assert.equal(levelState(reverted.levels.FH1, reverted.model.FH1), 'segmented');
  assert.equal(reverted.handle, e.handle, 'the handle names a point that still exists');
  assert.notEqual(reverted.levels.FH1.geometry.center, e.model.FH1.center, 'the centre is a copy');
});

// (2026-10-22, the final review, M1) The model gave only the superior pair; the annotator completed the inferior pair,
// focused IA (armed), then REVERT: the focus cannot stay on a point the model's geometry lacks.
test('revertLevel moves a focus on a point the model lacks to the first handle and disarms it; a kept point keeps the focus', () => {
  const base = lumbarEditor();
  const partialModel = { superior: [[10, 75], [20, 75]], inferior: null };
  let e = { ...base, model: { ...base.model, L4: partialModel } };
  e = selectLevel(setLevelGeometry(e, 'L4', body(10, 75)), 'L4');
  const armed = aimHandle(e, 'L4', 'IA');
  assert.equal(armed.aiming, true);
  const reverted = revertLevel(armed, 'L4');
  assert.deepEqual(reverted.levels.L4.geometry, partialModel);
  assert.deepEqual(reverted.handle, { code: 'L4', handle: 'SA' });
  assert.equal(reverted.aiming, false);
  const onSp = { ...e, handle: { code: 'L4', handle: 'SP' } };
  assert.equal(revertLevel(onSp, 'L4').handle, onSp.handle, 'a point the model has keeps the focus');
});

// (2026-10-22, the final review, M4) Place... resumes a visible, placed, partial body or C2 only.
test('canResume: a visible placed partial body or C2, and nothing else', () => {
  const partialBody = { visible: true, geometry: { superior: [[1, 1], [2, 1]], inferior: null } };
  assert.equal(canResume('L3', partialBody), true);
  assert.equal(canResume('C2', { visible: true, geometry: { inferior: null, centroid: [1, 1] } }), true);
  assert.equal(canResume('L3', { ...partialBody, visible: false }), false, 'hidden');
  assert.equal(canResume('L3', { visible: true, geometry: null }), false, 'unplaced');
  assert.equal(canResume('L3', { visible: true, geometry: body(1, 1) }), false, 'whole');
  assert.equal(canResume('T1', { visible: true, geometry: { superior: null } }), false, 'an endplate has one part');
  assert.equal(canResume('FH1', { visible: true, geometry: { center: [1, 1], radius: 2, rim: null } }), false, 'a head');
  assert.equal(canResume('L3', undefined), false, 'no entry');
});

test('revertLevel is a no-op for segmented, manual, not placed, not visible and placing levels', () => {
  const e = lumbarEditor();
  assert.equal(revertLevel(e, 'L1'), e, 'segmented');
  const manual = setLevelGeometry(e, 'L3', body(10, 50));
  assert.equal(levelState(manual.levels.L3, manual.model.L3), 'manual');
  assert.equal(revertLevel(manual, 'L3'), manual, 'manual: nothing to revert to');
  assert.equal(levelState(e.levels.L3, e.model.L3), 'not_placed');
  assert.equal(revertLevel(e, 'L3'), e, 'not placed');
  assert.equal(revertLevel(e, 'C4'), e, 'not visible');
  const hidden = toggleVisible(setLevelGeometry(e, 'L4', body(10, 75)), 'L4');
  assert.equal(levelState(hidden.levels.L4, hidden.model.L4), 'not_visible');
  assert.equal(revertLevel(hidden, 'L4'), hidden, 'an edited level that is hidden reads not visible');
  const placing = startPlacing(setLevelGeometry(e, 'FH1', { center: [12, 140], radius: 5, rim: null }), 'FH1');
  assert.equal(levelState(placing.levels.FH1, placing.model.FH1), 'edited');
  assert.equal(revertLevel(placing, 'FH1'), placing, 'being placed');
  assert.equal(revertLevel(e, 'XX'), e, 'no such level');
  const other = startPlacing(setLevelGeometry(e, 'L4', body(10, 75)), 'FH1');
  const reverted = revertLevel(other, 'L4');
  assert.equal(levelState(reverted.levels.L4, reverted.model.L4), 'segmented', 'a placement of another level does not stop it');
  assert.equal(reverted.placing, other.placing, 'and that placement runs on');
});

test('reverting a saved edit counts one unsaved change; reverting an unsaved one counts none', () => {
  const saved = markSaved(setLevelGeometry(lumbarEditor(), 'L4', body(10, 75)), 'film.label.json');
  assert.equal(unsavedCount(saved), 0);
  assert.equal(unsavedCount(revertLevel(saved, 'L4')), 1, 'the level now differs from the saved edit');
  const fresh = setLevelGeometry(lumbarEditor(), 'L4', body(10, 75));
  assert.equal(unsavedCount(fresh), 1);
  assert.equal(unsavedCount(revertLevel(fresh, 'L4')), 0, 'the level is back at its baseline');
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

// ---------- the comment (annotation editor round 2, spec §3) ----------

test('setComment changes only the comment; commentChanged ignores surrounding whitespace', () => {
  const e = lumbarEditor({ saved: { file: 'f.label.json', levels: {}, comment: 'L5 sacralised' } });
  const typed = setComment(e, 'L5 sacralised, S1 fused');
  assert.equal(typed.comment, 'L5 sacralised, S1 fused');
  assert.deepEqual({ ...typed, comment: e.comment }, e, 'nothing else on the editor changes');
  assert.equal(e.comment, 'L5 sacralised', 'the original is untouched');
  assert.equal(typed.savedComment, 'L5 sacralised');
  assert.equal(commentChanged(e), false);
  assert.equal(commentChanged(typed), true);
  assert.equal(commentChanged(setComment(e, '  L5 sacralised \n')), false, 'surrounding whitespace is not a change');
  assert.equal(commentChanged(setComment(e, 'L5  sacralised')), true, 'inner whitespace is');
  assert.equal(setComment(e, undefined).comment, '');
  assert.equal(setComment(e, null).comment, '');
  assert.equal(commentChanged(setComment(lumbarEditor(), '   ')), false, 'blank over empty is no change');
  assert.equal(commentChanged(setComment(e, '')), true, 'clearing a saved comment is a change');
});

test('a comment change alone counts one unsaved change; with a level change, two', () => {
  const saved = markSaved(lumbarEditor(), 'film.label.json');
  assert.equal(unsavedCount(saved), 0);
  assert.equal(canSave(saved), false);
  const commented = setComment(saved, 'sacralised');
  assert.equal(unsavedCount(commented), 1);
  assert.equal(canSave(commented), true, 'a comment alone enables Save');
  assert.equal(unsavedCount(toggleVisible(commented, 'C3')), 2);
  assert.equal(unsavedCount(setComment(commented, '  ')), 0, 'taking the text back out leaves nothing');
  assert.equal(unsavedCount(toggleVisible(saved, 'C3')), 1, 'a level change alone still counts one');
});

test('markSaved trims the comment into savedComment; revertToBaseline restores the saved text', () => {
  const typed = setComment(lumbarEditor(), '  L5 sacralised \n');
  const saved = markSaved(typed, 'film.label.json');
  assert.equal(saved.comment, 'L5 sacralised');
  assert.equal(saved.savedComment, 'L5 sacralised');
  assert.equal(commentChanged(saved), false);
  assert.equal(unsavedCount(saved), 0);
  assert.equal(typed.comment, '  L5 sacralised \n', 'the original is untouched');
  const edited = setComment(saved, 'L5 is not sacralised');
  assert.equal(unsavedCount(edited), 1);
  const reverted = revertToBaseline(edited);
  assert.equal(reverted.comment, 'L5 sacralised');
  assert.equal(reverted.savedComment, 'L5 sacralised');
  assert.equal(unsavedCount(reverted), 0);
  assert.equal(edited.comment, 'L5 is not sacralised', 'the original is untouched');
  const cleared = markSaved(setComment(saved, '   '));
  assert.equal(cleared.comment, '');
  assert.equal(cleared.savedComment, '');
  assert.equal(revertToBaseline(setComment(lumbarEditor(), 'typed')).comment, '', 'a fresh editor reverts to no comment');
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

test('partsOf names each kind\'s parts and the steps that place them; partOfHandle maps a handle to its part', () => {
  assert.deepEqual(partsOf('L3'), [{ key: 'superior', steps: [0, 1] }, { key: 'inferior', steps: [2, 3] }]);
  assert.deepEqual(partsOf('C2'), [{ key: 'inferior', steps: [0, 1] }, { key: 'centroid', steps: [2] }]);
  assert.deepEqual(partsOf('S1'), [{ key: 'superior', steps: [0, 1] }]);
  assert.deepEqual(partsOf('T4'), [{ key: 'centroid', steps: [0] }]);
  assert.deepEqual(partsOf('FH1'), []);
  assert.notEqual(partsOf('L3'), partsOf('L3'), 'a fresh array');
  assert.equal(partOfHandle('L3', 'SA'), 'superior');
  assert.equal(partOfHandle('L3', 'IP'), 'inferior');
  assert.equal(partOfHandle('C2', 'CENTROID'), 'centroid');
  assert.equal(partOfHandle('C2', 'SA'), null, 'C2 has no superior pair');
  assert.equal(partOfHandle('FH1', 'R0'), null);
});

test('levelsFromGeometry reads a body with one endplate, and C2 with its pair or its centroid alone, in the canonical shape', () => {
  const g = cervicalGeometry();
  g.vertebrae.C7 = { superior: [[10, 110], [20, 110]], inferior: null, quadrilateral: null };
  g.vertebrae.C6 = { superior: null, inferior: [[10, 100], [20, 100]], quadrilateral: null };
  const levels = levelsFromGeometry(g);
  assert.deepEqual(levels.C7, { superior: [[10, 110], [20, 110]], inferior: null, centroid: null });
  assert.deepEqual(levels.C6, { superior: null, inferior: [[10, 100], [20, 100]] });
  assert.deepEqual(levelsFromGeometry({ region: 'cervical', vertebrae: {}, c2_centroid: [45, 12] }).C2, { inferior: null, centroid: [45, 12] });
  assert.deepEqual(levelsFromGeometry({ region: 'cervical', vertebrae: { C2: { inferior: [[40, 20], [50, 20]] } }, c2_centroid: null }).C2,
    { inferior: [[40, 20], [50, 20]], centroid: null });
  assert.equal(levelsFromGeometry({ region: 'lumbar', vertebrae: { L1: { superior: [[1, 1]], inferior: null } } }).L1, null, 'half a pair is not a geometry');
  assert.equal(levelsFromGeometry({ region: 'lumbar', vertebrae: { L1: { superior: null, inferior: null } } }).L1, null, 'no part is not a geometry');
  assert.deepEqual(missingParts('C7', levels.C7), ['inferior', 'centroid']);
  assert.deepEqual(missingParts('C6', levels.C6), ['superior']);
  assert.deepEqual(missingParts('C3', levels.C3), []);
  assert.deepEqual(missingParts('C7', null), []);
  assert.equal(isPartial('C7', levels.C7), true);
  assert.equal(isPartial('S1', { superior: [[1, 1], [2, 2]] }), false);
});

test('the model\'s own partial output reads Segmented, is Edited once completed, and REVERT returns it to the partial output', () => {
  const partial = { superior: [[10, 110], [20, 110]], inferior: null };
  const study = { id: 'SP-0002', geometry: { region: 'cervical', vertebrae: { C6: { ...partial, quadrilateral: null } }, c2_centroid: null } };
  let e = openEditor({ study, region: 'cervical', modelGeometry: study.geometry, saved: null });
  assert.equal(levelState(e.levels.C6, e.model.C6), 'segmented');
  const whole = { superior: partial.superior, inferior: [[10, 120], [20, 120]] };
  e = setLevelGeometry(e, 'C6', whole);
  assert.equal(levelState(e.levels.C6, e.model.C6), 'edited');
  assert.deepEqual(changedPoints('C6', whole, e.model.C6), ['ia', 'ip']);
  e = revertLevel(e, 'C6');
  assert.deepEqual(e.levels.C6.geometry, partial);
  assert.equal(levelState(e.levels.C6, e.model.C6), 'segmented');
  assert.deepEqual(changedPoints('C6', { superior: null, inferior: whole.inferior }, whole), ['sa', 'sp'], 'a removed endplate lists its keys');
  assert.deepEqual(changedPoints('C6', partial, null), ['sa', 'sp'], 'a manual partial body lists its placed keys only');
});

test('geometryFromPoints takes the slot array: a whole part is written, an empty part is null, a half part makes no geometry', () => {
  const sa = [1, 1], sp = [2, 1], ia = [1, 2], ip = [2, 2];
  assert.deepEqual(geometryFromPoints('L3', [sa, sp, null, null], IMAGE), { superior: [sa, sp], inferior: null });
  assert.deepEqual(geometryFromPoints('L3', [null, null, ia, ip], IMAGE), { superior: null, inferior: [ia, ip] });
  assert.deepEqual(geometryFromPoints('L3', [sa, sp, ia, ip], IMAGE), { superior: [sa, sp], inferior: [ia, ip] });
  assert.equal(geometryFromPoints('L3', [sa, null, ia, ip], IMAGE), null, 'half a superior pair');
  assert.equal(geometryFromPoints('L3', [null, null, null, null], IMAGE), null);
  assert.deepEqual(geometryFromPoints('C2', [null, null, [5, 5]], IMAGE), { inferior: null, centroid: [5, 5] });
  assert.deepEqual(geometryFromPoints('C2', [ia, ip, null], IMAGE), { inferior: [ia, ip], centroid: null });
  assert.equal(geometryFromPoints('S1', [sa, null], IMAGE), null, 'an endplate has one part');
  assert.equal(geometryFromPoints('T4', [null], IMAGE), null);
  assert.deepEqual(geometryFromPoints('FH1', [[0, 10], null, [20, 10], null], IMAGE).center, [10, 10], 'a head fits the points it has');
});

test('a body or C2 may finish early once an endplate is whole and no part is half set; it still finishes by itself at every slot', () => {
  let e = startPlacing(blankEditor('cervical'), 'C6');
  assert.equal(canFinishPlacing(e, IMAGE), false, 'nothing set');
  e = addPoint(e, [10, 10], IMAGE);
  assert.equal(canFinishPlacing(e, IMAGE), false, 'one corner is half an endplate');
  e = addPoint(e, [30, 10], IMAGE);
  assert.equal(canFinishPlacing(e, IMAGE), true, 'SA and SP');
  const done = finishPlacing(e, IMAGE);
  assert.equal(done.placing, null);
  assert.deepEqual(done.levels.C6.geometry, { superior: [[10, 10], [30, 10]], inferior: null });
  assert.equal(done.levels.C6.source, 'annotator');
  assert.equal(levelState(done.levels.C6, done.model.C6), 'manual');
  e = addPoint(e, [10, 30], IMAGE);
  assert.equal(canFinishPlacing(e, IMAGE), false, 'three corners: the inferior pair is half set');
  assert.equal(finishPlacing(e, IMAGE), e, 'and FINISH is a no-op');
  e = addPoint(e, [30, 30], IMAGE);
  assert.equal(e.placing, null, 'the fourth corner finishes by itself');
  let lower = setPlacingStep(startPlacing(blankEditor('lumbar'), 'L1'), 2);
  lower = addPoint(addPoint(lower, [10, 30], IMAGE), [30, 30], IMAGE);
  assert.equal(canFinishPlacing(lower, IMAGE), true, 'IA and IP alone');
  assert.deepEqual(finishPlacing(lower, IMAGE).levels.L1.geometry, { superior: null, inferior: [[10, 30], [30, 30]] });
  let c2 = setPlacingStep(startPlacing(blankEditor('cervical'), 'C2'), 2);
  c2 = addPoint(c2, [45, 12], IMAGE);
  assert.equal(canFinishPlacing(c2, IMAGE), true, 'the centroid alone');
  assert.deepEqual(finishPlacing(c2, IMAGE).levels.C2.geometry, { inferior: null, centroid: [45, 12] });
  let s1 = addPoint(startPlacing(blankEditor('lumbar'), 'S1'), [10, 10], IMAGE);
  assert.equal(canFinishPlacing(s1, IMAGE), false, 'an endplate cannot finish early');
});

test('resumePlacing pre-fills the set slots of a partial level, with the given empty step or the first one current, and nothing to undo', () => {
  const partial = { superior: [[10, 10], [30, 10]], inferior: null };
  let e = setLevelGeometry(blankEditor('cervical'), 'C6', partial);
  const resumed = resumePlacing(e, 'C6');
  assert.deepEqual(resumed.placing, { code: 'C6', points: [[10, 10], [30, 10], null, null], current: 2, history: [] });
  assert.equal(resumed.selected, 'C6');
  assert.equal(resumed.handle, null);
  assert.equal(resumed.aiming, false);
  assert.deepEqual(resumed.levels.C6.geometry, partial, 'the level keeps its geometry while the placement runs');
  assert.deepEqual(resumePlacing(e, 'C6', 3).placing.current, 3, 'a chosen empty step');
  assert.deepEqual(resumePlacing(e, 'C6', 0).placing.current, 2, 'a set step is not chosen: the first empty one is');
  assert.equal(undoPoint(resumed), resumed, 'nothing to undo');
  const whole = addPoint(addPoint(resumed, [10, 30], IMAGE), [30, 30], IMAGE);
  assert.equal(whole.placing, null);
  assert.deepEqual(whole.levels.C6.geometry, { superior: [[10, 10], [30, 10]], inferior: [[10, 30], [30, 30]] });
  assert.deepEqual(cancelPlacing(resumed).levels.C6.geometry, partial, 'CANCEL leaves the level as it was');
  const finished = finishPlacing(resumed, IMAGE);
  assert.equal(finished.placing, null);
  assert.deepEqual(finished.levels.C6.geometry, partial, 'FINISH with nothing new writes the same shape');
  assert.equal(resumePlacing(e, 'C3'), e, 'an unplaced level is not resumed');
  const wholeC3 = setLevelGeometry(e, 'C3', { superior: [[1, 1], [2, 1]], inferior: [[1, 2], [2, 2]] });
  assert.equal(resumePlacing(wholeC3, 'C3'), wholeC3, 'a whole level is not resumed');
  const hidden = toggleVisible(e, 'C6');
  assert.equal(resumePlacing(hidden, 'C6'), hidden, 'a hidden level is not resumed');
  const placingC3 = startPlacing(e, 'C3');
  assert.equal(resumePlacing(placingC3, 'C6'), placingC3, 'not while a placement runs');
  const c2 = setLevelGeometry(e, 'C2', { inferior: null, centroid: [45, 12] });
  assert.deepEqual(resumePlacing(c2, 'C2').placing, { code: 'C2', points: [null, null, [45, 12]], current: 0, history: [] });
});

test('removePart nulls the focused handle\'s part and moves the focus; the last part, a one-part kind, a placement and a missing handle are refused', () => {
  const whole = { superior: [[10, 10], [30, 10]], inferior: [[10, 30], [30, 30]] };
  let e = selectLevel(setLevelGeometry(blankEditor('cervical'), 'C6', whole), 'C6');
  assert.deepEqual(e.handle, { code: 'C6', handle: 'SA' });
  const upperGone = removePart(e, 'C6', 'SP');
  assert.deepEqual(upperGone.levels.C6.geometry, { superior: null, inferior: whole.inferior });
  assert.equal(upperGone.levels.C6.source, 'annotator');
  assert.deepEqual(upperGone.handle, { code: 'C6', handle: 'IA' }, 'the first remaining handle');
  assert.equal(upperGone.aiming, false);
  assert.equal(removePart(upperGone, 'C6', 'IA'), upperGone, 'the last part stays');
  assert.equal(removePart(e, 'C6', 'CENTROID'), e, 'a handle the kind lacks');
  const placingC6 = startPlacing(e, 'C6');
  assert.equal(removePart(placingC6, 'C6', 'SA'), placingC6, 'not while it is being placed');
  const s1 = selectLevel(setLevelGeometry(e, 'S1', { superior: [[1, 1], [2, 1]] }), 'S1');
  assert.equal(removePart(s1, 'S1', 'SA'), s1, 'an endplate has one part');
  const fh = selectLevel(setLevelGeometry(e, 'FH1', { center: [50, 50], radius: 10, rim: null }), 'FH1');
  assert.equal(removePart(fh, 'FH1', 'R0'), fh, 'a head has none');
  const c2 = selectLevel(setLevelGeometry(e, 'C2', { inferior: [[40, 20], [50, 20]], centroid: [45, 12] }), 'C2');
  assert.deepEqual(removePart(c2, 'C2', 'CENTROID').levels.C2.geometry, { inferior: [[40, 20], [50, 20]], centroid: null });
  assert.deepEqual(removePart(c2, 'C2', 'IP').levels.C2.geometry, { inferior: null, centroid: [45, 12] });
  assert.deepEqual(removePart(c2, 'C2', 'IP').handle, { code: 'C2', handle: 'CENTROID' });
});

test('selectLevel focuses the level\'s first existing handle, so a body without its superior pair focuses IA', () => {
  const e = setLevelGeometry(blankEditor('cervical'), 'C7', { superior: null, inferior: [[10, 30], [30, 30]], centroid: null });
  assert.deepEqual(selectLevel(e, 'C7').handle, { code: 'C7', handle: 'IA' });
  const c2 = setLevelGeometry(e, 'C2', { inferior: null, centroid: [45, 12] });
  assert.deepEqual(selectLevel(c2, 'C2').handle, { code: 'C2', handle: 'CENTROID' });
});

test('a partial level counts as placed and leaves the training label complete', () => {
  const e = setLevelGeometry(blankEditor('cervical'), 'C7', { superior: [[10, 10], [30, 10]], inferior: null, centroid: null });
  assert.equal(summaryText(e).startsWith('1 PLACED'), true);
  assert.equal(trainingStatus(e).missing.includes('C7'), false);
});

// ---------- (2026-10-22, round 2, spec §12 N8-N11) C7's optional centroid ----------

test('C7 is a body with an optional centroid part: parts, steps, keys and the first handle', () => {
  assert.deepEqual(CENTROID_BODIES, ['C7']);
  assert.equal(hasCentroid('C7'), true);
  assert.equal(hasCentroid('C6'), false);
  assert.deepEqual(partsOf('C7'), [{ key: 'superior', steps: [0, 1] }, { key: 'inferior', steps: [2, 3] }, { key: 'centroid', steps: [4] }]);
  assert.deepEqual(partsOf('L1'), [{ key: 'superior', steps: [0, 1] }, { key: 'inferior', steps: [2, 3] }]);
  assert.equal(partOfHandle('C7', 'CENTROID'), 'centroid');
  assert.equal(partOfHandle('C6', 'CENTROID'), null);
  const { need, steps } = placementSteps('C7');
  assert.equal(need, 5);
  assert.deepEqual(steps[4], { label: 'CENTROID', help: 'Click the centroid of the C7 body.', colorKey: 'level' });
  assert.equal(placementSteps('C6').need, 4);
  assert.deepEqual(pointKeys('C7'), ['sa', 'sp', 'ia', 'ip', 'centroid']);
  assert.deepEqual(pointKeys('L3'), ['sa', 'sp', 'ia', 'ip']);
  assert.equal(firstHandle('C7', { superior: null, inferior: null, centroid: [5, 5] }), 'CENTROID');
  assert.equal(firstHandle('C7', { superior: null, inferior: [[1, 2], [2, 2]], centroid: [5, 5] }), 'IA');
});

test('a C7 placement finishes by itself at its four corners, the centroid optional; FINISH takes a centroid alone', () => {
  let e = startPlacing(blankEditor('cervical'), 'C7');
  assert.deepEqual(e.placing.points, [null, null, null, null, null]);
  for (const point of [[10, 10], [30, 10], [10, 30], [30, 30]]) e = addPoint(e, point, IMAGE);
  assert.equal(e.placing, null, 'four corners finish by themselves');
  assert.deepEqual(e.levels.C7.geometry, { superior: [[10, 10], [30, 10]], inferior: [[10, 30], [30, 30]], centroid: null });
  let withCentroid = setPlacingStep(startPlacing(blankEditor('cervical'), 'C7'), 4);
  withCentroid = addPoint(withCentroid, [20, 20], IMAGE);
  assert.equal(withCentroid.placing.current, 0, 'back to the first empty step');
  assert.equal(canFinishPlacing(withCentroid, IMAGE), true, 'a centroid alone may finish');
  assert.deepEqual(finishPlacing(withCentroid, IMAGE).levels.C7.geometry, { superior: null, inferior: null, centroid: [20, 20] });
  for (const point of [[10, 10], [30, 10], [10, 30], [30, 30]]) withCentroid = addPoint(withCentroid, point, IMAGE);
  assert.equal(withCentroid.placing, null);
  assert.deepEqual(withCentroid.levels.C7.geometry.centroid, [20, 20], 'the centroid rides along');
  assert.equal(placingLabel(startPlacing(blankEditor('cervical'), 'C7')), 'PLACING C7 · 1 OF 5');
  const half = addPoint(startPlacing(blankEditor('cervical'), 'C7'), [10, 10], IMAGE);
  assert.equal(canFinishPlacing(half, IMAGE), false, 'a lone corner');
});

test('C7 geometry is read, written, resumed, reverted and removed with its centroid key, null when absent', () => {
  const g = cervicalGeometry();
  const c7 = { superior: body(10, 110).superior, inferior: body(10, 110).inferior, centroid: null };
  assert.deepEqual(levelsFromGeometry({ ...g, c7_centroid: [15, 115] }).C7, c7, 'the study\'s c7_centroid is never read as the part');
  assert.deepEqual(geometryFromPoints('C7', [[1, 1], [2, 1], null, null, null], IMAGE), { superior: [[1, 1], [2, 1]], inferior: null, centroid: null });
  assert.deepEqual(geometryFromPoints('C7', [null, null, null, null, [5, 5]], IMAGE), { superior: null, inferior: null, centroid: [5, 5] });
  assert.equal(geometryFromPoints('C7', [null, null, null, null, null], IMAGE), null);
  const whole = { superior: [[1, 1], [2, 1]], inferior: [[1, 2], [2, 2]], centroid: null };
  const e = setLevelGeometry(blankEditor('cervical'), 'C7', whole);
  assert.deepEqual(resumePlacing(e, 'C7', 4).placing, { code: 'C7', points: [[1, 1], [2, 1], [1, 2], [2, 2], null], current: 4, history: [] }, 'the hollow CENTROID chip resumes at its step');
  assert.deepEqual(missingParts('C7', whole), ['centroid']);
  assert.equal(isPartial('C7', whole), true);
  const placed = setLevelGeometry(e, 'C7', { ...whole, centroid: [1.5, 1.5] });
  assert.deepEqual(changedPoints('C7', placed.levels.C7.geometry, whole), ['centroid']);
  assert.deepEqual(removePart(selectLevel(placed, 'C7'), 'C7', 'CENTROID').levels.C7.geometry, whole);
  const model = { id: 'SP-0007', geometry: { region: 'full_spine', vertebrae: { C7: { ...body(10, 110), quadrilateral: null } }, c7_centroid: [15, 115] } };
  let m = openEditor({ study: model, region: 'full_spine', modelGeometry: model.geometry, saved: null });
  assert.deepEqual(m.model.C7.centroid, null, 'the model\'s C7 has no placed centroid');
  m = setLevelGeometry(m, 'C7', { ...m.levels.C7.geometry, centroid: [15, 115] });
  assert.equal(levelState(m.levels.C7, m.model.C7), 'edited');
  assert.deepEqual(revertLevel(m, 'C7').levels.C7.geometry, c7);
});

test('a C7 placement never makes its optional centroid current by default; the CENTROID chip still does', () => {
  const sup = { superior: [[1, 1], [2, 1]], inferior: null, centroid: null };
  const e = setLevelGeometry(blankEditor('cervical'), 'C7', sup);
  let r = resumePlacing(e, 'C7', 3);
  assert.equal(r.placing.current, 3);
  r = addPoint(r, [12, 30], IMAGE);
  assert.equal(r.placing.current, 2, 'IA, not the centroid');
  r = addPoint(r, [2, 30], IMAGE);
  assert.equal(r.placing, null, 'both endplates whole finishes it');
  assert.deepEqual(r.levels.C7.geometry, { superior: [[1, 1], [2, 1]], inferior: [[2, 30], [12, 30]], centroid: null });
  let f = setPlacingStep(startPlacing(blankEditor('cervical'), 'C7'), 4);
  f = addPoint(f, [20, 20], IMAGE);
  assert.equal(f.placing.current, 0, 'after a centroid click the next empty corner');
});

// ---------- (2026-10-22, round 2, spec §12 N10) openEditor merges the record's C7 centroid ----------
test('openEditor merges the record\'s C7 centroid into the study\'s C7 corners', () => {
  const study = { id: 'SP-0009', geometry: { region: 'cervical', vertebrae: { C7: { ...body(10, 110) } } }, labelFile: 'x.label.json' };
  const saved = { file: 'x.label.json', levels: { C7: { visible: true, source: 'annotator', geometry: { superior: [[10, 110], [20, 110]], inferior: [[10, 120], [20, 120]], centroid: [15, 115] } } }, comment: '' };
  const e = openEditor({ study, region: 'cervical', modelGeometry: null, saved });
  assert.deepEqual(e.levels.C7.geometry.centroid, [15, 115]);
  assert.deepEqual(e.levels.C7.geometry.superior, study.geometry.vertebrae.C7.superior, 'the corners are the study\'s');
});

test('openEditor takes a saved C7 whole, centroid included, when the study has no C7', () => {
  const study = { id: 'SP-0011', geometry: null, labelFile: 'x.label.json' };
  const geometry = { superior: [[10, 110], [20, 110]], inferior: [[10, 120], [20, 120]], centroid: [15, 115] };
  const saved = { file: 'x.label.json', levels: { C7: { visible: true, source: 'annotator', geometry } }, comment: '' };
  const e = openEditor({ study, region: 'cervical', modelGeometry: null, saved });
  assert.deepEqual(e.levels.C7.geometry, geometry);
});
