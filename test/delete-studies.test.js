import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteStudyBatch } from '../renderer/data/delete-studies.js';
import { merge } from '../renderer/data/persistence.js';

const studies = [
  { id: 'SP-1000', source: 'real', filePath: '/original/image.png' },
  { id: 'SP-1001', source: 'real', filePath: '/original/other.png' },
  { id: 'SP-0030', source: 'demo' },
];
test('deletes prediction ids only and hides demos permanently', async () => {
  const calls = [];
  const result = await deleteStudyBatch(studies, {
    deletePrediction: async id => calls.push(id), hideDemos: async () => calls.push('hide demos'),
  });
  assert.deepEqual(calls, ['hide demos', 'SP-1000', 'SP-1001']);
  assert.deepEqual(new Set(result.deleted), new Set(studies.map(s => s.id)));
  assert.deepEqual(result.failed, []);
  assert.deepEqual(merge([], { hideDemos: true }), []);
});
test('locked saved results stay in the library while other deletions succeed', async () => {
  const result = await deleteStudyBatch(studies, {
    deletePrediction: async id => { if (id === 'SP-1000') throw new Error('File locked'); },
    hideDemos: async () => {},
  });
  assert.deepEqual(result.deleted, ['SP-0030', 'SP-1001']);
  assert.deepEqual(result.failed, [{ id: 'SP-1000', message: 'File locked' }]);
});
test('failed preference writes do not pretend demo removal was saved', async () => {
  const result = await deleteStudyBatch(studies, {
    deletePrediction: async () => {}, hideDemos: async () => { throw new Error('Read only'); },
  });
  assert.deepEqual(result.deleted, ['SP-1000', 'SP-1001']);
  assert.equal(result.failed[0].id, 'SP-0030');
});
