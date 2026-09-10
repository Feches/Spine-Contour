import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteStudyBatch } from '../renderer/data/delete-studies.js';

const studies = [
  { id: 'SP-1000', source: 'real', filePath: '/original/image.png' },
  { id: 'SP-1001', source: 'real', filePath: '/original/other.png' },
  { id: 'SP-0030', source: 'demo' },
];

test('deletes the prediction sidecars of the real studies only, in order, and never touches a demo', async () => {
  const calls = [];
  const result = await deleteStudyBatch(studies, { deletePrediction: async (id) => calls.push(id) });
  assert.deepEqual(calls, ['SP-1000', 'SP-1001']);
  assert.deepEqual(result.deleted, ['SP-1000', 'SP-1001']);
  assert.deepEqual(result.failed, []);
});

test('locked saved results stay in the library while other deletions succeed', async () => {
  const result = await deleteStudyBatch(studies, {
    deletePrediction: async (id) => { if (id === 'SP-1000') throw new Error('File locked'); },
  });
  assert.deepEqual(result.deleted, ['SP-1001']);
  assert.deepEqual(result.failed, [{ id: 'SP-1000', message: 'File locked' }]);
});

test('an empty or demo-only target list deletes nothing and calls nothing', async () => {
  const calls = [];
  assert.deepEqual(await deleteStudyBatch([studies[2]], { deletePrediction: async (id) => calls.push(id) }), { deleted: [], failed: [] });
  assert.deepEqual(await deleteStudyBatch([], { deletePrediction: async (id) => calls.push(id) }), { deleted: [], failed: [] });
  assert.deepEqual(calls, []);
});

test('the demo branch is gone: no hideDemos is called even when offered', async () => {
  let hidden = false;
  const result = await deleteStudyBatch(studies, { deletePrediction: async () => {}, hideDemos: async () => { hidden = true; } });
  assert.equal(hidden, false);
  assert.deepEqual(result.deleted, ['SP-1000', 'SP-1001']);
});
