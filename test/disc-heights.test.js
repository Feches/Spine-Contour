import test from 'node:test';
import assert from 'node:assert/strict';
import { discRows } from '../renderer/data/disc-heights.js';
import { toCsv, toPairedCsv, parse } from '../renderer/data/csv.js';

function calibratedStudy(scale = .5) {
  const vertebrae = {};
  for (let i = 1; i <= 5; i++) {
    vertebrae[`L${i}`] = { superior: [[300, 100 * i], [100, 100 * i]],
      inferior: [[300, 100 * i + 50], [100, 100 * i + 60]] };
  }
  return { id: 'SP-1000', source: 'real', view: 'Standing lateral', clinical: {},
    geometry: { vertebrae, s1_superior: [[300, 625], [100, 610]] },
    calibration: { version: 1, source_sha256: 'a'.repeat(64), width: 1000, height: 1000,
      coordinate_space: 'original_image', status: 'dicom', candidates: [], selected_index: null,
      spacing: { row_mm: scale, column_mm: scale, source: 'dicom_pixel_spacing' } } };
}
const values = row => [row.anterior, row.middle, row.posterior];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const csvData = csv => parse(csv.split('\r\n').slice(3).join('\r\n'));

test('all five disc levels use the facing endplates, including S1, in anatomical A/M/P order', () => {
  const rows = discRows(calibratedStudy());
  assert.deepEqual(rows.map(r => r.key), ['L1-L2', 'L2-L3', 'L3-L4', 'L4-L5', 'L5-S1']);
  for (const row of rows.slice(0, 4)) assert.deepEqual(values(row), [25, 22.5, 20]);
  assert.deepEqual(values(rows[4]), [37.5, 31.25, 25]);
});

test('middle height connects the two endplate midpoints rather than averaging endpoint distances', () => {
  const study = calibratedStudy();
  study.geometry.vertebrae.L1.inferior = [[100, 100], [300, 100]];
  study.geometry.vertebrae.L2.superior = [[160, 180], [240, 180]];
  assert.deepEqual(values(discRows(study)[0]), [50, 40, 50]);
});

test('oblique distances use separate DICOM column (x) and row (y) spacing', () => {
  const study = calibratedStudy();
  study.calibration.spacing.column_mm = 2;
  study.geometry.vertebrae.L1.inferior = [[200, 200], [100, 200]];
  study.geometry.vertebrae.L2.superior = [[230, 240], [160, 280]];
  const row = discRows(study)[0];
  near(row.anterior, Math.sqrt(60 ** 2 + 20 ** 2));
  near(row.middle, Math.sqrt(90 ** 2 + 30 ** 2));
  near(row.posterior, Math.sqrt(120 ** 2 + 40 ** 2));
});

test('horizontal mirroring preserves anatomical labels and heights', () => {
  const study = calibratedStudy();
  const original = discRows(study);
  for (const v of Object.values(study.geometry.vertebrae)) {
    for (const endplate of [v.superior, v.inferior]) for (const p of endplate) p[0] = 999 - p[0];
  }
  for (const p of study.geometry.s1_superior) p[0] = 999 - p[0];
  assert.deepEqual(discRows(study), original);
});

test('current geometry and calibration drive heights without a stale cache or input mutation', () => {
  const study = calibratedStudy();
  const original = structuredClone(study);
  discRows(study);
  assert.deepEqual(study, original);
  const corrected = structuredClone(study);
  corrected.geometry.vertebrae.L2.superior[0][1] += 20;
  assert.deepEqual(values(discRows(corrected)[0]), [35, 27.5, 20]);
  corrected.calibration.spacing.row_mm = 1;
  corrected.calibration.spacing.column_mm = 1;
  assert.deepEqual(values(discRows(corrected)[0]), [70, 55, 40]);
  assert.deepEqual(discRows(JSON.parse(JSON.stringify(corrected))), discRows(corrected));
});

test('automatic and manually corrected ruler scales both produce physical heights', () => {
  const study = calibratedStudy();
  study.calibration.candidates = [{ endpoints: [[100, 50], [100, 130]], length_px: 80,
    value_mm: 40, raw_text: '40 mm', status: 'accepted' }];
  study.calibration.selected_index = 0;
  for (const [status, source] of [['detected', 'printed_ruler'], ['corrected', 'manual_reference']]) {
    study.calibration.status = status;
    study.calibration.spacing.source = source;
    assert.deepEqual(values(discRows(study)[0]), [25, 22.5, 20]);
  }
});

test('missing, ambiguous, conflicting, cleared and malformed scales never fall back to pixels or zero', () => {
  const study = calibratedStudy();
  const invalid = [null, {}, { ...study.calibration, source_sha256: 'bad' },
    { ...study.calibration, spacing: { row_mm: 0, column_mm: 1, source: 'dicom_pixel_spacing' } },
    ...['not_found', 'ambiguous', 'conflicting', 'unavailable', 'cleared'].map(status =>
      ({ ...study.calibration, status, spacing: null }))];
  for (const calibration of invalid) for (const row of discRows({ ...study, calibration })) {
    assert.deepEqual(values(row), [null, null, null]);
  }
});

test('missing, malformed, degenerate or out-of-image endplates blank only the affected level', () => {
  for (const bad of [undefined, null, 'bad', Array(2), [null, null], [[1], [2]], [[1, 2, 3], [4, 5]],
    [[100, 100], [100, 100]], [[NaN, 100], [200, 100]], [[Infinity, 100], [200, 100]],
    [[-1, 100], [200, 100]], [[1000, 100], [200, 100]], [[100, 1000], [200, 100]]]) {
    const study = calibratedStudy();
    study.geometry.vertebrae.L2.superior = bad;
    const rows = discRows(study);
    assert.deepEqual(values(rows[0]), [null, null, null]);
    assert.deepEqual(values(rows[1]), [25, 22.5, 20]);
  }
  const missingS1 = calibratedStudy();
  delete missingS1.geometry.s1_superior;
  assert.deepEqual(values(discRows(missingS1)[4]), [null, null, null]);
  assert.ok(discRows({ ...missingS1, geometry: null }).every(row => values(row).every(v => v === null)));
});

test('a measured zero gap is retained', () => {
  const study = calibratedStudy();
  study.geometry.vertebrae.L2.superior = structuredClone(study.geometry.vertebrae.L1.inferior);
  assert.deepEqual(values(discRows(study)[0]), [0, 0, 0]);
});

test('CSV has 15 explicit millimetre columns, calculated values and empty uncalibrated cells', () => {
  const study = calibratedStudy();
  const uncalibrated = { ...study, id: 'SP-1001', calibration: null };
  const { headers, rows } = csvData(toCsv([study, uncalibrated]));
  const columns = headers.filter(h => h.startsWith('Disc height '));
  assert.equal(columns.length, 15);
  assert.equal(rows[0]['Disc height L1-L2 anterior (mm)'], '25');
  assert.equal(rows[0]['Disc height L1-L2 middle (mm)'], '22.5');
  assert.equal(rows[0]['Disc height L1-L2 posterior (mm)'], '20');
  assert.equal(rows[0]['Disc height L5-S1 middle (mm)'], '31.3');
  for (const column of columns) assert.equal(rows[1][column], '');
  assert.equal(rows[0]['Pixel spacing X (mm/px)'], '0.5');
  assert.equal(csvData(toCsv([uncalibrated])).headers.filter(h => h.startsWith('Disc height ')).length, 15);
});

test('paired CSV uses each visit\'s own scale and deltas of the written heights; missing visits stay blank', () => {
  const pre = calibratedStudy(.5), post = calibratedStudy(.6);
  post.id = 'SP-1001';
  const pairing = { visits: ['Post-op', '1 yr'], subjects: [{ subject: 'S1',
    films: new Map([['Pre-op', pre], ['Post-op', post]]) }] };
  const { rows, headers } = csvData(toPairedCsv(pairing));
  assert.equal(headers.filter(h => /^(Delta )?Disc height /.test(h)).length, 75);
  const row = rows[0];
  assert.equal(row['Disc height L5-S1 middle (mm) Pre-op'], '31.3');
  assert.equal(row['Disc height L5-S1 middle (mm) Post-op'], '37.5');
  assert.equal(row['Delta Disc height L5-S1 middle (mm) Post-op'], '6.2');
  assert.equal(row['Disc height L1-L2 anterior (mm) 1 yr'], '');
  assert.equal(row['Delta Disc height L1-L2 anterior (mm) 1 yr'], '');
  post.calibration = null;
  const missing = csvData(toPairedCsv(pairing)).rows[0];
  assert.equal(missing['Disc height L1-L2 anterior (mm) Post-op'], '');
  assert.equal(missing['Delta Disc height L1-L2 anterior (mm) Post-op'], '');
  assert.equal(missing['Disc height L1-L2 anterior (mm) Pre-op'], '25');
});
