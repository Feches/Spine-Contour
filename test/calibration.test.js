import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrationMath as math } from '../renderer/data/calibration.js';

test('reference scale follows Euclidean length, including tilted rulers', () => {
  const spacing = math.reference([[10, 20], [40, 60]], 25);
  assert.equal(spacing.row_mm, .5);
  assert.equal(math.distance([[100, 200], [130, 240]], spacing), 25);
});
test('DICOM row and column spacing are applied to the correct axes', () => {
  assert.equal(math.distance([[0, 0], [3, 4]], { column_mm: 2, row_mm: 1 }), Math.hypot(6, 4));
});
test('invalid and coincident references cannot calibrate an image', () => {
  for (const value of [0, -1, NaN, Infinity]) assert.equal(math.reference([[0, 0], [10, 0]], value), null);
  assert.equal(math.reference([[0, 0], [0, 0]], 5), null);
  assert.equal(math.reference([[0, 0]], 5), null);
  assert.equal(math.distance([[0, 0], [2, 2]], { column_mm: NaN, row_mm: 1 }), null);
});
