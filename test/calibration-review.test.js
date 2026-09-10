import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withCalibration } from '../renderer/calibration.js';

// Compact records, not full backend responses: withCalibration compares whatever it is given, and
// rememberCalibration / attachCalibrations normalise before they reach it.
const A = { version: 1, status: 'unavailable', width: 10, height: 20, candidates: [], selected_index: null };
const B = { ...A, status: 'cleared' };
const MARK = '2026-09-10T12:00:00.000Z';

test('withCalibration returns the SAME record when the scale is unchanged, key order included', () => {
  const study = { id: 'SP-1000', calibration: A, reviewedAt: MARK };
  assert.equal(withCalibration(study, { ...A }), study);
  assert.equal(withCalibration(study, { selected_index: null, candidates: [], height: 20, width: 10, status: 'unavailable', version: 1 }), study);
  const none = { id: 'SP-1001', calibration: null, reviewedAt: MARK };
  assert.equal(withCalibration(none, null), none);
});

test('withCalibration replaces the scale and clears the review mark when it changed (studies-table spec 8.4)', () => {
  const study = { id: 'SP-1000', calibration: A, reviewedAt: MARK };
  const next = withCalibration(study, B);
  assert.notEqual(next, study);
  assert.deepEqual(next.calibration, B);
  assert.equal(next.reviewedAt, null);
  assert.equal(study.reviewedAt, MARK, 'the record is replaced, never mutated');
  const first = withCalibration({ id: 'SP-1001', calibration: null, reviewedAt: null }, A);
  assert.deepEqual(first.calibration, A);
  assert.equal(first.reviewedAt, null);
});
