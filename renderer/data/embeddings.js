/**
 * The stored appearance-embedding record (similar-cases spec 2026-09-30, section 9): one file per
 * real study under embeddings/<id>.json. Version 2 carries three vectors chosen by region -- the
 * lumbar crop, the cervical crop and the whole film -- any of them null. A version-1 record (one
 * crop, a film-type proxy) is still read, lifted to the same field set, and reads as not current,
 * so Embed recomputes it once. Pure: the map lives in renderer/embeddings.js.
 */
export const EMBEDDING_VERSION = 2;

const REGIONS = new Set(['lumbar', 'cervical', 'full_spine']);
const VECTORS = ['lumbar', 'cervical', 'whole'];

function finiteList(value) {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'number' && Number.isFinite(v));
}

function vectorOrNull(value) {
  return finiteList(value) ? value : null;
}

function baseValid(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  if (typeof record.id !== 'string') return false;
  return Boolean(record.model && typeof record.model === 'object' && typeof record.model.onnx_sha256 === 'string');
}

export function validEmbedding(record) {
  if (!baseValid(record)) return false;
  if (record.version === 1) return finiteList(record.crop) && (record.whole === null || finiteList(record.whole));
  if (record.version !== EMBEDDING_VERSION || !REGIONS.has(record.region)) return false;
  for (const key of VECTORS) if (record[key] !== null && !finiteList(record[key])) return false;
  return VECTORS.some((key) => record[key] !== null);
}

// From the `embedding` a /predict or /embed response carries. Null when the backend computed none.
export function embeddingRecord(id, embedding, { sourceSha256 = null, computedAt = new Date().toISOString() } = {}) {
  if (!embedding || typeof embedding !== 'object') return null;
  const vectors = Object.fromEntries(VECTORS.map((key) => [key, vectorOrNull(embedding[key])]));
  if (VECTORS.every((key) => vectors[key] === null)) return null;
  return {
    version: EMBEDDING_VERSION,
    id,
    computedAt,
    sourceSha256,
    model: { ...(embedding.model ?? {}) },
    region: REGIONS.has(embedding.region) ? embedding.region : 'lumbar',
    ...vectors,
  };
}

// What the map holds: a valid version-2 record as is, a version-1 record lifted to the same fields
// (its crop was the lumbar window; it never had a cervical vector; every stage-1 film was lumbar).
export function readEmbedding(record) {
  if (!validEmbedding(record)) return null;
  if (record.version === EMBEDDING_VERSION) return record;
  return {
    version: 1, id: record.id, computedAt: record.computedAt, sourceSha256: record.sourceSha256 ?? null,
    model: record.model, region: 'lumbar', lumbar: record.crop, cervical: null, whole: record.whole ?? null,
  };
}

// A record is current when it is the current version and came from the bundled graph. An unknown
// bundled graph (the backend not ready, or no graph installed) keeps what is stored.
export function isCurrent(record, bundledSha) {
  if (!record || record.version !== EMBEDDING_VERSION) return false;
  return bundledSha == null || record.model?.onnx_sha256 === bundledSha;
}
