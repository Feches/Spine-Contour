import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMBEDDING_VERSION, validEmbedding, embeddingRecord, readEmbedding, isCurrent } from '../renderer/data/embeddings.js';

const MODEL = { id: 'vit_small_patch14_dinov2.lvd142m', dim: 3, input: [224, 224], onnx_sha256: 'abc' };
const EMBEDDING = { model: MODEL, lumbar: [0.6, 0.8, 0], cervical: null, whole: [1, 0, 0], region: 'lumbar' };
const V1 = { version: 1, id: 'SP-1', computedAt: 'x', sourceSha256: null, model: MODEL, filmType: 'lumbar', crop: [0, 1, 0], whole: null };

test('embeddingRecord writes version 2 from a backend record and keeps null vectors null', () => {
  const record = embeddingRecord('SP-1000', EMBEDDING, { sourceSha256: 'sha', computedAt: '2026-09-30T20:00:00.000Z' });
  assert.deepEqual(record, {
    version: 2, id: 'SP-1000', computedAt: '2026-09-30T20:00:00.000Z', sourceSha256: 'sha',
    model: MODEL, region: 'lumbar', lumbar: [0.6, 0.8, 0], cervical: null, whole: [1, 0, 0],
  });
  assert.equal(EMBEDDING_VERSION, 2);
  assert.notEqual(record.model, MODEL);
  assert.equal(embeddingRecord('SP-1', { ...EMBEDDING, region: 'cervical', lumbar: null, cervical: [1, 0, 0] }).region, 'cervical');
  assert.equal(embeddingRecord('SP-1', { ...EMBEDDING, region: 'thoracic' }).region, 'lumbar');
  // A cervical film whose detector found nothing carries only the whole film, and that is a record.
  assert.equal(embeddingRecord('SP-1', { ...EMBEDDING, lumbar: null, region: 'cervical' }).whole.length, 3);
  assert.equal(embeddingRecord('SP-1', { ...EMBEDDING, lumbar: null, whole: null }), null);
  assert.equal(embeddingRecord('SP-1', null), null);
  assert.equal(embeddingRecord('SP-1', { model: MODEL, lumbar: ['a'], whole: null, region: 'lumbar' }), null);
});

test('validEmbedding accepts version 1 and version 2 and rejects a broken record', () => {
  const good = embeddingRecord('SP-1000', EMBEDDING);
  assert.equal(validEmbedding(good), true);
  assert.equal(validEmbedding({ ...good, lumbar: null, cervical: null }), true);
  assert.equal(validEmbedding(V1), true);
  for (const bad of [null, 'x', { ...good, version: 3 }, { ...good, id: 7 }, { ...good, region: 'thoracic' },
    { ...good, lumbar: [] }, { ...good, whole: 'x' }, { ...good, model: {} }, { ...good, lumbar: null, cervical: null, whole: null },
    { ...V1, crop: [] }]) {
    assert.equal(validEmbedding(bad), false, JSON.stringify(bad));
  }
});

test('readEmbedding lifts a version-1 record to the version-2 fields and leaves its version alone', () => {
  assert.deepEqual(readEmbedding(V1), { version: 1, id: 'SP-1', computedAt: 'x', sourceSha256: null, model: MODEL,
    region: 'lumbar', lumbar: [0, 1, 0], cervical: null, whole: null });
  const v2 = embeddingRecord('SP-2', EMBEDDING);
  assert.equal(readEmbedding(v2), v2);
  assert.equal(readEmbedding({ ...V1, crop: 'x' }), null);
});

test('isCurrent needs version 2 and the bundled graph, and trusts the record when the graph is unknown', () => {
  const record = embeddingRecord('SP-1000', EMBEDDING);
  assert.equal(isCurrent(record, 'abc'), true);
  assert.equal(isCurrent(record, 'def'), false);
  assert.equal(isCurrent(record, null), true);
  assert.equal(isCurrent(readEmbedding(V1), 'abc'), false);
  assert.equal(isCurrent(null, 'abc'), false);
});
