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

// (2026-10-10, level editor) a study with a label record loses it with its sidecar; one without
// has nothing to remove. The tests above pass only deletePrediction and must keep working.
test('deletes the label record of every study that has one, after its sidecar, and only those', async () => {
  const calls = [];
  const result = await deleteStudyBatch(
    [{ id: 'SP-1000', source: 'real', labelFile: 'a.label.json' }, { id: 'SP-1001', source: 'real', labelFile: null }],
    {
      deletePrediction: async (id) => calls.push(['prediction', id]),
      deleteLabelRecord: async (name) => calls.push(['label', name]),
    },
  );
  assert.deepEqual(calls, [['prediction', 'SP-1000'], ['label', 'a.label.json'], ['prediction', 'SP-1001']]);
  assert.deepEqual(result.deleted, ['SP-1000', 'SP-1001']);
  assert.deepEqual(result.failed, []);
});

test('a study whose label record cannot be removed is failed, and an empty or absent labelFile calls nothing', async () => {
  const labels = [];
  const result = await deleteStudyBatch(
    [
      { id: 'SP-1000', source: 'real', labelFile: 'a.label.json' },
      { id: 'SP-1001', source: 'real', labelFile: 'b.label.json' },
      { id: 'SP-1002', source: 'real', labelFile: '' },
      { id: 'SP-1003', source: 'real' },
      { id: 'SP-0030', source: 'demo', labelFile: 'demo.label.json' },
    ],
    {
      deletePrediction: async () => {},
      deleteLabelRecord: async (name) => { labels.push(name); if (name === 'a.label.json') throw new Error('File locked'); },
    },
  );
  assert.deepEqual(labels, ['a.label.json', 'b.label.json']);
  assert.deepEqual(result.deleted, ['SP-1001', 'SP-1002', 'SP-1003']);
  assert.deepEqual(result.failed, [{ id: 'SP-1000', message: 'File locked' }]);
});

test('a study whose sidecar cannot be deleted keeps its label record', async () => {
  const labels = [];
  const result = await deleteStudyBatch(
    [{ id: 'SP-1000', source: 'real', labelFile: 'a.label.json' }],
    {
      deletePrediction: async () => { throw new Error('File locked'); },
      deleteLabelRecord: async (name) => { labels.push(name); },
    },
  );
  assert.deepEqual(labels, []);
  assert.deepEqual(result.failed, [{ id: 'SP-1000', message: 'File locked' }]);
});
