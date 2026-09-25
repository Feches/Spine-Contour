import test from 'node:test';
import assert from 'node:assert/strict';
import { globalSvaMeasurements, globalSvaRows, globalSvaMeasureGeometry, GLOBAL_SVA_HANDLES } from '../renderer/data/global-sva.js';
import { studyRegion, regionRunReason, cervicalMeasurements } from '../renderer/data/cervical.js';
import { modelLabel } from '../renderer/data/models.js';
import { deriveStatus, landmarkReviewReasons } from '../renderer/data/status.js';
import { landmarkAt, setLandmarkAt, nearestLandmark } from '../renderer/viewer/geometry.js';
import { nextSelection, nudge } from '../renderer/viewer/interactions.js';
import { constructionLabel, drawDynamicLayer } from '../renderer/viewer/canvas.js';
import { createMeasureQueue } from '../renderer/viewer/measure-queue.js';
import { STORE_VERSION, validate } from '../renderer/data/persistence.js';
import { predictionMatchesStudy } from '../renderer/data/predictions.js';
import { toCsv, toPairedCsv, parse, exportMeasurementColumns } from '../renderer/data/csv.js';
import { parameterValues, measurementColumns } from '../renderer/data/parameters.js';
import { pairStudies } from '../renderer/data/pairing.js';
import { planBatch } from '../renderer/data/batch.js';
import { loadWorkspaceStudies } from '../renderer/screens/workspace.js';
import { folderRows } from '../renderer/data/seeding.js';
import { segmentStudy, setFilePayload } from '../renderer/screens/analysis.js';
import { getState, setState } from '../renderer/store.js';

// All coordinates and scale values in this file are synthetic.
function study() {
  const s = { id: 'SP-9400', source: 'real', fileName: 'synthetic-full-spine.png', filePath: '/synthetic/full-spine.png',
    addedAt: '2026-09-23T12:00:00Z', view: 'Standing lateral', region: 'full_spine', anteriorSide: 'left',
    subjectId: 'synthetic-subject', timepoint: 'Pre-op', clinical: {},
    geometry: { region: 'full_spine', anterior_side: 'left', c7_centroid: [140, 100],
      s1_superior: [[120, 900], [180, 920]], image_width: 500, image_height: 1000,
      source_sha256: 'a'.repeat(64), coordinate_space: 'original_image',
      vertebrae: {}, femoral_circles: [], hip_midpoint: null, l1_center: null },
    calibration: { version: 1, source_sha256: 'a'.repeat(64), width: 500, height: 1000,
      coordinate_space: 'original_image', status: 'dicom', candidates: [], selected_index: null,
      spacing: { row_mm: .5, column_mm: .25, source: 'dicom_pixel_spacing' } },
    qc: { models: { vertebrae: 'dual_hrnet', cervical: 'cervical_hrnet', lumbar: 'hrnet' } },
  };
  s.measurements = globalSvaMeasurements(s);
  return s;
}
const table = csv => parse(csv.split('\r\n').slice(3).join('\r\n'));

test('global SVA uses C7 centroid and posterior S1 corner, is anterior-positive and mirror-invariant', () => {
  const s = study();
  assert.deepEqual(s.measurements, { region: 'full_spine', GLOBAL_SVA_PX: 40, GLOBAL_SVA_MM: 10 });
  const mirror = structuredClone(s);
  for (const p of [mirror.geometry.c7_centroid, ...mirror.geometry.s1_superior]) p[0] = 499 - p[0];
  mirror.geometry.anterior_side = 'right';
  assert.deepEqual(globalSvaMeasurements(mirror), s.measurements);
  s.geometry.c7_centroid = [200, 450];
  assert.equal(globalSvaMeasurements(s).GLOBAL_SVA_PX, -20);
  s.geometry.c7_centroid[0] = 180;
  assert.equal(globalSvaMeasurements(s).GLOBAL_SVA_PX, 0);
  assert.equal(cervicalMeasurements(s).C2C7_SVA_PX, null);
});

test('current source-bound calibration controls mm; scale clearing never restores stale prediction spacing', () => {
  const s = study(); s.geometry.pixel_spacing = [.5, .25];
  s.calibration.spacing.row_mm = 2;
  assert.equal(globalSvaMeasurements(s).GLOBAL_SVA_MM, 10);
  s.calibration.spacing.column_mm = .5;
  assert.equal(globalSvaMeasurements(s).GLOBAL_SVA_MM, 20);
  assert.deepEqual(globalSvaMeasureGeometry(s.geometry, s.calibration).pixel_spacing, [2, .5]);
  for (const bad of [null, { ...s.calibration, spacing: null, status: 'cleared' },
    { ...s.calibration, source_sha256: 'b'.repeat(64) }, { ...s.calibration, width: 1000 }]) {
    assert.equal(globalSvaMeasurements({ ...s, calibration: bad }).GLOBAL_SVA_MM, null);
    assert.equal(globalSvaMeasureGeometry(s.geometry, bad).pixel_spacing, null);
    assert.equal(globalSvaRows({ ...s, calibration: bad })[0].unit, 'px');
  }
});

test('missing, malformed, out-of-frame and collapsed anchors leave global SVA unavailable', () => {
  for (const patch of [{ c7_centroid: null }, { c7_centroid: [-1, 100] }, { c7_centroid: [500, 100] },
    { c7_centroid: [140, NaN] }, { s1_superior: null }, { s1_superior: [[120, 900]] },
    { s1_superior: [[120, 900], [120, 900]] }, { anterior_side: null }]) {
    const s = study(); Object.assign(s.geometry, patch);
    assert.equal(globalSvaMeasurements(s).GLOBAL_SVA_PX, null);
    assert.equal(globalSvaRows(s)[0].absent, true);
  }
});

test('the three global handles are keyboard and pointer reachable, editable, and bounded', () => {
  const s = study(), g = s.geometry;
  let selected = null;
  for (const expected of GLOBAL_SVA_HANDLES) { selected = nextSelection(selected, 1, g); assert.deepEqual(selected, expected); }
  assert.deepEqual(nextSelection(selected, 1, g), GLOBAL_SVA_HANDLES[0]);
  const canvas = { width: 500, height: 1000, getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 1000 }) };
  assert.equal(nearestLandmark(g, 140, 100, canvas).corner, 'CENTROID');
  nudge(g, GLOBAL_SVA_HANDLES[0], 5, 0);
  assert.equal(globalSvaMeasurements(s).GLOBAL_SVA_PX, 35);
  setLandmarkAt(g, 'S1', 'SP', [183, 920]);
  assert.equal(globalSvaMeasurements(s).GLOBAL_SVA_PX, 38);
  setLandmarkAt(g, 'C7', 'CENTROID', [600, -1]);
  assert.deepEqual(landmarkAt(g, 'C7', 'CENTROID'), [499, 0]);
  g.c7_centroid = null;
  setLandmarkAt(g, 'C7', 'CENTROID', [100, 100]);
  assert.equal(g.c7_centroid, null, 'editing does not invent a missing anchor');
});

test('global overlay uses image-vertical C7 plumb line and horizontal distance to S1 posterior', () => {
  const s = study(), calls = [];
  const ctx = new Proxy({}, { get: (target, key) => key === 'measureText' ? () => ({ width: 10 })
    : key in target ? target[key] : (...args) => calls.push([key, args]),
  set: (target, key, value) => { target[key] = value; return true; } });
  delete s.geometry.vertebrae; delete s.geometry.femoral_circles;
  drawDynamicLayer(ctx, { width: 500, height: 1000 }, s.geometry,
    { selectedLevel: 'GLOBAL_SVA', measurements: s.measurements, editing: true });
  assert.ok(calls.some(([key, p], i) => key === 'moveTo' && p[0] === 140 && p[1] === 100
    && calls[i + 1][0] === 'lineTo' && calls[i + 1][1][0] === 140 && calls[i + 1][1][1] === 920));
  assert.ok(calls.some(([key, p], i) => key === 'moveTo' && p[0] === 140 && p[1] === 920
    && calls[i + 1][0] === 'lineTo' && calls[i + 1][1][0] === 180 && calls[i + 1][1][1] === 920));
  assert.equal(calls.filter(([key]) => key === 'arc').length, 3);
  assert.match(constructionLabel(s.geometry, 'GLOBAL_SVA', s.measurements).text, /C7–S1 SVA 10.0 mm/);
  assert.equal(constructionLabel(s.geometry, 'C2C7_SVA', s.measurements), null);
});

test('full-spine persistence and sidecars retain region/orientation while rejecting stale snapshots', () => {
  const s = study(), saved = structuredClone(s);
  assert.deepEqual(validate({ version: STORE_VERSION, studies: [s] })[0].geometry, s.geometry);
  assert.equal(studyRegion({ geometry: s.geometry }), 'full_spine');
  const sidecar = { geometry: saved.geometry, measurements: saved.measurements, prediction_id: 'run-1' };
  s.predictionId = 'run-1';
  assert.equal(predictionMatchesStudy(s, sidecar), true);
  assert.equal(predictionMatchesStudy(s, { ...sidecar, prediction_id: 'run-0' }), false);
  assert.equal(predictionMatchesStudy(s, { ...sidecar, geometry: { ...saved.geometry, anterior_side: 'right' } }), false);
  assert.equal(predictionMatchesStudy(s, { ...sidecar, geometry: { ...saved.geometry, region: 'cervical' } }), false);
  s.anteriorSide = 'right';
  assert.equal(validate({ version: STORE_VERSION, studies: [s] })[0].geometry, null);
  s.anteriorSide = 'left'; s.geometry.c7_centroid = null; s.geometry.s1_superior = null;
  s.measurements = globalSvaMeasurements(s);
  assert.equal(validate({ version: STORE_VERSION, studies: [s] })[0].geometry.c7_centroid, null);
});

test('global values stay separate in parameters and single/paired CSV, with blank uncalibrated mm', () => {
  const s = study();
  assert.equal(parameterValues(s).GLOBAL_SVA_MM, 10);
  assert.equal(parameterValues(s).PI, null);
  assert.ok(measurementColumns(false, false, true).some(c => c.key === 'GLOBAL_SVA_MM'));
  assert.ok(exportMeasurementColumns([s]).includes('C2-C7 SVA (mm)'));
  let csv = table(toCsv([s]));
  assert.equal(csv.rows[0]['C7-S1 SVA (mm)'], '10');
  assert.equal(csv.rows[0]['Spine region'], 'full_spine');
  assert.equal(csv.rows[0]['Anterior image side'], 'left');
  assert.equal(csv.rows[0]['PI'], '');
  const post = { ...structuredClone(s), id: 'SP-9401', timepoint: 'Post-op', fileName: 'synthetic-post.png' };
  post.geometry.c7_centroid[0] = 120;
  csv = table(toPairedCsv(pairStudies([s, post])));
  assert.equal(csv.rows[0]['Delta C7-S1 SVA (mm) Post-op'], '5');
  s.calibration = null;
  csv = table(toCsv([s]));
  assert.equal(csv.rows[0]['C7-S1 SVA (mm)'], '');
  assert.equal(csv.rows[0]['C7-S1 SVA (px)'], '40');
});

test('workspace full-spine setup allows automatic orientation and retains explicit HRNET overrides', async () => {
  const files = ['/synthetic/full-spine/a.png'];
  const rows = folderRows(files, '/synthetic').map(row => ({ ...row, region: 'full_spine', anteriorSide: 'left' }));
  const loaded = loadWorkspaceStudies({ studies: [], wsFiles: files, wsFolder: '/synthetic', wsFolderRows: rows }).studies[0];
  assert.equal(loaded.region, 'full_spine'); assert.equal(loaded.anteriorSide, 'left');
  const unconfirmed = { ...loaded, anteriorSide: null };
  assert.equal(regionRunReason(unconfirmed), null);
  assert.deepEqual(planBatch({ visible: [unconfirmed], selected: [], running: null }).ids, [unconfirmed.id]);
  assert.equal(modelLabel('vertebrae', 'dual_hrnet'), 'HRNET');
  const saved = getState(), oldWindow = globalThis.window, s = { ...study(), geometry: null, measurements: null };
  let request;
  globalThis.window = { spineContour: { predict: async payload => { request = payload; throw new Error('synthetic transport stop'); } } };
  try {
    setState({ studies: [s], running: null, batch: null, deletingStudies: false });
    setFilePayload(s.id, new Uint8Array([1]));
    const result = await segmentStudy(s.id, { batch: true });
    assert.equal(result.ok, false); assert.equal(request.bodyPart, 'full_spine');
    assert.deepEqual(request.models, { vertebrae: 'dual_hrnet' }); assert.equal(request.anteriorSide, 'left');
  } finally { globalThis.window = oldWindow; setState(saved); }
});

test('correction queue retains C7, orientation and current scale, and resets cancel pending changes', async () => {
  const s = study(); let state = { studies: [s], measurementDrafts: {} }, request, calls = 0;
  const queue = createMeasureQueue({ getState: () => state,
    setState: patch => { state = { ...state, ...patch(state) }; }, showToast: message => assert.fail(message), debounceMs: 1,
    measure: async geometry => { request = geometry; calls++; return { geometry,
      measurements: globalSvaMeasurements({ ...s, geometry }), qc: { coverage: { partial: false } } }; } });
  queue.replaceMeasured(s.id, s.geometry);
  const edited = structuredClone(s.geometry); nudge(edited, GLOBAL_SVA_HANDLES[0], 5, 0);
  queue.commitGeometry(s.id, edited);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(request.region, 'full_spine'); assert.deepEqual(request.c7_centroid, [145, 100]);
  assert.equal(request.anterior_side, 'left'); assert.deepEqual(request.pixel_spacing, [.5, .25]);
  assert.equal(state.studies[0].measurements.GLOBAL_SVA_MM, 8.75);
  assert.deepEqual(state.measurementDrafts, {});
  queue.commitGeometry(s.id, edited); queue.replaceMeasured(s.id, s.geometry);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls, 1); assert.deepEqual(state.measurementDrafts, {});
});

test('full-spine results require review and do not inherit cervical-only guidance', () => {
  const s = study();
  assert.equal(deriveStatus(s), 'rev');
  assert.ok(landmarkReviewReasons(s.qc).some(reason => reason.includes('C7 centroid')));
  assert.ok(!landmarkReviewReasons(s.qc).some(reason => reason.includes('C2/C7')));
  assert.equal(deriveStatus({ ...s, qc: null }), 'rev');
});

function combinedStudy() {
  const s = study();
  const body = (x, y, tilt = 0) => ({ superior: [[x, y], [x + 60, y + tilt]],
    inferior: [[x, y + 35], [x + 60, y + 35 + tilt]],
    quadrilateral: [[x, y], [x + 60, y + tilt], [x + 60, y + 35 + tilt], [x, y + 35]] });
  Object.assign(s.geometry, { c2_centroid: [140, 70], c7_centroid: [160, 280],
    vertebrae: { C2: body(100, 50), C7: body(130, 250, 15), L1: body(130, 620, -10), L5: body(140, 820, 15) },
    femoral_circles: [[130, 960, 20], [180, 960, 22]], hip_midpoint: [155, 960], l1_center: [160, 632.5] });
  s.measurements = { ...cervicalMeasurements(s), ...globalSvaMeasurements(s),
    SS: 30, PI: 50, PT: 20, L1PA: 15, LL: { 'L1-S1': 45, 'L2-S1': null, 'L3-S1': null, 'L4-S1': null, 'L5-S1': 20 } };
  return s;
}

test('standing results retain cervical, lumbar and global measurements across persistence and exports', () => {
  const s = combinedStudy();
  s.region = 'auto'; s.anteriorSide = null;
  const loaded = validate({ version: STORE_VERSION, studies: [JSON.parse(JSON.stringify(s))] })[0];
  assert.equal(loaded.region, 'auto'); assert.equal(loaded.anteriorSide, null);
  assert.equal(studyRegion(loaded), 'full_spine');
  assert.deepEqual(loaded.geometry, s.geometry); assert.deepEqual(loaded.measurements, s.measurements);
  assert.equal(predictionMatchesStudy(loaded, { geometry: s.geometry, measurements: s.measurements }), true);
  const values = parameterValues(loaded);
  assert.equal(values.PI, 50); assert.equal(values.LL, 45); assert.equal(values.PILL, 5);
  assert.equal(values.C2C7_SVA_MM, 12.5); assert.equal(values.GLOBAL_SVA_MM, 5);
  assert.equal(values['L2-S1'], null);
  const csv = table(toCsv([loaded])).rows[0];
  assert.equal(csv['PI'], '50'); assert.equal(csv['C2-C7 SVA (mm)'], '12.5');
  assert.equal(csv['C7-S1 SVA (mm)'], '5'); assert.equal(csv['LL L2-S1'], '');
  const post = { ...structuredClone(s), id: 'SP-9401', timepoint: 'Post-op', fileName: 'standing-post.png' };
  post.measurements.PI = 55; post.geometry.c2_centroid[0] -= 20; post.geometry.c7_centroid[0] -= 12;
  const paired = table(toPairedCsv(pairStudies([s, post]))).rows[0];
  assert.equal(paired['Delta PI Post-op'], '5');
  assert.equal(paired['Delta C2-C7 SVA (mm) Post-op'], '5');
  assert.equal(paired['Delta C7-S1 SVA (mm) Post-op'], '3');
  loaded.calibration = null;
  const unscaled = parameterValues(loaded);
  assert.equal(unscaled.C2C7_SVA_MM, null); assert.equal(unscaled.GLOBAL_SVA_MM, null);
  assert.equal(unscaled.C2C7_SVA_PX, 50); assert.equal(unscaled.GLOBAL_SVA_PX, 20);
});

test('combined standing result cannot retain a reported regional measurement without its landmarks', () => {
  for (const damage of [s => { delete s.geometry.vertebrae.C2; }, s => { delete s.geometry.vertebrae.L1; },
    s => { s.geometry.hip_midpoint = null; }, s => { s.geometry.femoral_circles = [[10, 20, -1]]; }]) {
    const s = combinedStudy(); damage(s);
    assert.equal(validate({ version: STORE_VERSION, studies: [s] })[0].measurements, null);
  }
  const s = combinedStudy();
  delete s.geometry.vertebrae.C2; s.geometry.c2_centroid = null;
  s.measurements.C2C7_COBB = s.measurements.C2C7_SVA_PX = s.measurements.C2C7_SVA_MM = null;
  const loaded = validate({ version: STORE_VERSION, studies: [s] })[0];
  assert.equal(loaded.measurements.PI, 50);
  assert.equal(parameterValues(loaded).C2C7_COBB, null);
});

test('standing cervical and lumbar landmarks and femoral heads remain editable with appropriate constructions', () => {
  const s = combinedStudy(), g = s.geometry;
  const stops = []; let selected = null;
  do { selected = nextSelection(selected, 1, g); stops.push(selected); } while (stops.length < 100
    && JSON.stringify(nextSelection(selected, 1, g)) !== JSON.stringify(stops[0]));
  for (const expected of [{ kind: 'landmark', level: 'C2', corner: 'CENTROID' },
    { kind: 'landmark', level: 'C7', corner: 'SA' }, { kind: 'landmark', level: 'C7', corner: 'CENTROID' },
    { kind: 'landmark', level: 'L1', corner: 'SA' }, { kind: 'femoral', side: 'left', part: 'center' }]) {
    assert.ok(stops.some(stop => JSON.stringify(stop) === JSON.stringify(expected)));
  }
  assert.match(constructionLabel(g, 'L1', s.measurements).text, /LL L1-S1/);
  assert.match(constructionLabel(g, 'PI', s.measurements).text, /PI 50/);
  assert.match(constructionLabel(g, 'C2C7_COBB', s.measurements).text, /C2–C7 Cobb/);
  assert.match(constructionLabel(g, 'C2C7_SVA', s.measurements).text, /C2–C7 SVA/);
  assert.match(constructionLabel(g, 'GLOBAL_SVA', s.measurements).text, /C7–S1 SVA/);
  const corner = g.vertebrae.C7.superior[0];
  setLandmarkAt(g, 'C7', 'SA', [corner[0] + 8, corner[1]]);
  assert.equal(g.c7_centroid[0], 162);
  setLandmarkAt(g, 'C7', 'CENTROID', [170, 280]);
  assert.deepEqual(g.c7_centroid, [170, 280], 'independent centroid correction is retained');
  setLandmarkAt(g, 'L1', 'SA', [138, 620]);
  assert.deepEqual(g.l1_center, [162, 632.5], 'L1PA uses the edited L1 body centroid');
});
