import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMBEDDING_VERSION, validEmbedding, embeddingRecord, isCurrent } from '../renderer/data/embeddings.js';

const MODEL = { id: 'vit_small_patch14_dinov2.lvd142m', dim: 3, input: [224, 224], onnx_sha256: 'abc' };
const EMBEDDING = { model: MODEL, crop: [0.6, 0.8, 0], whole: [1, 0, 0], film_type: 'whole-spine' };

test('embeddingRecord builds the stored shape from a /predict embedding and keeps null blocks null', () => {
  const record = embeddingRecord('SP-1000', EMBEDDING, { sourceSha256: 'sha', computedAt: '2026-09-12T20:00:00.000Z' });
  assert.deepEqual(record, {
    version: EMBEDDING_VERSION, id: 'SP-1000', computedAt: '2026-09-12T20:00:00.000Z', sourceSha256: 'sha',
    model: MODEL, filmType: 'whole-spine', crop: [0.6, 0.8, 0], whole: [1, 0, 0],
  });
  assert.notEqual(record.model, MODEL);
  assert.equal(embeddingRecord('SP-1000', { ...EMBEDDING, whole: null, film_type: null }).whole, null);
  assert.equal(embeddingRecord('SP-1000', { ...EMBEDDING, whole: null, film_type: null }).filmType, null);
  assert.equal(embeddingRecord('SP-1000', null), null);
  assert.equal(embeddingRecord('SP-1000', { model: MODEL, crop: [] }), null);
  assert.equal(typeof embeddingRecord('SP-1000', EMBEDDING).computedAt, 'string');
});

test('validEmbedding accepts the stored shape and rejects a broken one', () => {
  const good = embeddingRecord('SP-1000', EMBEDDING);
  assert.equal(validEmbedding(good), true);
  assert.equal(validEmbedding({ ...good, whole: null }), true);
  assert.equal(validEmbedding({ ...good, filmType: 'lumbar' }), true);
  for (const bad of [null, 'x', { ...good, version: 2 }, { ...good, id: 7 }, { ...good, crop: [] }, { ...good, crop: ['a'] },
    { ...good, model: {} }, { ...good, whole: 'x' }, { ...good, filmType: 'thoracic' }]) {
    assert.equal(validEmbedding(bad), false, JSON.stringify(bad));
  }
});

test('isCurrent compares the record to the bundled graph and trusts the record when the graph is unknown', () => {
  const record = embeddingRecord('SP-1000', EMBEDDING);
  assert.equal(isCurrent(record, 'abc'), true);
  assert.equal(isCurrent(record, 'def'), false);
  assert.equal(isCurrent(record, null), true);
  assert.equal(isCurrent(null, 'abc'), false);
  assert.equal(isCurrent(null, null), false);
});
