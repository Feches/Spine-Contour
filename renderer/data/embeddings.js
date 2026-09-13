/**
 * The stored appearance-embedding record (similar-cases spec, 2026-09-12, section 11): one file per
 * real study under embeddings/<id>.json, written when a run or an Embed completes. Pure: the map
 * that holds them and its IPC live in renderer/embeddings.js. Shape vectors are never stored --
 * data/similarity.js derives them from the record's geometry every time.
 */
export const EMBEDDING_VERSION = 1;

const FILM_TYPES = new Set(['whole-spine', 'lumbar']);

function finiteList(value) {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'number' && Number.isFinite(v));
}

export function validEmbedding(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  if (record.version !== EMBEDDING_VERSION || typeof record.id !== 'string') return false;
  if (!record.model || typeof record.model !== 'object' || typeof record.model.onnx_sha256 !== 'string') return false;
  if (!finiteList(record.crop)) return false;
  if (record.whole !== null && !finiteList(record.whole)) return false;
  return record.filmType === null || FILM_TYPES.has(record.filmType);
}

// From the `embedding` a /predict or /embed response carries. Null when the backend computed none.
export function embeddingRecord(id, embedding, { sourceSha256 = null, computedAt = new Date().toISOString() } = {}) {
  if (!embedding || typeof embedding !== 'object' || !finiteList(embedding.crop)) return null;
  return {
    version: EMBEDDING_VERSION,
    id,
    computedAt,
    sourceSha256,
    model: { ...(embedding.model ?? {}) },
    filmType: FILM_TYPES.has(embedding.film_type) ? embedding.film_type : null,
    crop: embedding.crop,
    whole: finiteList(embedding.whole) ? embedding.whole : null,
  };
}

// A record is current when it came from the bundled graph. An unknown bundled graph (the backend
// not ready, or no graph installed) keeps what is stored: nothing is counted stale on a guess.
export function isCurrent(record, bundledSha) {
  if (!record) return false;
  return bundledSha == null || record.model?.onnx_sha256 === bundledSha;
}
