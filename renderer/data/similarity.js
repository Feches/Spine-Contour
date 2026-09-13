/**
 * Pure ranking for the Find similar tab (similar-cases spec, 2026-09-12, section 7). No DOM.
 *
 * Five blocks per study: V, the 44 normalised coordinates of the 22 landmarks (mirror so anterior
 * points to +x, translate to the centroid, scale to unit centroid size, never rotate); H, the hip
 * midpoint under the same transform; A, the five sagittal angles with spec 10.5's weights; C and
 * W, the crop and whole-film appearance embeddings (cosine). Each block's distance is divided by
 * its median over the candidates, the mode picks the weights, and the fused distance is a
 * weighted root-mean-square. Shape is derived from the record's geometry every time and never
 * stored; the embeddings arrive as the records renderer/embeddings.js holds.
 */
import { HAND_ADDED, matchesLocation, subjectKey } from './parameters.js';

const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'];
const CORNERS = ['SA', 'SP', 'IA', 'IP'];
export const LANDMARK_ORDER = Object.freeze([
  ...LEVELS.flatMap((level) => CORNERS.map((corner) => `${level}.${corner}`)), 'S1.SA', 'S1.SP',
]);
export const ALIGNMENT_ORDER = Object.freeze(['PI', 'PT', 'SS', 'LL L1-S1', 'PI-LL']);
export const ALIGNMENT_WEIGHTS = Object.freeze([1, 0.8, 0.8, 0.6, 1]);
export const BLOCK_KEYS = Object.freeze(['V', 'H', 'A', 'C', 'W']);
export const MODES = Object.freeze({
  all: Object.freeze({ V: 1, H: 1, A: 1, C: 1, W: 1 }),
  shape: Object.freeze({ V: 1, H: 1, A: 0, C: 0, W: 0 }),
  alignment: Object.freeze({ V: 0, H: 0, A: 1, C: 0, W: 0 }),
  appearance: Object.freeze({ V: 0, H: 0, A: 0, C: 1, W: 1 }),
});
export const SCOPES = Object.freeze(['all', 'workspace']);

const DASH = '\u2014';
const SEP = ' \u00B7 ';
const MINUS = '\u2212';

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function point(p) {
  return Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]);
}

function mean(list) {
  return list.reduce((sum, v) => sum + v, 0) / list.length;
}

export function needsEmbedding(mode) {
  return mode === 'all' || mode === 'appearance';
}

// The 22 points in LANDMARK_ORDER, or null: every level and S1 must be present, the coverage full,
// no body unoriented (its anterior is a guess and the mirror step needs it) -- spec 7.1 step 1.
function landmarks(study) {
  const g = study?.geometry;
  if (!g || !g.vertebrae || typeof g.vertebrae !== 'object') return null;
  if (!Array.isArray(g.s1_superior) || !point(g.s1_superior[0]) || !point(g.s1_superior[1])) return null;
  const coverage = study.qc?.coverage;
  if (coverage?.partial === true) return null;
  if (Array.isArray(coverage?.unoriented) && coverage.unoriented.length > 0) return null;
  const points = [];
  for (const level of LEVELS) {
    const body = g.vertebrae[level];
    if (!body || body.anterior_confirmed === false) return null;
    if (!Array.isArray(body.superior) || !Array.isArray(body.inferior)) return null;
    const [sa, sp] = body.superior;
    const [ia, ip] = body.inferior;
    if (![sa, sp, ia, ip].every(point)) return null;
    points.push(sa, sp, ia, ip);
  }
  points.push(g.s1_superior[0], g.s1_superior[1]);
  return points;
}

// Index i of the 22 is anterior when it is an SA or IA corner (even position within its body) or
// S1.SA (index 20); SP, IP and S1.SP (index 21) are posterior.
function isAnterior(index) {
  return index === 20 || (index < 20 && index % 4 !== 1 && index % 4 !== 3);
}

// Mirror, translate, scale -- never rotate (spec 7.1 steps 2-5). { V, H } or null.
export function vector(study) {
  const points = landmarks(study);
  if (!points) return null;
  const anterior = [];
  const posterior = [];
  points.forEach(([x], index) => (isAnterior(index) ? anterior : posterior).push(x));
  const sign = mean(anterior) < mean(posterior) ? -1 : 1;
  const mirrored = points.map(([x, y]) => [sign * x, y]);
  const cx = mean(mirrored.map(([x]) => x));
  const cy = mean(mirrored.map(([, y]) => y));
  const centred = mirrored.map(([x, y]) => [x - cx, y - cy]);
  const size = Math.sqrt(centred.reduce((sum, [x, y]) => sum + x * x + y * y, 0));
  if (!(size > 0)) return null;
  const V = centred.flatMap(([x, y]) => [x / size, y / size]);
  const hip = study.geometry.hip_midpoint;
  const H = point(hip) ? [(sign * hip[0] - cx) / size, (hip[1] - cy) / size] : null;
  return { V, H };
}

// [PI, PT, SS, LL L1-S1, PI - LL] in degrees, or null with one of the four measured angles absent.
export function alignment(study) {
  const m = study?.measurements;
  if (!m || typeof m !== 'object') return null;
  const ll = m.LL?.['L1-S1'];
  if (![m.PI, m.PT, m.SS, ll].every(finite)) return null;
  return [m.PI, m.PT, m.SS, ll, m.PI - ll];
}

function unitList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(finite) ? value : null;
}

// The stored records keyed by id: renderer/embeddings.js's Map, or a plain object in tests.
function embeddingOf(embeddings, id) {
  if (!embeddings) return null;
  return embeddings instanceof Map ? (embeddings.get(id) ?? null) : (embeddings[id] ?? null);
}

// One study's five blocks, from its record and its stored embedding (or null).
export function blocks(study, embedding) {
  const shape = vector(study);
  const crop = unitList(embedding?.crop);
  return {
    V: shape ? shape.V : null,
    H: shape ? shape.H : null,
    A: alignment(study),
    C: crop,
    W: crop ? unitList(embedding?.whole) : null,
    filmType: embedding?.filmType ?? null,
    model: typeof embedding?.model?.onnx_sha256 === 'string' ? embedding.model.onnx_sha256 : null,
  };
}

function euclid(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function shapeDistance(a, b) {
  return euclid(a, b);
}

export function pelvicDistance(a, b) {
  return euclid(a, b);
}

export function alignmentDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < ALIGNMENT_WEIGHTS.length; i += 1) {
    const d = a[i] - b[i];
    sum += ALIGNMENT_WEIGHTS[i] * d * d;
  }
  return Math.sqrt(sum);
}

// 1 - cosine over unit vectors, floored at 0 for float noise.
export function appearanceDistance(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return Math.max(0, 1 - dot);
}

// Every block distance the pair shares under the mode's weights, or null per block (spec 7.4): H
// needs a hip on both, A the four angles on both, C and W the same model on both, W two whole-spine films.
export function pairDistances(open, candidate, mode) {
  const w = MODES[mode] ?? MODES.all;
  const sameModel = open.model !== null && open.model === candidate.model;
  const both = (key) => open[key] !== null && candidate[key] !== null;
  return {
    V: w.V && both('V') ? shapeDistance(open.V, candidate.V) : null,
    H: w.H && both('H') ? pelvicDistance(open.H, candidate.H) : null,
    A: w.A && both('A') ? alignmentDistance(open.A, candidate.A) : null,
    C: w.C && sameModel && both('C') ? appearanceDistance(open.C, candidate.C) : null,
    W: w.W && sameModel && both('W') && open.filmType === 'whole-spine' && candidate.filmType === 'whole-spine'
      ? appearanceDistance(open.W, candidate.W) : null,
  };
}

// The median of the present values when there are at least three and it is positive, else 1.
export function medianScale(values) {
  const present = (values ?? []).filter(finite);
  if (present.length < 3) return 1;
  const sorted = [...present].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return median > 0 ? median : 1;
}

// sqrt(sum w_i (d_i / m_i)^2 / sum w_i) over the present, weighted blocks; null with none. `weights`
// is a { V, H, A, C, W } table -- one of MODES today, a user's own sliders in a later stage -- so
// changing what counts is a table, never a code path.
export function fuse(distances, scales, weights) {
  const w = weights ?? MODES.all;
  let sum = 0;
  let weight = 0;
  const present = [];
  for (const key of BLOCK_KEYS) {
    const d = distances[key];
    if (!w[key] || !finite(d)) continue;
    const scaled = d / (finite(scales?.[key]) && scales[key] > 0 ? scales[key] : 1);
    sum += w[key] * scaled * scaled;
    weight += w[key];
    present.push(key);
  }
  if (weight === 0) return null;
  return { d: Math.sqrt(sum / weight), blocks: present };
}

export function matchScore(d) {
  return Math.max(0, Math.min(100, Math.round(100 * Math.exp(-d))));
}

function rootOf(study) {
  return typeof study.workspaceFolder === 'string' && study.workspaceFolder !== '' ? study.workspaceFolder : HAND_ADDED;
}

// Spec 7.5: real, not self, full coverage, in scope, not the same subject, and with an embedding
// when the mode needs one.
export function candidates(open, all, { scope = 'all', mode = 'all', embeddings = {} } = {}) {
  const openKey = subjectKey(open);
  const filters = { workspace: rootOf(open), folder: null };
  return (all ?? []).filter((c) => c && c.source === 'real' && c.id !== open.id
    && vector(c) !== null
    && (scope !== 'workspace' || matchesLocation(c, filters))
    && !(openKey !== null && subjectKey(c) === openKey)
    && (!needsEmbedding(mode) || unitList(embeddingOf(embeddings, c.id)?.crop) !== null));
}

// { matches: [{ study, d, match, blocks }], total, stale }. `stale` counts candidates whose stored
// embedding came from another graph than the open study's (spec 11): under all they rank on the
// other blocks, under appearance they have none and are dropped; either way the tab says so.
export function findSimilar(open, all, { scope = 'all', mode = 'all', embeddings = {}, n = 5 } = {}) {
  const openBlocks = blocks(open, embeddingOf(embeddings, open.id));
  const pool = candidates(open, all, { scope, mode, embeddings });
  const entries = pool.map((study) => {
    const b = blocks(study, embeddingOf(embeddings, study.id));
    return { study, b, distances: pairDistances(openBlocks, b, mode) };
  });
  const scales = {};
  for (const key of BLOCK_KEYS) scales[key] = medianScale(entries.map((e) => e.distances[key]));
  const ranked = [];
  let stale = 0;
  for (const entry of entries) {
    if (needsEmbedding(mode) && entry.b.model !== null && openBlocks.model !== null && entry.b.model !== openBlocks.model) stale += 1;
    const fused = fuse(entry.distances, scales, MODES[mode] ?? MODES.all);
    if (!fused) continue;
    ranked.push({ study: entry.study, d: fused.d, match: matchScore(fused.d), blocks: fused.blocks });
  }
  ranked.sort((a, b) => (a.d - b.d) || (a.study.id < b.study.id ? -1 : a.study.id > b.study.id ? 1 : 0));
  return { matches: ranked.slice(0, n), total: ranked.length, stale };
}

// Why the tab shows no cards for the open study, or null (spec 8.4).
export function openReason(open, mode, embeddings) {
  if (!open || open.measurements == null || open.geometry == null) return 'unsegmented';
  if (vector(open) === null) return 'partial';
  if (needsEmbedding(mode) && unitList(embeddingOf(embeddings, open.id)?.crop) === null) return 'no-embedding';
  if (mode === 'alignment' && alignment(open) === null) return 'no-alignment';
  return null;
}

function angleOf(study, key) {
  const m = study?.measurements;
  if (!m) return null;
  const value = key === 'LL' ? m.LL?.['L1-S1'] : m[key];
  return finite(value) ? value : null;
}

// The card's third line (spec 8.2): the candidate's angle minus the open study's, whole degrees with
// a sign, a dash where either side is absent. A difference between two films, never a delta.
export function angleLine(open, candidate) {
  return ['PI', 'LL', 'PT', 'SS'].map((key) => {
    const a = angleOf(open, key);
    const b = angleOf(candidate, key);
    if (a === null || b === null) return `${key} ${DASH}`;
    const diff = Math.round(b - a);
    const text = diff > 0 ? `+${diff}` : diff < 0 ? `${MINUS}${Math.abs(diff)}` : '0';
    return `${key} ${text}`;
  }).join(SEP);
}

// The real films sharing the study's subject key, in library order, or the study alone.
export function subjectFilms(study, all) {
  const key = subjectKey(study);
  if (key === null) return [study];
  return (all ?? []).filter((s) => s.source === 'real' && subjectKey(s) === key);
}
