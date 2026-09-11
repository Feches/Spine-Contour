import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageConfidence, scorePercent } from '../renderer/data/confidence.js';
function complete() {
  return {
    source: 'real', geometry: { vertebrae: Object.fromEntries(['L1', 'L2', 'L3', 'L4', 'L5'].map(l => [l, {}])),
      s1_superior: [[10, 10], [20, 20]], femoral_circles: [[10, 30, 5], [20, 30, 5]] },
    measurements: { PI: 50, PT: 10, SS: 40, LL: {} },
    qc: { coverage: { partial: false }, femoral: { confidence: .9, qc_pass: true },
      framing: { s1_confidence: .9, searched: true, search_confidence: .85 } },
    calibration: { version: 1, source_sha256: 'a'.repeat(64), width: 100, height: 100,
      coordinate_space: 'original_image', status: 'dicom', candidates: [], selected_index: null,
      spacing: { row_mm: .5, column_mm: .5, source: 'dicom_pixel_spacing' } },
  };
}
test('overall assessment separates model scores and never presents an invented overall percentage', () => {
  const assessment = imageConfidence(complete());
  assert.equal(assessment.label, 'Checks passed');
  assert.match(assessment.details.join(' '), /not a probability/);
  assert.match(assessment.details.join(' '), /no calibrated confidence score/);
  assert.match(assessment.details.join(' '), /femoral fit score: 90%/);
});
test('each weak quality signal independently requires review despite a strong femoral fit', () => {
  for (const change of [
    s => { s.qc.framing.s1_confidence = .3; },
    s => { s.qc.framing.search_confidence = .3; },
    s => { s.qc.femoral.confidence = .4; },
    s => { s.measurements.PI = 90; },
    s => { delete s.geometry.vertebrae.L3; },
    s => { s.geometry.femoral_circles.pop(); },
    s => { s.calibration = null; },
    s => { s.geometry.vertebrae.L1.anterior_confirmed = false; },
  ]) {
    const s = complete(); change(s);
    assert.equal(imageConfidence(s).label, 'Review recommended');
  }
});
test('edited circles retain original scores as provenance, not confidence in the correction', () => {
  const s = complete(); s.qc.manual_edits = { landmarks: true, femoral: true };
  s.qc.femoral = { confidence: null, qc_pass: false, reason: 'failed original fit' };
  const result = imageConfidence(s);
  assert.equal(result.label, 'Review recommended');
  assert.match(result.details.join(' '), /before circle edits/);
  assert.doesNotMatch(result.details.join(' '), /Femoral measurements unavailable/);
});
test('pending, unprocessed and legacy results do not claim a successful confidence check', () => {
  assert.equal(imageConfidence(complete(), true).label, 'Updating…');
  assert.equal(imageConfidence(null).label, '—');
  const s = complete(); s.qc = null;
  assert.equal(imageConfidence(s).label, 'Limited information');
  s.source = 'demo'; assert.equal(imageConfidence(s).label, '—');
});
test('confidence scores reject out of range or nonfinite values and preserve real zero', () => {
  for (const v of [null, undefined, -1, 1.1, Infinity, NaN, '0.9']) assert.equal(scorePercent(v), '—');
  assert.equal(scorePercent(0), '0%');
});
