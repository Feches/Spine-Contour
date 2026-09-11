import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, STORE_VERSION, createStudySaver } from '../renderer/data/persistence.js';
import { sagittalRows, piResidual, isConsistent } from '../renderer/data/measurements.js';
import { deriveStatus, reviewReasons } from '../renderer/data/status.js';
import { discRows } from '../renderer/data/disc-heights.js';
import { toCsv, toPairedCsv, parse } from '../renderer/data/csv.js';
import { planBatch } from '../renderer/data/batch.js';
import { landmarkAt, nearestLandmark } from '../renderer/viewer/geometry.js';
import { nextSelection, nudge, vertebraAt } from '../renderer/viewer/interactions.js';
import { drawDynamicLayer, constructionLabel } from '../renderer/viewer/canvas.js';
import { createMeasureQueue } from '../renderer/viewer/measure-queue.js';

const levels = ['L1', 'L2', 'L3', 'L4', 'L5'];
const anatomy = [...levels, 'S1', 'femoral heads'];
function study(names = ['L1']) {
  const vertebrae = Object.fromEntries(levels.filter(level => names.includes(level)).map(level => {
    const y = 30 + levels.indexOf(level) * 40;
    return [level, { superior: [[40, y], [140, y]], inferior: [[40, y + 20], [140, y + 20]],
      quadrilateral: [[40, y], [140, y], [140, y + 20], [40, y + 20]] }];
  }));
  const sacrum = names.includes('S1'), hips = names.includes('femoral heads');
  return {
    id: 'SP-9901', source: 'real', fileName: 'partial.png', filePath: '/test/partial.png',
    addedAt: '2026-09-09T00:00:00Z', view: 'Standing lateral', clinical: {},
    geometry: { vertebrae, s1_superior: sacrum ? [[40, 230], [140, 230]] : null,
      l1_center: vertebrae.L1 ? [90, 40] : null, hip_midpoint: hips ? [90, 290] : null,
      femoral_circles: hips ? [[60, 290, 20], [120, 290, 20]] : [] },
    measurements: { SS: sacrum ? 0 : null, PI: sacrum && hips ? 0 : null, PT: sacrum && hips ? 0 : null,
      L1PA: sacrum && hips && vertebrae.L1 ? 0 : null,
      LL: Object.fromEntries(levels.map(level => [`${level}-S1`, sacrum && vertebrae[level] ? 0 : null])) },
    qc: { coverage: { partial: names.length < 7, available: names, missing: anatomy.filter(name => !names.includes(name)) } },
    calibration: { version: 1, source_sha256: 'a'.repeat(64), width: 400, height: 400,
      coordinate_space: 'original_image', status: 'dicom', candidates: [], selected_index: null,
      spacing: { row_mm: .5, column_mm: .5, source: 'dicom_pixel_spacing' } },
  };
}

const reload = entry => validate({ version: STORE_VERSION, studies: JSON.parse(JSON.stringify([entry])) })[0];
const csvRow = text => parse(text.split('\r\n').slice(3).join('\r\n')).rows[0];

test('all 127 nonempty anatomy subsets survive JSON save/reload with nulls intact', () => {
  for (let mask = 1; mask < 128; mask++) {
    const original = study(anatomy.filter((_, i) => mask & (1 << i)));
    const saved = reload(original);
    assert.deepEqual(saved.geometry, original.geometry, mask);
    assert.deepEqual(saved.measurements, original.measurements, mask);
    assert.equal(deriveStatus(saved), mask === 127 ? 'seg' : 'rev');
  }
});

test('an L1-only result has no invented zero angles, mismatch or consistency warning', () => {
  const partial = study();
  assert.ok(sagittalRows(partial.measurements).every(row => row.absent && row.value === null));
  assert.equal(piResidual(partial.measurements), null);
  assert.equal(isConsistent(partial.measurements), true);
  assert.match(reviewReasons(partial).join(' '), /Partial segmentation.*L2.*S1.*femoral heads/);
  assert.ok(!reviewReasons(partial).some(reason => reason.includes('inconsistent')));
  assert.ok(discRows(partial).every(row => row.anterior === null && row.middle === null && row.posterior === null));
});

test('PI-LL is absent when either operand is null, including a present zero PI', () => {
  for (const names of [['S1', 'femoral heads'], ['L1', 'S1']]) {
    const partial = study(names);
    assert.equal(sagittalRows(partial.measurements).find(row => row.key === 'PILL').value, null);
    assert.equal(csvRow(toCsv([partial]))['PI-LL Mismatch'], '');
  }
});

test('available zero angles survive and only an adjacent pair yields disc heights', () => {
  const partial = study(['L2', 'L3', 'S1']);
  const rows = discRows(partial);
  assert.deepEqual([rows[1].anterior, rows[1].middle, rows[1].posterior], [10, 10, 10]);
  assert.ok(rows.filter((_, i) => i !== 1).every(row => row.middle === null));
  const exported = csvRow(toCsv([partial]));
  assert.equal(exported.SS, '0');
  assert.equal(exported['LL L2-S1'], '0');
  assert.equal(exported['LL L1-S1'], '');
  assert.equal(exported.PI, '');
  assert.equal(exported['Disc height L2-L3 middle (mm)'], '10');
});

test('unknown anterior orientation permits midpoint distance but withholds A/P values in both exports', () => {
  const pre = study(['L1', 'L2']);
  pre.geometry.vertebrae.L1.anterior_confirmed = false;
  pre.geometry.vertebrae.L2.anterior_confirmed = false;
  const saved = reload(pre);
  assert.deepEqual([discRows(saved)[0].anterior, discRows(saved)[0].middle, discRows(saved)[0].posterior], [null, 10, null]);
  const later = structuredClone(saved);
  later.id = 'SP-9902';
  later.calibration.spacing.row_mm = 1;
  const row = csvRow(toPairedCsv({ visits: ['Post-op'], subjects: [{ subject: 'test',
    films: new Map([['Pre-op', saved], ['Post-op', later]]) }] }));
  assert.equal(row['Disc height L1-L2 anterior (mm) Pre-op'], '');
  assert.equal(row['Delta Disc height L1-L2 anterior (mm) Post-op'], '');
  assert.equal(row['Delta Disc height L1-L2 middle (mm) Post-op'], '10');
  assert.equal(row['Delta PI Post-op'], '');
});

test('unrelated adjacent levels do not bridge a missing vertebra in a disc export', () => {
  assert.ok(discRows(study(['L2', 'L4'])).every(row => row.middle === null));
});

test('partial persistence still rejects corrupt points and values without required landmarks', t => {
  t.mock.method(console, 'warn', () => {});
  const corrupted = study();
  corrupted.geometry.vertebrae.L1.inferior[0] = ['bad', 0];
  assert.equal(reload(corrupted).geometry, null);
  const unsupported = study();
  unsupported.measurements.PI = 0;
  assert.equal(reload(unsupported).measurements, null);
});

test('an L1-only completed study stays out of the unsegmented batch queue', () => {
  const partial = reload(study());
  const next = { ...study(), id: 'SP-9902', measurements: null, geometry: null, qc: null };
  const plan = planBatch({ visible: [partial, next], selected: [], running: null });
  assert.deepEqual(plan.ids, ['SP-9902']);
});

test('picking, tabbing and nudging only visit present anatomy', () => {
  const g = study().geometry;
  const canvas = { width: 400, height: 400, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }) };
  assert.equal(landmarkAt(g, 'S1', 'SA'), null);
  assert.equal(landmarkAt(g, 'L2', 'SA'), null);
  assert.equal(nearestLandmark(g, 40, 30, canvas).level, 'L1');
  assert.equal(nearestLandmark(g, 300, 300, canvas), null);
  assert.equal(vertebraAt(g, [80, 40]), 'L1');
  assert.equal(vertebraAt(g, [80, 80]), null);
  let selected = null;
  const corners = [];
  for (let i = 0; i < 5; i++) { selected = nextSelection(selected, 1, g); corners.push(selected.corner); }
  assert.deepEqual(corners, ['SA', 'SP', 'IA', 'IP', 'SA']);
  assert.equal(nextSelection(null, -1, g).corner, 'IP');
  nudge(g, selected, 2, 3);
  assert.deepEqual(g.vertebrae.L1.superior[0], [42, 33]);
  nudge(g, { kind: 'landmark', level: 'L2', corner: 'SA' }, 1, 1);
  assert.equal(g.vertebrae.L2, undefined);
});

test('canvas draws every partial subset and selection without missing handles or nonfinite coordinates', () => {
  for (let mask = 1; mask < 128; mask++) {
    const partial = study(anatomy.filter((_, i) => mask & (1 << i)));
    const ctx = new Proxy({}, { get: (target, key) => key in target ? target[key]
      : key === 'measureText' ? () => ({ width: 10 })
        : (...args) => { assert.ok(args.filter(v => typeof v === 'number').every(Number.isFinite), `${mask} ${key}`); },
    set: (target, key, value) => { target[key] = value; return true; } });
    for (const selectedLevel of [...levels, 'S1', 'PI', 'PT', 'SS', 'L1PA', null]) {
      drawDynamicLayer(ctx, { width: 400, height: 400 }, partial.geometry,
        { selectedLevel, measurements: partial.measurements, editing: true });
    }
  }
  assert.equal(constructionLabel(study().geometry, 'L1', study().measurements), null);
  assert.match(constructionLabel(study(['S1']).geometry, 'SS', study(['S1']).measurements).text, /SS 0.0/);
});

test('a corrected partial result commits atomically and survives the actual study saver', async () => {
  const original = study();
  let state = { studies: [original], measurementDrafts: {} }, persisted;
  const saver = createStudySaver({ save: async data => { persisted = JSON.parse(JSON.stringify(data)); }, onError: assert.fail });
  let finish, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const queue = createMeasureQueue({ getState: () => state,
    setState: patch => { state = { ...state, ...patch(state) }; saver.notify(state); }, showToast: assert.fail,
    measure: geometry => { assert.equal(geometry.s1_superior, null); started(); return new Promise(resolve => { finish = resolve; }); },
    debounceMs: 1 });
  saver.notify(state); await saver.flush();
  const corrected = structuredClone(original.geometry);
  nudge(corrected, { kind: 'landmark', level: 'L1', corner: 'SA' }, 2, 3);
  queue.commitGeometry(original.id, corrected);
  await waiting;
  assert.deepEqual(reload(persisted[0]).geometry, original.geometry);
  finish({ geometry: corrected, measurements: original.measurements, qc: original.qc });
  await new Promise(resolve => setTimeout(resolve, 0));
  await saver.flush();
  assert.deepEqual(reload(persisted[0]).geometry, corrected);
  assert.deepEqual(reload(persisted[0]).qc.coverage, original.qc.coverage);
  assert.deepEqual(state.measurementDrafts, {});
});

test('one edited head survives save/load and CSV without pelvic angles or lost disc heights', () => {
  const original = study(anatomy);
  const edited = structuredClone(original);
  edited.geometry.femoral_circles.splice(0, 1);
  edited.geometry.hip_midpoint = null;
  Object.assign(edited.measurements, { PI: null, PT: null, L1PA: null });
  edited.qc.manual_edits = { landmarks: true, femoral: true };
  const saved = reload(edited);
  assert.deepEqual(saved.geometry, edited.geometry);
  assert.deepEqual(discRows(saved), discRows(original));
  const row = csvRow(toCsv([saved]));
  for (const [key, value] of Object.entries(row)) {
    if (/^(PI|PT|L1PA|PI-LL) /.test(key)) assert.equal(value, '');
  }
  assert.equal(saved.qc.manual_edits.femoral, true);
  assert.equal(deriveStatus(saved), 'rev');
});

test('explicitly clearing the last remaining head persists a measured empty correction', () => {
  const cleared = study([]);
  cleared.geometry.manually_cleared = true;
  const saved = reload(cleared);
  assert.deepEqual(saved.geometry, cleared.geometry);
  assert.ok(sagittalRows(saved.measurements).every(row => row.absent));
});
