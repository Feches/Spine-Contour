/**
 * The similar-cases block registry and readers (spec 2026-09-30, sections 6 and 7): thirteen blocks in
 * four families, each with the regions and the kind that switch it on, and the pure readers that turn
 * a study record (plus its stored embedding) into the points, entry arrays and vectors the ranking
 * compares. No distances here: renderer/data/similarity.js owns those. No DOM.
 */
import { segmentalColumns, segmentalValues } from './segmental.js';
import { discRows, DISC_LEVEL_PAIRS, DISC_POSITIONS } from './disc-heights.js';
import { cervicalMeasurements, studyRegion, validAnteriorSide } from './cervical.js';
import { globalSvaMeasurements } from './global-sva.js';

export const REGIONS = Object.freeze(['lumbar', 'cervical', 'full_spine']);
export const FAMILIES = Object.freeze(['lumbar', 'cervical', 'whole', 'appearance']);
export const KINDS = Object.freeze(['shape', 'alignment', 'appearance']);

const LUMBAR_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'];
const CERVICAL_LEVELS = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
const CORNERS = ['SA', 'SP', 'IA', 'IP'];
export const LANDMARK_ORDER = Object.freeze([
  ...LUMBAR_LEVELS.flatMap((level) => CORNERS.map((corner) => `${level}.${corner}`)), 'S1.SA', 'S1.SP',
]);
export const CERVICAL_ORDER = Object.freeze([
  'C2.IA', 'C2.IP', ...CERVICAL_LEVELS.slice(1).flatMap((level) => CORNERS.map((corner) => `${level}.${corner}`)),
]);
export const ALIGNMENT_ORDER = Object.freeze(['PI', 'PT', 'SS', 'LL L1-S1', 'PI-LL', 'L1PA']);
export const ALIGNMENT_WEIGHTS = Object.freeze([1, 0.8, 0.8, 0.6, 1, 0.8]);
export const LUMBAR_SEGMENTAL_ORDER = Object.freeze(segmentalColumns('lumbar').map((column) => column.key));
export const CERVICAL_SEGMENTAL_ORDER = Object.freeze(segmentalColumns('cervical').map((column) => column.key));
export const DISC_ORDER = Object.freeze(DISC_LEVEL_PAIRS.flatMap(([upper, lower]) => DISC_POSITIONS.map((position) => `${upper}-${lower} ${position}`)));

const LUMBAR_REGIONS = Object.freeze(['lumbar', 'full_spine']);
const CERVICAL_REGIONS = Object.freeze(['cervical', 'full_spine']);
const FULL_SPINE = Object.freeze(['full_spine']);

// `label` is the card's absent marker (spec section 10). `floor` is the least shared entries an entry
// block needs; `weights` an entry block's per-entry weights (else 1 each).
export const BLOCKS = Object.freeze([
  { key: 'V', family: 'lumbar', kind: 'shape', regions: LUMBAR_REGIONS, label: 'no shape' },
  { key: 'H', family: 'lumbar', kind: 'shape', regions: LUMBAR_REGIONS, label: 'no hip' },
  { key: 'A', family: 'lumbar', kind: 'alignment', regions: LUMBAR_REGIONS, label: 'no alignment', weights: ALIGNMENT_WEIGHTS, floor: 2 },
  { key: 'SL', family: 'lumbar', kind: 'alignment', regions: LUMBAR_REGIONS, label: 'no segmental', floor: 3 },
  { key: 'D', family: 'lumbar', kind: 'shape', regions: LUMBAR_REGIONS, label: 'no disc heights', floor: 2 },
  { key: 'VC', family: 'cervical', kind: 'shape', regions: CERVICAL_REGIONS, label: 'no cervical shape' },
  { key: 'AC', family: 'cervical', kind: 'alignment', regions: CERVICAL_REGIONS, label: 'no cervical lordosis', floor: 1 },
  { key: 'BC', family: 'cervical', kind: 'alignment', regions: CERVICAL_REGIONS, label: 'no cervical balance', floor: 1 },
  { key: 'SC', family: 'cervical', kind: 'alignment', regions: CERVICAL_REGIONS, label: 'no cervical segmental', floor: 3 },
  { key: 'B', family: 'whole', kind: 'alignment', regions: FULL_SPINE, label: 'no global balance', floor: 1 },
  { key: 'W', family: 'whole', kind: 'appearance', regions: FULL_SPINE, label: 'no whole film' },
  { key: 'C', family: 'appearance', kind: 'appearance', regions: LUMBAR_REGIONS, label: 'no lumbar crop' },
  { key: 'CC', family: 'appearance', kind: 'appearance', regions: CERVICAL_REGIONS, label: 'no cervical crop' },
].map((block) => Object.freeze({ ...block, regions: Object.freeze([...block.regions]) })));
export const BLOCK_KEYS = Object.freeze(BLOCKS.map((block) => block.key));
export const ENTRY_KEYS = Object.freeze(['A', 'SL', 'D', 'AC', 'BC', 'SC', 'B']);

const BY_KEY = new Map(BLOCKS.map((block) => [block.key, block]));
export function blockOf(key) {
  return BY_KEY.get(key) ?? null;
}

// Spec decision 7: a block is on when its family is on under the region and its kind under the mode;
// every family present has budget one, shared equally by its switched-on blocks. Computed, never typed.
export function weightsFor(region, mode) {
  const on = BLOCKS.filter((block) => block.regions.includes(region) && (mode === 'all' || block.kind === mode));
  const perFamily = new Map();
  for (const block of on) perFamily.set(block.family, (perFamily.get(block.family) ?? 0) + 1);
  const weights = {};
  for (const block of BLOCKS) weights[block.key] = on.includes(block) ? 1 / perFamily.get(block.family) : 0;
  return Object.freeze(weights);
}

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function point(p) {
  return Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]);
}

function plate(p) {
  return Array.isArray(p) && p.length === 2 && point(p[0]) && point(p[1]);
}

// The lumbar points present: a level enters only whole (both endplates, four finite corners) and
// oriented; S1 needs both points. No coverage flag is read (spec decision 5).
export function lumbarPoints(study) {
  const g = study?.geometry;
  const points = new Map();
  if (!g || !g.vertebrae || typeof g.vertebrae !== 'object') return points;
  for (const level of LUMBAR_LEVELS) {
    const body = g.vertebrae[level];
    if (!body || body.anterior_confirmed === false || !plate(body.superior) || !plate(body.inferior)) continue;
    points.set(`${level}.SA`, body.superior[0]);
    points.set(`${level}.SP`, body.superior[1]);
    points.set(`${level}.IA`, body.inferior[0]);
    points.set(`${level}.IP`, body.inferior[1]);
  }
  if (plate(g.s1_superior)) {
    points.set('S1.SA', g.s1_superior[0]);
    points.set('S1.SP', g.s1_superior[1]);
  }
  return points;
}

// The cervical points present: C2's inferior endplate, C3-C7 whole. Empty without a recorded anterior
// side, because the mirror step trusts the side, not the corners (spec decision 10).
export function cervicalPoints(study) {
  const g = study?.geometry;
  const points = new Map();
  if (!g || !g.vertebrae || typeof g.vertebrae !== 'object' || !validAnteriorSide(g.anterior_side)) return points;
  const c2 = g.vertebrae.C2;
  if (c2 && plate(c2.inferior)) {
    points.set('C2.IA', c2.inferior[0]);
    points.set('C2.IP', c2.inferior[1]);
  }
  for (const level of CERVICAL_LEVELS.slice(1)) {
    const body = g.vertebrae[level];
    if (!body || !plate(body.superior) || !plate(body.inferior)) continue;
    points.set(`${level}.SA`, body.superior[0]);
    points.set(`${level}.SP`, body.superior[1]);
    points.set(`${level}.IA`, body.inferior[0]);
    points.set(`${level}.IP`, body.inferior[1]);
  }
  return points;
}

const orNull = (v) => (finite(v) ? v : null);

export function alignment(study) {
  const m = study?.measurements && typeof study.measurements === 'object' ? study.measurements : {};
  const ll = orNull(m.LL?.['L1-S1']);
  const pi = orNull(m.PI);
  return [pi, orNull(m.PT), orNull(m.SS), ll, pi !== null && ll !== null ? pi - ll : null, orNull(m.L1PA)];
}

function segmental(study, order) {
  const values = study?.measurements ? segmentalValues(study) : {};
  return order.map((key) => orNull(values[key]));
}

export function lumbarSegmental(study) {
  return segmental(study, LUMBAR_SEGMENTAL_ORDER);
}

export function cervicalSegmental(study) {
  return segmental(study, CERVICAL_SEGMENTAL_ORDER);
}

export function discHeights(study) {
  const rows = study?.geometry ? discRows(study) : [];
  return DISC_LEVEL_PAIRS.flatMap(([upper, lower]) => {
    const row = rows.find((r) => r.key === `${upper}-${lower}`);
    return DISC_POSITIONS.map((position) => orNull(row?.[position]));
  });
}

export function cervicalLordosis(study) {
  return [orNull(study?.measurements ? cervicalMeasurements(study).C2C7_COBB : null)];
}

export function cervicalBalance(study) {
  return [orNull(study?.measurements ? cervicalMeasurements(study).C2C7_SVA_MM : null)];
}

export function globalBalance(study) {
  return [orNull(study?.measurements ? globalSvaMeasurements(study).GLOBAL_SVA_MM : null)];
}

function unitList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(finite) ? value : null;
}

// One study's inputs to every block, from its record and its stored embedding record (or null).
export function studyBlocks(study, record) {
  const g = study?.geometry;
  return {
    region: studyRegion(study),
    lumbar: lumbarPoints(study),
    cervical: cervicalPoints(study),
    hip: point(g?.hip_midpoint) ? g.hip_midpoint : null,
    side: validAnteriorSide(g?.anterior_side) ? g.anterior_side : null,
    entries: {
      A: alignment(study), SL: lumbarSegmental(study), D: discHeights(study),
      AC: cervicalLordosis(study), BC: cervicalBalance(study), SC: cervicalSegmental(study), B: globalBalance(study),
    },
    vectors: { C: unitList(record?.lumbar), CC: unitList(record?.cervical), W: unitList(record?.whole) },
    model: typeof record?.model?.onnx_sha256 === 'string' ? record.model.onnx_sha256 : null,
  };
}

// Spec section 7.5: a film has a region's anatomy when it carries any of that region's points or
// entries; whole spine is the resolved region itself.
export function hasRegion(study, region) {
  if (!study || study.measurements == null || study.geometry == null) return false;
  if (region === 'full_spine') return studyRegion(study) === 'full_spine';
  const b = studyBlocks(study, null);
  const keys = region === 'cervical' ? ['AC', 'BC', 'SC'] : ['A', 'SL', 'D'];
  const points = region === 'cervical' ? b.cervical : b.lumbar;
  return points.size > 0 || keys.some((key) => b.entries[key].some(finite));
}

export function defaultRegion(study) {
  const region = studyRegion(study);
  return REGIONS.includes(region) ? region : 'lumbar';
}
