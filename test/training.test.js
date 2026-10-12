import test from 'node:test';
import assert from 'node:assert/strict';
import { trainingReason, trainingSnapshot, trainingProgress } from '../renderer/data/training.js';

const study = (id = 'SP-1000') => ({ id, source: 'real', subjectId: id, filePath: '/source.png', reviewedAt: '2026-10-12',
  geometry: { source_sha256: 'abc', coordinate_space: 'original_image', vertebrae: Object.fromEntries(
    ['L1','L2','L3','L4','L5'].map(k => [k, { superior: [[1,1],[2,1]], inferior: [[1,2],[2,2]] }])) }, qc: { framing: { window: [0,0,100,100] } } });

test('training requires reviewed, source-bound, subject-identified real studies', () => {
  assert.equal(trainingReason(study(), 'lumbar_landmarks'), null);
  for (const change of [{ source: 'demo' }, { reviewedAt: null }, { subjectId: '' }, { processingError: 'failed' }, { geometry: {} }])
    assert.ok(trainingReason({ ...study(), ...change }, 'lumbar_landmarks'));
  assert.ok(trainingReason(study(), 'lumbar_landmarks', { 'SP-1000': {} }));
  assert.ok(trainingReason(study(), 'cervical_landmarks'));
});
test('polygon targets require every lumbar body instead of labelling missing bodies as background', () => {
  const s = study(); delete s.geometry.vertebrae.L4;
  assert.equal(trainingReason(s, 'lumbar_landmarks'), null);
  assert.ok(trainingReason(s, 'lumbar_segmentation'));
});
test('training snapshots isolate annotations and reject too few subjects', () => {
  const rows = Array.from({length:5}, (_,i) => study(`SP-${1000+i}`));
  const ids = new Set(rows.map(r => r.id));
  const copy = trainingSnapshot(rows, ids, 'lumbar_segmentation');
  rows[0].geometry.vertebrae.L4.superior[0][0] = 99;
  assert.equal(copy[0].geometry.vertebrae.L4.superior[0][0], 1);
  rows[1].subjectId = rows[0].subjectId;
  assert.throws(() => trainingSnapshot(rows, ids, 'lumbar_landmarks'), /five distinct/);
});
test('ETA is explicitly an estimate and only shown during training', () => {
  assert.match(trainingProgress({stage:'training', elapsed_seconds:70, remaining_seconds:120}), /1m 10s elapsed.*2m remaining \(estimate\)/);
  assert.doesNotMatch(trainingProgress({stage:'testing', elapsed_seconds:70, remaining_seconds:120}), /remaining/);
});
