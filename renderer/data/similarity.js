/**
 * Pure ranking for the Find similar tab (similar-cases spec 2026-09-30, sections 6 and 7; stage 1's
 * section 7.4 fusion unchanged). Thirteen blocks in four families, read by data/similarity-blocks.js:
 * shape blocks compare over the landmarks both films share (mirror, centre, scale over the shared
 * points -- never rotate); entry blocks are a weighted RMS over the entries both films have; the
 * appearance blocks are cosine distances over unit vectors from the same encoder. Each block's
 * distance is divided by its median over the candidates; the region and the mode pick the weight
 * table (equal family budgets); the fused distance is a weighted root-mean-square. No DOM.
 */
import { HAND_ADDED, matchesLocation, subjectKey } from './parameters.js';
import { cervicalMeasurements } from './cervical.js';
import {
  REGIONS, BLOCKS, BLOCK_KEYS, ENTRY_KEYS, LANDMARK_ORDER, CERVICAL_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS,
  blockOf, weightsFor, lumbarPoints, cervicalPoints, alignment, studyBlocks, hasRegion, defaultRegion,
} from './similarity-blocks.js';

export { REGIONS, BLOCKS, BLOCK_KEYS, LANDMARK_ORDER, CERVICAL_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS, weightsFor, hasRegion, defaultRegion, alignment, studyBlocks };
export const MODES = Object.freeze(['all', 'shape', 'alignment', 'appearance']);
export const SCOPES = Object.freeze(['all', 'workspace']);
export const LUMBAR_SHAPE = Object.freeze({ order: LANDMARK_ORDER, floor: 14, require: Object.freeze(['S1.SA', 'S1.SP']) });
export const CERVICAL_SHAPE = Object.freeze({ order: CERVICAL_ORDER, floor: 14, require: Object.freeze([]) });

const DASH = '\u2014';
const SEP = ' \u00B7 ';
const MINUS = '\u2212';

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function mean(list) {
  return list.reduce((sum, v) => sum + v, 0) / list.length;
}

function euclid(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function needsEmbedding(mode) {
  return mode === 'all' || mode === 'appearance';
}

// Mirror by `sign`, translate the centroid to the origin, scale the centroid size to one (spec 7.1).
function normalise(points, sign) {
  const mirrored = points.map(([x, y]) => [sign * x, y]);
  const cx = mean(mirrored.map(([x]) => x));
  const cy = mean(mirrored.map(([, y]) => y));
  const centred = mirrored.map(([x, y]) => [x - cx, y - cy]);
  const size = Math.sqrt(centred.reduce((sum, [x, y]) => sum + x * x + y * y, 0));
  if (!(size > 0)) return null;
  return { list: centred.flatMap(([x, y]) => [x / size, y / size]), sign, cx, cy, size };
}

// The lumbar mirror: anterior corners (SA, IA) must sit at +x. Decided over the points given.
function lumbarSign(names, points) {
  const anterior = [];
  const posterior = [];
  names.forEach((name, i) => (name.endsWith('.SA') || name.endsWith('.IA') ? anterior : posterior).push(points[i][0]));
  return mean(anterior) < mean(posterior) ? -1 : 1;
}

export function sideSign(side) {
  return side === 'left' ? -1 : 1;
}

// The shape distance over the points both films have (spec decision 6): the names in `shape.order`
// present in both maps, each film normalised over those points alone; null below the floor or
// without a required point. `signA`/`signB` fix the mirror (the cervical side); null = the lumbar test.
export function shapePair(a, b, shape, signA, signB) {
  const names = shape.order.filter((name) => a.has(name) && b.has(name));
  if (names.length < shape.floor || !shape.require.every((name) => names.includes(name))) return null;
  const pa = names.map((name) => a.get(name));
  const pb = names.map((name) => b.get(name));
  const ta = normalise(pa, signA ?? lumbarSign(names, pa));
  const tb = normalise(pb, signB ?? lumbarSign(names, pb));
  if (!ta || !tb) return null;
  return { d: euclid(ta.list, tb.list), a: ta, b: tb };
}

export function hipUnder(hip, transform) {
  return [(transform.sign * hip[0] - transform.cx) / transform.size, (hip[1] - transform.cy) / transform.size];
}

// The complete lumbar shape for the export (stage 1's vector): null unless every level and S1 are present.
export function vector(study) {
  const points = lumbarPoints(study);
  if (points.size !== LANDMARK_ORDER.length) return null;
  const list = LANDMARK_ORDER.map((name) => points.get(name));
  const t = normalise(list, lumbarSign(LANDMARK_ORDER, list));
  if (!t) return null;
  const hip = study.geometry.hip_midpoint;
  return { V: t.list, H: Array.isArray(hip) && finite(hip[0]) && finite(hip[1]) ? hipUnder(hip, t) : null };
}

export function cervicalVector(study) {
  const points = cervicalPoints(study);
  if (points.size !== CERVICAL_ORDER.length) return null;
  const t = normalise(CERVICAL_ORDER.map((name) => points.get(name)), sideSign(study.geometry.anterior_side));
  return t ? { V: t.list } : null;
}

// Weighted RMS over the indices finite on both sides; null below `floor` shared entries.
export function entryDistance(a, b, weights, floor) {
  let sum = 0;
  let weight = 0;
  let shared = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (!finite(a[i]) || !finite(b[i])) continue;
    const w = weights ? weights[i] : 1;
    const d = a[i] - b[i];
    sum += w * d * d;
    weight += w;
    shared += 1;
  }
  if (shared < floor || weight <= 0) return null;
  return Math.sqrt(sum / weight);
}

// 1 - cosine over unit vectors, floored at 0 for float noise.
export function appearanceDistance(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return Math.max(0, 1 - dot);
}

// Every switched-on block's distance for the pair, or null where the pair lacks it (spec section 6's
// last column). `open` and `candidate` are studyBlocks() results.
export function pairDistances(open, candidate, weights) {
  const on = (key) => weights[key] > 0;
  const d = {};
  for (const key of BLOCK_KEYS) d[key] = null;
  const lumbar = on('V') || on('H') ? shapePair(open.lumbar, candidate.lumbar, LUMBAR_SHAPE, null, null) : null;
  if (on('V') && lumbar) d.V = lumbar.d;
  if (on('H') && lumbar && open.hip && candidate.hip) d.H = euclid(hipUnder(open.hip, lumbar.a), hipUnder(candidate.hip, lumbar.b));
  if (on('VC') && open.side && candidate.side) {
    const cervical = shapePair(open.cervical, candidate.cervical, CERVICAL_SHAPE, sideSign(open.side), sideSign(candidate.side));
    if (cervical) d.VC = cervical.d;
  }
  for (const key of ENTRY_KEYS) {
    if (!on(key)) continue;
    const block = blockOf(key);
    d[key] = entryDistance(open.entries[key], candidate.entries[key], block.weights ?? null, block.floor);
  }
  const sameModel = open.model !== null && open.model === candidate.model;
  const both = (key) => sameModel && open.vectors[key] !== null && candidate.vectors[key] !== null;
  if (on('C') && both('C')) d.C = appearanceDistance(open.vectors.C, candidate.vectors.C);
  if (on('CC') && both('CC')) d.CC = appearanceDistance(open.vectors.CC, candidate.vectors.CC);
  if (on('W') && both('W') && open.region === 'full_spine' && candidate.region === 'full_spine') d.W = appearanceDistance(open.vectors.W, candidate.vectors.W);
  return d;
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

// sqrt(sum w_i (d_i / m_i)^2 / sum w_i) over the present, weighted blocks; null with none.
export function fuse(distances, scales, weights) {
  let sum = 0;
  let weight = 0;
  const present = [];
  for (const key of BLOCK_KEYS) {
    const d = distances[key];
    if (!(weights[key] > 0) || !finite(d)) continue;
    const scaled = d / (finite(scales?.[key]) && scales[key] > 0 ? scales[key] : 1);
    sum += weights[key] * scaled * scaled;
    weight += weights[key];
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

// The stored records keyed by id: renderer/embeddings.js's Map, or a plain object in tests.
function embeddingOf(embeddings, id) {
  if (!embeddings) return null;
  return embeddings instanceof Map ? (embeddings.get(id) ?? null) : (embeddings[id] ?? null);
}

// Spec 7.5: real, not self, segmented, with the region's anatomy, in scope, not the same subject, and
// with an embedding record when the mode needs one. Coverage flags are never read.
export function candidates(open, all, { scope = 'all', region = 'lumbar', mode = 'all', embeddings = {} } = {}) {
  const openKey = subjectKey(open);
  const filters = { workspace: rootOf(open), folder: null };
  return (all ?? []).filter((c) => c && c.source === 'real' && c.id !== open.id
    && hasRegion(c, region)
    && (scope !== 'workspace' || matchesLocation(c, filters))
    && !(openKey !== null && subjectKey(c) === openKey)
    && (!needsEmbedding(mode) || embeddingOf(embeddings, c.id) !== null));
}

// { matches: [{ study, d, match, blocks, absent }], total, stale, region, weights }. `absent` lists the
// switched-on blocks the pair lacked, for the card; `stale` counts candidates whose record came from
// another graph than the open study's (stage 1 section 11).
export function findSimilar(open, all, { scope = 'all', region = null, mode = 'all', embeddings = {}, n = 10 } = {}) {
  const r = REGIONS.includes(region) ? region : defaultRegion(open);
  const weights = weightsFor(r, mode);
  const on = BLOCK_KEYS.filter((key) => weights[key] > 0);
  const openBlocks = studyBlocks(open, embeddingOf(embeddings, open.id));
  const pool = candidates(open, all, { scope, region: r, mode, embeddings });
  const entries = pool.map((study) => {
    const b = studyBlocks(study, embeddingOf(embeddings, study.id));
    return { study, b, distances: pairDistances(openBlocks, b, weights) };
  });
  const scales = {};
  for (const key of BLOCK_KEYS) scales[key] = medianScale(entries.map((e) => e.distances[key]));
  const ranked = [];
  let stale = 0;
  for (const entry of entries) {
    if (needsEmbedding(mode) && entry.b.model !== null && openBlocks.model !== null && entry.b.model !== openBlocks.model) stale += 1;
    const fused = fuse(entry.distances, scales, weights);
    if (!fused) continue;
    ranked.push({ study: entry.study, d: fused.d, match: matchScore(fused.d), blocks: fused.blocks,
      absent: on.filter((key) => !fused.blocks.includes(key)) });
  }
  ranked.sort((a, b) => (a.d - b.d) || (a.study.id < b.study.id ? -1 : a.study.id > b.study.id ? 1 : 0));
  return { matches: ranked.slice(0, n), total: ranked.length, stale, region: r, weights };
}

// Why the tab shows no cards for the open study, or null (spec section 10).
export function openReason(open, region, mode, embeddings) {
  if (!open || open.measurements == null || open.geometry == null) return 'unsegmented';
  if (!hasRegion(open, region)) return 'no-region';
  if (needsEmbedding(mode) && embeddingOf(embeddings, open.id) === null) return 'no-embedding';
  if (mode === 'alignment') {
    const b = studyBlocks(open, null);
    const keys = BLOCKS.filter((block) => block.kind === 'alignment' && block.regions.includes(region)).map((block) => block.key);
    if (!keys.some((key) => b.entries[key].some(finite))) return 'no-alignment';
  }
  return null;
}

function signed(diff) {
  const rounded = Math.round(diff);
  return rounded > 0 ? `+${rounded}` : rounded < 0 ? `${MINUS}${Math.abs(rounded)}` : '0';
}

function lumbarAngle(study, key) {
  const m = study?.measurements;
  if (!m) return null;
  const value = key === 'LL' ? m.LL?.['L1-S1'] : m[key];
  return finite(value) ? value : null;
}

// The card's third line: the candidate's value minus the open study's, whole units with a sign, a
// dash where either side is absent. Lumbar and whole spine: PI, LL, PT, SS in degrees. Cervical:
// C2-C7 Cobb in degrees and C2-C7 SVA in millimetres (a dash when either film is uncalibrated).
export function angleLine(open, candidate, region = 'lumbar') {
  if (region === 'cervical') {
    const a = cervicalMeasurements(open);
    const b = cervicalMeasurements(candidate);
    const pair = (label, x, y) => `${label} ${finite(x) && finite(y) ? signed(y - x) : DASH}`;
    return [pair('Cobb', a.C2C7_COBB, b.C2C7_COBB), pair('SVA', a.C2C7_SVA_MM, b.C2C7_SVA_MM)].join(SEP);
  }
  return ['PI', 'LL', 'PT', 'SS'].map((key) => {
    const a = lumbarAngle(open, key);
    const b = lumbarAngle(candidate, key);
    return `${key} ${a === null || b === null ? DASH : signed(b - a)}`;
  }).join(SEP);
}

// The real films sharing the study's subject key, in library order, or the study alone.
export function subjectFilms(study, all) {
  const key = subjectKey(study);
  if (key === null) return [study];
  return (all ?? []).filter((s) => s.source === 'real' && subjectKey(s) === key);
}
