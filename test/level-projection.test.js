import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectionRegion, anteriorSideFrom, quadrilateral, projectGeometry,
} from '../renderer/data/level-projection.js';
import {
  levelsFromGeometry, openEditor, setLevelGeometry, toggleVisible,
} from '../renderer/data/levels.js';
import { validate, STORE_VERSION } from '../renderer/data/persistence.js';

// ---------- fixtures (inline) ----------

// A study-shaped vertebra whose corners are all different, so the quadrilateral's order is visible:
// SA [x, y], SP [x + 10, y + 1], IA [x + 1, y + 10], IP [x + 11, y + 12]. Anterior is on the left (SA.x < SP.x).
function studyBody(x, y) {
  const body = bodyAt(x, y);
  return { ...body, quadrilateral: quadrilateral(body) };
}

// A level model body (no quadrilateral).
function bodyAt(x, y) {
  return {
    superior: [[x, y], [x + 10, y + 1]],
    inferior: [[x + 1, y + 10], [x + 11, y + 12]],
  };
}

// The same body mirrored: anterior on the right (SA.x > SP.x).
function mirroredBodyAt(x, y) {
  return {
    superior: [[x + 10, y], [x, y + 1]],
    inferior: [[x + 11, y + 10], [x + 1, y + 12]],
  };
}

// A lumbar study geometry with L3 missing, as the app stores it (and the validator accepts it).
function fakeGeometry() {
  return {
    region: 'lumbar',
    vertebrae: { L1: studyBody(10, 10), L2: studyBody(10, 30), L4: studyBody(10, 70), L5: studyBody(10, 90) },
    s1_superior: [[10, 110], [20, 110]],
    femoral_circles: [[10, 140, 5], [20, 140, 5]],
    l1_center: [15.5, 15.75],
    hip_midpoint: [15, 140],
  };
}

const IMAGE_FIELDS = { image_width: 200, image_height: 160, source_sha256: 'abc123', coordinate_space: 'original_image' };

// An editor over a fresh study: `full_spine` opens every level visible; `hide` unchecks levels afterwards.
function editorWith(placements, { region = 'full_spine', study = {}, hide = [] } = {}) {
  let editor = openEditor({ study, region, modelGeometry: null, saved: null });
  for (const [code, geometry] of Object.entries(placements)) editor = setLevelGeometry(editor, code, geometry);
  for (const code of hide) editor = toggleVisible(editor, code);
  return editor;
}

const CERVICAL_PLACEMENTS = {
  C2: { inferior: [[40, 20], [50, 22]], centroid: [45, 12] },
  C3: bodyAt(10, 30),
  C4: bodyAt(10, 50),
  C5: bodyAt(10, 70),
  C6: bodyAt(10, 90),
  C7: bodyAt(10, 110),
};

const LUMBAR_PLACEMENTS = {
  L1: bodyAt(10, 150),
  L2: bodyAt(10, 170),
  L3: bodyAt(10, 190),
  L4: bodyAt(10, 210),
  L5: bodyAt(10, 230),
  S1: { superior: [[10, 250], [20, 251]] },
  FH1: { center: [10, 280], radius: 5, rim: null },
  FH2: { center: [20, 280], radius: 5, rim: null },
};

const EMPTY_MEASUREMENTS = {
  lumbar: { SS: null, PI: null, PT: null, L1PA: null, LL: { 'L1-S1': null } },
  cervical: { region: 'cervical', C2C7_COBB: null, C2C7_SVA_PX: null, C2C7_SVA_MM: null },
  full_spine: { region: 'full_spine', GLOBAL_SVA_PX: null, GLOBAL_SVA_MM: null },
};

// Pass a geometry through the persistence validator, which nulls (and warns about) one it rejects.
function reload(t, geometry, measurements) {
  const warn = t.mock.method(console, 'warn', () => {});
  const [study] = validate({
    version: STORE_VERSION,
    studies: [{
      id: 'SP-1000', source: 'real', fileName: 'a.png', addedAt: '2026-10-10T00:00:00.000Z',
      view: 'Standing lateral', measurements, geometry, clinical: {},
    }],
  });
  return { study, warned: warn.mock.callCount() };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// ---------- quadrilateral ----------

test('quadrilateral is the superior pair then the inferior pair reversed', () => {
  const SA = [1, 2]; const SP = [11, 3]; const IA = [2, 12]; const IP = [12, 14];
  assert.deepEqual(quadrilateral({ superior: [SA, SP], inferior: [IA, IP] }), [SA, SP, IP, IA]);
});

test('quadrilateral returns its own points, so editing it cannot move the body', () => {
  const source = { superior: [[1, 2], [11, 3]], inferior: [[2, 12], [12, 14]] };
  const quad = quadrilateral(source);
  quad[0][0] = 999;
  quad[3][1] = 999;
  assert.deepEqual(source, { superior: [[1, 2], [11, 3]], inferior: [[2, 12], [12, 14]] });
});

// ---------- levelsFromGeometry (Task 1's export) ----------

test('levelsFromGeometry reads a femoral circle as centre, radius and no rim', () => {
  const levels = levelsFromGeometry(fakeGeometry());
  assert.deepEqual(levels.FH1, { center: [10, 140], radius: 5, rim: null });
  assert.deepEqual(levels.FH2, { center: [20, 140], radius: 5, rim: null });
});

test('levelsFromGeometry reads bodies, S1 and C2, and leaves T1, T4 and absent levels null', () => {
  const geometry = {
    ...fakeGeometry(),
    region: 'full_spine',
    anterior_side: 'left',
    c2_centroid: [45, 12],
    vertebrae: {
      ...fakeGeometry().vertebrae,
      C2: { superior: null, inferior: [[40, 20], [50, 20]], quadrilateral: null },
      C3: studyBody(10, 30),
    },
  };
  const levels = levelsFromGeometry(geometry);
  assert.deepEqual(levels.L1, bodyAt(10, 10));
  assert.equal(levels.L3, null);
  assert.deepEqual(levels.C3, bodyAt(10, 30));
  assert.deepEqual(levels.C2, { inferior: [[40, 20], [50, 20]], centroid: [45, 12] });
  assert.deepEqual(levels.S1, { superior: [[10, 110], [20, 110]] });
  assert.equal(levels.T1, null);
  assert.equal(levels.T4, null);
});

test('levelsFromGeometry needs both of C2\'s parts, a body\'s two pairs, and a null geometry gives all null', () => {
  const noCentroid = { region: 'cervical', vertebrae: { C2: { superior: null, inferior: [[40, 20], [50, 20]], quadrilateral: null } } };
  assert.equal(levelsFromGeometry(noCentroid).C2, null);
  const halfBody = { region: 'lumbar', vertebrae: { L1: { superior: [[1, 1], [2, 2]], inferior: null } } };
  assert.equal(levelsFromGeometry(halfBody).L1, null);
  const none = levelsFromGeometry(null);
  assert.equal(Object.keys(none).length, 16);
  assert.ok(Object.values(none).every(value => value === null));
});

// ---------- projectionRegion ----------

test('a resolved study region is the projection region whatever is placed', () => {
  const placed = { C3: bodyAt(10, 30), L3: bodyAt(10, 190) };
  const editor = editorWith(placed);
  assert.equal(projectionRegion(editor, { region: 'lumbar' }), 'lumbar');
  assert.equal(projectionRegion(editor, { region: 'cervical' }), 'cervical');
  assert.equal(projectionRegion(editor, { region: 'full_spine' }), 'full_spine');
  // 'auto' with a result resolves to the result's region (studyRegion)
  assert.equal(projectionRegion(editor, { region: 'auto', geometry: { region: 'cervical' } }), 'cervical');
});

test('region auto with no result follows the visible placed levels', () => {
  const study = { region: 'auto' };
  const onlyC3 = editorWith({ C3: bodyAt(10, 30) }, { region: 'auto', study });
  const onlyL3 = editorWith({ L3: bodyAt(10, 190) }, { region: 'auto', study });
  const both = editorWith({ C3: bodyAt(10, 30), L3: bodyAt(10, 190) }, { region: 'auto', study });
  const nothing = editorWith({}, { region: 'auto', study });
  assert.equal(projectionRegion(onlyC3, study), 'cervical');
  assert.equal(projectionRegion(onlyL3, study), 'lumbar');
  assert.equal(projectionRegion(both, study), 'full_spine');
  assert.equal(projectionRegion(nothing, study), 'lumbar');
});

test('region auto counts S1 and the femoral heads as lumbar, and ignores T1, T4 and hidden or unplaced levels', () => {
  const study = { region: 'auto' };
  const sacral = editorWith({ C4: bodyAt(10, 50), S1: { superior: [[10, 250], [20, 251]] } }, { region: 'auto', study });
  assert.equal(projectionRegion(sacral, study), 'full_spine');
  const head = editorWith({ FH1: { center: [10, 280], radius: 5, rim: null } }, { region: 'auto', study });
  assert.equal(projectionRegion(head, study), 'lumbar');
  const thoracic = editorWith({ T1: { superior: [[1, 1], [9, 2]] }, T4: { centroid: [5, 5] }, C5: bodyAt(10, 70) }, { region: 'auto', study });
  assert.equal(projectionRegion(thoracic, study), 'cervical');
  const hiddenC = editorWith({ C3: bodyAt(10, 30), L3: bodyAt(10, 190) }, { region: 'auto', study, hide: ['C3'] });
  assert.equal(projectionRegion(hiddenC, study), 'lumbar');
  const hiddenL = editorWith({ C3: bodyAt(10, 30), L3: bodyAt(10, 190) }, { region: 'auto', study, hide: ['L3'] });
  assert.equal(projectionRegion(hiddenL, study), 'cervical');
  // visible but not placed is not placed
  assert.equal(projectionRegion(editorWith({ L3: bodyAt(10, 190) }, { region: 'auto', study }), study), 'lumbar');
});

// ---------- anteriorSideFrom ----------

test('the anterior side is read from the first visible placed level, in the brief\'s order', () => {
  const left = bodyAt(10, 30);
  const right = mirroredBodyAt(10, 50);
  // C2: IA.x < IP.x -> left
  assert.equal(anteriorSideFrom(editorWith({ C2: { inferior: [[40, 20], [50, 22]], centroid: [45, 12] } }), 'right'), 'left');
  assert.equal(anteriorSideFrom(editorWith({ C2: { inferior: [[50, 20], [40, 22]], centroid: [45, 12] } }), 'left'), 'right');
  // C2 outranks a cervical body, which outranks a lumbar one, which outranks T1, which outranks S1
  assert.equal(anteriorSideFrom(editorWith({ C2: { inferior: [[50, 20], [40, 22]], centroid: [45, 12] }, C3: left }), null), 'right');
  assert.equal(anteriorSideFrom(editorWith({ C3: right, L1: left }), null), 'right');
  assert.equal(anteriorSideFrom(editorWith({ L2: left, T1: { superior: [[9, 1], [1, 2]] } }), null), 'left');
  assert.equal(anteriorSideFrom(editorWith({ T1: { superior: [[9, 1], [1, 2]] }, S1: { superior: [[1, 1], [9, 2]] } }), null), 'right');
  assert.equal(anteriorSideFrom(editorWith({ S1: { superior: [[1, 1], [9, 2]] } }), null), 'left');
});

test('the anterior side skips hidden levels, and levels whose corners share an x, then falls back', () => {
  const right = mirroredBodyAt(10, 50);
  const upright = { superior: [[10, 10], [10, 11]], inferior: [[10, 20], [10, 22]] };
  assert.equal(anteriorSideFrom(editorWith({ C3: bodyAt(10, 30), C4: right }, { hide: ['C3'] }), null), 'right');
  assert.equal(anteriorSideFrom(editorWith({ C3: upright, C4: right }), null), 'right');
  assert.equal(anteriorSideFrom(editorWith({ C3: upright }), 'left'), 'left');
  assert.equal(anteriorSideFrom(editorWith({}), 'right'), 'right');
  assert.equal(anteriorSideFrom(editorWith({}), null), null);
  assert.equal(anteriorSideFrom(editorWith({}), undefined), null);
});

test('a fallback that is not left or right is no side at all', () => {
  assert.equal(anteriorSideFrom(editorWith({}), 'auto'), null);
  assert.equal(anteriorSideFrom(editorWith({}), ''), null);
  assert.equal(anteriorSideFrom(null, 'left'), 'left');
  assert.equal(anteriorSideFrom(null, 'up'), null);
});

// ---------- projectGeometry: lumbar ----------

test('projectGeometry is null without an editor', () => {
  assert.equal(projectGeometry(null, { region: 'lumbar' }), null);
});

test('a lumbar projection carries the placed lumbar levels, S1 and both heads, and the validator accepts it', (t) => {
  const editor = editorWith(LUMBAR_PLACEMENTS);
  const geometry = projectGeometry(editor, { region: 'lumbar', geometry: { region: 'lumbar', ...IMAGE_FIELDS } });
  assert.equal(geometry.region, 'lumbar');
  assert.deepEqual(Object.keys(geometry.vertebrae), ['L1', 'L2', 'L3', 'L4', 'L5']);
  assert.deepEqual(geometry.vertebrae.L1, {
    superior: [[10, 150], [20, 151]],
    inferior: [[11, 160], [21, 162]],
    quadrilateral: [[10, 150], [20, 151], [21, 162], [11, 160]],
  });
  assert.deepEqual(geometry.s1_superior, [[10, 250], [20, 251]]);
  assert.deepEqual(geometry.femoral_circles, [[10, 280, 5], [20, 280, 5]]);
  // the backend recomputes both on /measure; the validator wants them present, so the projection supplies them
  assert.deepEqual(geometry.l1_center, [15.5, 155.75]);
  assert.deepEqual(geometry.hip_midpoint, [15, 280]);
  assert.equal('manually_cleared' in geometry, false);
  // the image fields ride along from the base geometry
  for (const [key, value] of Object.entries(IMAGE_FIELDS)) assert.equal(geometry[key], value);
  const { study, warned } = reload(t, geometry, EMPTY_MEASUREMENTS.lumbar);
  assert.notEqual(study.geometry, null);
  assert.equal(warned, 0);
});

test('a lumbar film leaves C levels, T1, T4 and every C centroid out, even when they are placed and visible', (t) => {
  const editor = editorWith({
    ...CERVICAL_PLACEMENTS, ...LUMBAR_PLACEMENTS,
    T1: { superior: [[1, 1], [9, 2]] }, T4: { centroid: [5, 5] },
  });
  const base = { region: 'lumbar', ...IMAGE_FIELDS, anterior_side: 'left', c2_centroid: [1, 1], c7_centroid: [2, 2] };
  const geometry = projectGeometry(editor, { region: 'lumbar', geometry: base });
  assert.deepEqual(Object.keys(geometry.vertebrae), ['L1', 'L2', 'L3', 'L4', 'L5']);
  assert.equal('c2_centroid' in geometry, false);
  assert.equal('c7_centroid' in geometry, false);
  assert.notEqual(reload(t, geometry, EMPTY_MEASUREMENTS.lumbar).study.geometry, null);
});

test('a hidden S1 projects as null and a hidden head is left out', (t) => {
  const editor = editorWith(LUMBAR_PLACEMENTS, { hide: ['S1', 'FH2', 'L3'] });
  const geometry = projectGeometry(editor, { region: 'lumbar' });
  assert.equal(geometry.s1_superior, null);
  assert.deepEqual(geometry.femoral_circles, [[10, 280, 5]]);
  assert.equal(geometry.hip_midpoint, null);
  assert.deepEqual(Object.keys(geometry.vertebrae), ['L1', 'L2', 'L4', 'L5']);
  assert.notEqual(reload(t, geometry, EMPTY_MEASUREMENTS.lumbar).study.geometry, null);
});

test('a visible level with no geometry yet is not projected', () => {
  const editor = editorWith({ L2: bodyAt(10, 170) });   // every other level is visible but unplaced
  const geometry = projectGeometry(editor, { region: 'lumbar' });
  assert.deepEqual(Object.keys(geometry.vertebrae), ['L2']);
  assert.equal(geometry.s1_superior, null);
  assert.deepEqual(geometry.femoral_circles, []);
  assert.equal(geometry.l1_center, null);
});

test('one femoral head gives no hip midpoint', (t) => {
  const editor = editorWith({ L1: bodyAt(10, 150), FH2: { center: [20, 280], radius: 5, rim: null } });
  const geometry = projectGeometry(editor, { region: 'lumbar' });
  assert.deepEqual(geometry.femoral_circles, [[20, 280, 5]]);
  assert.equal(geometry.hip_midpoint, null);
  assert.notEqual(reload(t, geometry, EMPTY_MEASUREMENTS.lumbar).study.geometry, null);
});

test('a head whose radius collapsed to zero is not projected, so the validator never rejects the film', (t) => {
  const editor = editorWith({
    L1: bodyAt(10, 150),
    FH1: { center: [10, 280], radius: 0, rim: [[10, 280], [10, 280]] },
    FH2: { center: [20, 280], radius: 5, rim: null },
  });
  const geometry = projectGeometry(editor, { region: 'lumbar' });
  assert.deepEqual(geometry.femoral_circles, [[20, 280, 5]]);
  assert.equal(geometry.hip_midpoint, null);
  assert.notEqual(reload(t, geometry, EMPTY_MEASUREMENTS.lumbar).study.geometry, null);
});

test('nothing placed on a lumbar film is a manual clear', (t) => {
  const editor = editorWith({}, { region: 'lumbar' });
  const geometry = projectGeometry(editor, { region: 'lumbar', geometry: { region: 'lumbar', ...IMAGE_FIELDS } });
  assert.equal(geometry.region, 'lumbar');
  assert.deepEqual(geometry.vertebrae, {});
  assert.equal(geometry.s1_superior, null);
  assert.deepEqual(geometry.femoral_circles, []);
  assert.equal(geometry.manually_cleared, true);
  assert.equal(geometry.l1_center, null);
  assert.equal(geometry.hip_midpoint, null);
  assert.equal(geometry.image_width, 200);
  const { study, warned } = reload(t, geometry, EMPTY_MEASUREMENTS.lumbar);
  assert.notEqual(study.geometry, null);
  assert.equal(warned, 0);
});

test('a stale manual-clear mark is dropped once anything is placed', () => {
  const editor = editorWith({ S1: { superior: [[10, 250], [20, 251]] } });
  const base = { region: 'lumbar', vertebrae: {}, s1_superior: null, femoral_circles: [], manually_cleared: true };
  const geometry = projectGeometry(editor, { region: 'lumbar', geometry: base });
  assert.equal('manually_cleared' in geometry, false);
});

test('anterior_confirmed false survives only on a level still holding the model\'s output', () => {
  const model = fakeGeometry();
  model.vertebrae.L2.anterior_confirmed = false;
  model.vertebrae.L4.anterior_confirmed = false;
  const study = { region: 'lumbar', geometry: model };
  let editor = openEditor({ study, region: 'lumbar', modelGeometry: model, saved: null });
  let geometry = projectGeometry(editor, study);
  assert.equal(geometry.vertebrae.L2.anterior_confirmed, false);
  assert.equal(geometry.vertebrae.L4.anterior_confirmed, false);
  assert.equal('anterior_confirmed' in geometry.vertebrae.L1, false);
  // dragging L4 makes it the annotator's
  editor = setLevelGeometry(editor, 'L4', bodyAt(11, 70));
  geometry = projectGeometry(editor, study);
  assert.equal(geometry.vertebrae.L2.anterior_confirmed, false);
  assert.equal('anterior_confirmed' in geometry.vertebrae.L4, false);
});

test('region auto with nothing placed projects as a lumbar manual clear', (t) => {
  const study = { region: 'auto' };
  const geometry = projectGeometry(editorWith({}, { region: 'auto', study }), study);
  assert.equal(geometry.region, 'lumbar');
  assert.equal(geometry.manually_cleared, true);
  assert.notEqual(reload(t, geometry, EMPTY_MEASUREMENTS.lumbar).study.geometry, null);
});

// ---------- projectGeometry: cervical ----------

test('a cervical projection holds C2 as an inferior endplate and a centroid, and the validator accepts it', (t) => {
  const editor = editorWith(CERVICAL_PLACEMENTS, { region: 'cervical' });
  const study = { region: 'cervical', geometry: { region: 'cervical', anterior_side: 'right', ...IMAGE_FIELDS } };
  const geometry = projectGeometry(editor, study);
  assert.equal(geometry.region, 'cervical');
  assert.deepEqual(Object.keys(geometry.vertebrae), ['C2', 'C3', 'C4', 'C5', 'C6', 'C7']);
  assert.deepEqual(geometry.vertebrae.C2, { superior: null, inferior: [[40, 20], [50, 22]], quadrilateral: null });
  assert.deepEqual(geometry.vertebrae.C7, {
    superior: [[10, 110], [20, 111]],
    inferior: [[11, 120], [21, 122]],
    quadrilateral: [[10, 110], [20, 111], [21, 122], [11, 120]],
  });
  assert.deepEqual(geometry.c2_centroid, [45, 12]);
  // the stored side stands although C2 (IA.x < IP.x) would read as 'left': the landmarks never override it
  assert.equal(geometry.anterior_side, 'right');
  assert.equal(geometry.s1_superior, null);
  assert.deepEqual(geometry.femoral_circles, []);
  assert.equal(geometry.hip_midpoint, null);
  assert.equal(geometry.l1_center, null);
  for (const [key, value] of Object.entries(IMAGE_FIELDS)) assert.equal(geometry[key], value);
  const { study: reloaded, warned } = reload(t, geometry, EMPTY_MEASUREMENTS.cervical);
  assert.notEqual(reloaded.geometry, null);
  assert.equal(warned, 0);
});

test('a cervical film drops the lumbar, sacral and femoral levels even when they are placed and visible', (t) => {
  const editor = editorWith({ ...CERVICAL_PLACEMENTS, ...LUMBAR_PLACEMENTS });
  const base = { region: 'full_spine', anterior_side: 'left', c7_centroid: [3, 3], manually_cleared: true, ...IMAGE_FIELDS };
  const geometry = projectGeometry(editor, { region: 'cervical', geometry: base });
  assert.deepEqual(Object.keys(geometry.vertebrae), ['C2', 'C3', 'C4', 'C5', 'C6', 'C7']);
  assert.equal(geometry.s1_superior, null);
  assert.deepEqual(geometry.femoral_circles, []);
  assert.equal(geometry.hip_midpoint, null);
  assert.equal(geometry.l1_center, null);
  assert.equal('c7_centroid' in geometry, false);
  assert.equal('manually_cleared' in geometry, false);
  assert.notEqual(reload(t, geometry, EMPTY_MEASUREMENTS.cervical).study.geometry, null);
});

test('an unplaced or hidden C2 leaves no C2 and no centroid', (t) => {
  const { C2, ...rest } = CERVICAL_PLACEMENTS;
  const unplaced = projectGeometry(editorWith(rest, { region: 'cervical' }), { region: 'cervical' });
  assert.equal('C2' in unplaced.vertebrae, false);
  assert.equal(unplaced.c2_centroid, null);
  const hidden = projectGeometry(editorWith(CERVICAL_PLACEMENTS, { region: 'cervical', hide: ['C2'] }), { region: 'cervical' });
  assert.equal('C2' in hidden.vertebrae, false);
  assert.equal(hidden.c2_centroid, null);
  assert.notEqual(reload(t, hidden, EMPTY_MEASUREMENTS.cervical).study.geometry, null);
});

test('a stored anterior side survives a placed body that reads the other way (R8), cervical and full spine', (t) => {
  // C3 is bodyAt: SA.x < SP.x, which reads as 'left'; the film's stored side is 'right'
  const body = { C3: bodyAt(10, 30) };
  const cervical = projectGeometry(editorWith(body, { region: 'cervical' }),
    { region: 'cervical', geometry: { region: 'cervical', anterior_side: 'right' } });
  assert.equal(cervical.anterior_side, 'right');
  const full = projectGeometry(editorWith(body),
    { region: 'full_spine', geometry: { region: 'full_spine', anterior_side: 'right' } });
  assert.equal(full.anterior_side, 'right');
  // dragging a corner past its partner (SA.x now > SP.x on the first placed body) does not flip the film
  const stored = { region: 'cervical', geometry: { region: 'cervical', anterior_side: 'left' } };
  assert.equal(projectGeometry(editorWith({ C3: mirroredBodyAt(10, 30) }, { region: 'cervical' }), stored).anterior_side, 'left');
  assert.equal(reload(t, cervical, EMPTY_MEASUREMENTS.cervical).study.geometry.anterior_side, 'right');
  assert.equal(reload(t, full, EMPTY_MEASUREMENTS.full_spine).study.geometry.anterior_side, 'right');
});

test('the study\'s chosen anterior side is used when the geometry has none, and the geometry\'s wins when both exist', (t) => {
  const editor = editorWith({ C3: bodyAt(10, 30) }, { region: 'cervical' });   // the body reads as 'left'
  const fromStudy = projectGeometry(editor, { region: 'cervical', anteriorSide: 'right' });
  assert.equal(fromStudy.anterior_side, 'right');
  const noSideInGeometry = projectGeometry(editor, { region: 'cervical', anteriorSide: 'right', geometry: { region: 'cervical', vertebrae: {} } });
  assert.equal(noSideInGeometry.anterior_side, 'right');
  const both = projectGeometry(editor, { region: 'cervical', anteriorSide: 'left', geometry: { region: 'cervical', anterior_side: 'right' } });
  assert.equal(both.anterior_side, 'right');
  // a stored value that is not a side is no side
  const junk = projectGeometry(editor, { region: 'cervical', anteriorSide: 'right', geometry: { region: 'cervical', anterior_side: 'auto' } });
  assert.equal(junk.anterior_side, 'right');
  assert.notEqual(reload(t, fromStudy, EMPTY_MEASUREMENTS.cervical).study.geometry, null);
});

test('the placed levels orient a film only when neither the geometry nor the study has a side, and a side is never invented', (t) => {
  const none = editorWith({}, { region: 'cervical' });
  const derived = projectGeometry(editorWith({ C3: mirroredBodyAt(10, 30) }, { region: 'cervical' }), { region: 'cervical' });
  assert.equal(derived.anterior_side, 'right');
  const derivedLeft = projectGeometry(editorWith({ C3: bodyAt(10, 30) }, { region: 'cervical' }),
    { region: 'cervical', geometry: { region: 'cervical', anterior_side: null } });
  assert.equal(derivedLeft.anterior_side, 'left');
  assert.notEqual(reload(t, derivedLeft, EMPTY_MEASUREMENTS.cervical).study.geometry, null);

  // no placed level gives an orientation and nothing is stored: the side stays null, and the validator
  // (which needs a side on a cervical film) does not accept the geometry as complete
  const orphan = projectGeometry(none, { region: 'cervical' });
  assert.equal(orphan.anterior_side, null);
  const { study, warned } = reload(t, orphan, EMPTY_MEASUREMENTS.cervical);
  assert.equal(study.geometry, null);
  assert.equal(warned, 1);
});

// ---------- projectGeometry: full spine ----------

test('a full-spine projection merges both, with the C7 centroid at the mean of C7\'s corners', (t) => {
  const editor = editorWith({ ...CERVICAL_PLACEMENTS, ...LUMBAR_PLACEMENTS });
  const study = { region: 'full_spine', geometry: { region: 'full_spine', ...IMAGE_FIELDS } };
  const geometry = projectGeometry(editor, study);
  assert.equal(geometry.region, 'full_spine');
  assert.equal(geometry.anterior_side, 'left');          // C2's IA.x < IP.x
  assert.deepEqual(Object.keys(geometry.vertebrae), ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'L1', 'L2', 'L3', 'L4', 'L5']);
  assert.deepEqual(geometry.vertebrae.C2, { superior: null, inferior: [[40, 20], [50, 22]], quadrilateral: null });
  assert.deepEqual(geometry.c2_centroid, [45, 12]);
  // C7 is body(10, 110): corners (10,110) (20,111) (21,122) (11,120)
  assert.deepEqual(geometry.c7_centroid, [15.5, 115.75]);
  assert.deepEqual(geometry.s1_superior, [[10, 250], [20, 251]]);
  assert.deepEqual(geometry.femoral_circles, [[10, 280, 5], [20, 280, 5]]);
  assert.deepEqual(geometry.l1_center, [15.5, 155.75]);
  assert.deepEqual(geometry.hip_midpoint, [15, 280]);
  for (const [key, value] of Object.entries(IMAGE_FIELDS)) assert.equal(geometry[key], value);
  const { study: reloaded, warned } = reload(t, geometry, EMPTY_MEASUREMENTS.full_spine);
  assert.notEqual(reloaded.geometry, null);
  assert.equal(warned, 0);
});

test('a full-spine projection reads a right-hand anterior side, and has no C7 centroid without C7', (t) => {
  const mirrored = {
    C3: mirroredBodyAt(10, 30),
    L1: mirroredBodyAt(10, 150),
  };
  const editor = editorWith(mirrored);
  const geometry = projectGeometry(editor, { region: 'full_spine' });
  assert.equal(geometry.anterior_side, 'right');
  assert.equal(geometry.c7_centroid, null);
  assert.equal(geometry.c2_centroid, null);
  assert.deepEqual(Object.keys(geometry.vertebrae), ['C3', 'L1']);
  assert.notEqual(reload(t, geometry, EMPTY_MEASUREMENTS.full_spine).study.geometry, null);
});

test('region auto with C and L levels placed projects as a full spine', (t) => {
  const study = { region: 'auto' };
  const editor = editorWith({ C3: bodyAt(10, 30), L3: bodyAt(10, 190) }, { region: 'auto', study });
  const geometry = projectGeometry(editor, study);
  assert.equal(geometry.region, 'full_spine');
  assert.equal(geometry.anterior_side, 'left');
  assert.deepEqual(Object.keys(geometry.vertebrae), ['C3', 'L3']);
  assert.notEqual(reload(t, geometry, EMPTY_MEASUREMENTS.full_spine).study.geometry, null);
});

test('region auto with only cervical levels placed projects as a cervical film', (t) => {
  const study = { region: 'auto' };
  const geometry = projectGeometry(editorWith({ C3: bodyAt(10, 30) }, { region: 'auto', study }), study);
  assert.equal(geometry.region, 'cervical');
  assert.equal(geometry.anterior_side, 'left');
  assert.notEqual(reload(t, geometry, EMPTY_MEASUREMENTS.cervical).study.geometry, null);
});

// ---------- purity ----------

test('projecting changes neither the editor nor the study, and shares no points with them', () => {
  const editor = deepFreeze(editorWith({ ...CERVICAL_PLACEMENTS, ...LUMBAR_PLACEMENTS }));
  const study = deepFreeze({ region: 'full_spine', geometry: { region: 'full_spine', anterior_side: 'left', ...IMAGE_FIELDS, vertebrae: {} } });
  const geometry = projectGeometry(editor, study);
  assert.doesNotThrow(() => {
    geometry.vertebrae.L1.superior[0][0] = -1;
    geometry.vertebrae.L1.quadrilateral[0][0] = -1;
    geometry.vertebrae.C2.inferior[1][1] = -1;
    geometry.femoral_circles[0][0] = -1;
    geometry.s1_superior[0][0] = -1;
    geometry.c2_centroid[0] = -1;
  });
  assert.deepEqual(editor.levels.L1.geometry, bodyAt(10, 150));
  assert.deepEqual(editor.levels.C2.geometry, CERVICAL_PLACEMENTS.C2);
  assert.deepEqual(editor.levels.FH1.geometry, LUMBAR_PLACEMENTS.FH1);
  assert.deepEqual(editor.levels.S1.geometry, LUMBAR_PLACEMENTS.S1);
});
