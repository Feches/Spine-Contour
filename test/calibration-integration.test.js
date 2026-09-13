import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalibration, calibrationSummary } from '../renderer/data/calibration.js';
import { rememberCalibration, attachCalibrations, calibrationForStudy } from '../renderer/calibration.js';
import { getState, setState } from '../renderer/store.js';
import { validate } from '../renderer/data/persistence.js';
import { toCsv, toPairedCsv } from '../renderer/data/csv.js';
import { pairStudies } from '../renderer/data/pairing.js';

function result(scale = .5, status = 'detected') {
  return { version: 1, source_sha256: 'a'.repeat(64), width: 200, height: 200,
    coordinate_space: 'original_image', status, selected_index: 0,
    spacing: { row_mm: scale, column_mm: scale, source: status === 'corrected' ? 'manual_reference' : 'printed_ruler' },
    candidates: [{ endpoints: [[100, 50], [100, 130]], length_px: 80, value_mm: scale * 80,
      raw_text: `${scale * 80} mm*`, flag: '*', status: 'accepted' }], image_png: 'large preview' };
}
function study(id = 'SP-1000', filePath = '/films/a.png') {
  return { id, source: 'real', filePath, fileName: 'a.png', addedAt: '2026-09-09', view: 'lateral' };
}

test('calibration survives study persistence independently of segmentation and strips previews', () => {
  const saved = validate({ version: 1, studies: [{ ...study(), calibration: result() }] })[0];
  assert.equal(saved.measurements, null);
  assert.equal(saved.calibration.spacing.row_mm, .5);
  assert.equal(saved.calibration.image_png, undefined);
  assert.match(calibrationSummary(saved.calibration), /40 mm\* reference/);
  assert.equal(validate({ version: 1, studies: [study()] })[0].calibration, null);
});

test('invalid scales, stale dimensions, malformed endpoints and selections are dropped', () => {
  for (const change of [{ source_sha256: '' }, { width: 10 }, { candidates: [null] }, { selected_index: 9 },
    { spacing: { row_mm: 50, column_mm: .5 } }, { status: 'conflicting' }]) {
    assert.equal(normalizeCalibration({ ...result(), ...change }), null);
  }
});

test('folder results attach to new studies; corrections update the matching saved film only', () => {
  setState({ studies: [study(), { ...study('SP-1001', '/films/b.png'), geometry: {}, calibration: result() }] });
  rememberCalibration('/films/a.png', result());
  rememberCalibration('/films/new.png', result(.25));
  assert.equal(getState().studies[0].calibration.spacing.row_mm, .5);
  assert.equal(attachCalibrations([study('SP-1002', '/films/new.png')])[0].calibration.spacing.row_mm, .25);
  rememberCalibration('/films/a.png', result(.6, 'corrected'));
  assert.equal(calibrationForStudy(getState().studies[0]).spacing.row_mm, .6);
  rememberCalibration('/films/b.png', { ...result(.9), source_sha256: 'b'.repeat(64) });
  assert.equal(getState().studies[1].calibration.spacing.row_mm, .5, 'changed source must not recalibrate existing geometry');
});

test('CSV exports each film scale, preserves printed asterisk and leaves unknown lengths blank', () => {
  const a = { ...study(), calibration: result() };
  const b = { ...study('SP-1001'), calibration: { ...result(), status: 'not_found', spacing: null, selected_index: null, candidates: [] } };
  const csv = toCsv([a, b]);
  const rows = csv.split('\r\n').filter(line => !line.startsWith('#') && line);
  const header = rows[0].split(',');
  const index = header.indexOf('Pixel spacing X (mm/px)');
  assert.equal(rows[1].split(',')[index], '0.5');
  assert.equal(rows[2].split(',')[index], '');
  assert.equal(rows[1].split(',').at(-1), '40 mm*');
  const paired = toPairedCsv(pairStudies([{ ...a, subjectId: 'P1', timepoint: 'Pre-op' }, { ...b, subjectId: 'P1', timepoint: 'Post-op' }]));
  assert.match(paired, /Pixel spacing X \(mm\/px\) Pre-op/);
  assert.match(paired, /Calibration status Post-op/);
  assert.doesNotMatch(paired, /Delta Pixel spacing/);
});

test('a correction made during prediction wins only for the identical image', async () => {
  const { preferReviewedCalibration } = await import('../renderer/data/calibration.js');
  const fresh = result();
  const reviewed = result(.6, 'corrected');
  assert.equal(preferReviewedCalibration(fresh, reviewed).spacing.row_mm, .6);
  assert.equal(preferReviewedCalibration(fresh, { ...reviewed, source_sha256: 'b'.repeat(64) }).spacing.row_mm, .5);
  const cleared = { ...reviewed, status: 'cleared', spacing: null, selected_index: null };
  assert.equal(preferReviewedCalibration(fresh, cleared).spacing, null);
});

test('Windows folder and picker path spellings update the same saved image', () => {
  const original = { ...study('SP-9200', 'C:\\Films\\Patient\\LAT.PNG'), calibration: result() };
  setState({ studies: [original, study('SP-9201', 'C:\\Other\\LAT.PNG')] });
  rememberCalibration('c:/films/patient/lat.png', result(.25, 'corrected'));
  assert.equal(getState().studies[0].calibration.spacing.row_mm, .25);
  assert.equal(calibrationForStudy(original).spacing.row_mm, .25);
  assert.equal(getState().studies[1].calibration, undefined);
});

test('newer durable reference beats an older reviewed session cache', async () => {
  const { preferReviewedCalibration } = await import('../renderer/data/calibration.js');
  const newer = { ...result(.25, 'corrected'), review_revision: 2 };
  const older = { ...result(.5, 'corrected'), review_revision: 1 };
  assert.equal(preferReviewedCalibration(newer, older).spacing.row_mm, .25);
  assert.equal(preferReviewedCalibration(older, newer).spacing.row_mm, .25);
  const cleared = { ...newer, status: 'cleared', spacing: null, selected_index: null };
  assert.equal(preferReviewedCalibration(cleared, older).status, 'cleared');
  assert.equal(preferReviewedCalibration(older, cleared).status, 'cleared');
});

test('case-sensitive POSIX paths do not transfer references to a different image', () => {
  setState({ studies: [study('SP-9202', '/films/LAT.png'), study('SP-9203', '/films/lat.png')] });
  rememberCalibration('/films/lat.png', result(.25, 'corrected'));
  assert.equal(getState().studies[0].calibration, undefined);
  assert.equal(getState().studies[1].calibration.spacing.row_mm, .25);
});
