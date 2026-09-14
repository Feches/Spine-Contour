/**
 * The loaded appearance embeddings (similar-cases spec, 2026-09-12, section 11): one Map of
 * embeddings/<id>.json records, read once when something first asks -- the Find similar tab, the
 * Find tab's Embed count, Export dataset -- never at bootstrap. Module scope beside batch.js and
 * processing.js, because it imports api.js and the store; the pure record shape is
 * data/embeddings.js. Every change bumps state.embeddingsVersion so subscribers repaint; the map
 * itself never enters the store.
 */
import { setState } from './store.js';
import { loadEmbeddings, saveEmbedding, embeddingModel } from './api.js';
import { validEmbedding, isCurrent } from './data/embeddings.js';
import { vector } from './data/similarity.js';

const records = new Map();
let loading = null;
let model = null;

// setState after an await, never inside a subscriber (store.js forbids re-entrant updates).
function bump() {
  setState((s) => ({ embeddingsVersion: (s.embeddingsVersion ?? 0) + 1 }));
}

export function ensureEmbeddings() {
  if (loading) return loading;
  loading = (async () => {
    let loaded = [];
    try {
      loaded = await loadEmbeddings();
    } catch (error) {
      console.warn('Could not load the saved embeddings:', error.message);
    }
    for (const record of loaded) {
      if (validEmbedding(record)) records.set(record.id, record);
      else console.warn(`embeddings: a stored record was skipped (${record?.id ?? 'unknown id'})`);
    }
    try {
      model = await embeddingModel();
    } catch (error) {
      model = null;
      console.warn('Could not read the bundled embedding model:', error.message);
    }
    bump();
  })();
  return loading;
}

export function embeddingFor(id) {
  return records.get(id) ?? null;
}

// Read-only for callers; every write goes through storeEmbedding and forgetEmbedding.
export function embeddingsMap() {
  return records;
}

export function bundledModelSha() {
  return typeof model?.onnx_sha256 === 'string' ? model.onnx_sha256 : null;
}

// The full record the backend returned ({id, dim, input, onnx_sha256}), for the export's
// manifest and vectors file (spec section 13) -- not just the sha bundledModelSha gives callers
// that only need to compare against a stored record.
export function bundledModel() {
  return model && typeof model === 'object' && typeof model.onnx_sha256 === 'string' ? { ...model } : null;
}

export async function storeEmbedding(record) {
  await saveEmbedding(record.id, record);
  records.set(record.id, record);
  bump();
}

// On delete, with every other id-keyed cache: the next film can reuse the id.
export function forgetEmbedding(id) {
  if (records.delete(id)) bump();
}

// The Embed button's rule (spec section 12): a real, fully covered, segmented study without a
// current record -- segmented before this build, with the setting off, after a failed stage, or
// under an older graph.
export function needsEmbedding(study) {
  if (!study || study.source !== 'real' || study.measurements == null || study.geometry == null) return false;
  if (vector(study) === null) return false;
  return !isCurrent(records.get(study.id), bundledModelSha());
}
