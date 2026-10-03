import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGIONS, FAMILIES, BLOCKS, BLOCK_KEYS, ENTRY_KEYS, LANDMARK_ORDER, CERVICAL_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS,
  LUMBAR_SEGMENTAL_ORDER, CERVICAL_SEGMENTAL_ORDER, DISC_ORDER, blockOf, weightsFor, lumbarPoints, cervicalPoints,
  alignment, lumbarSegmental, cervicalSegmental, discHeights, cervicalLordosis, cervicalBalance, globalBalance,
  studyBlocks, hasRegion, defaultRegion,
} from '../renderer/data/similarity-blocks.js';

// Five lumbar bodies 100 px apart, anterior on the right, S1 under them, the hip below and in front.
export function lumbarGeometry({ dx = 0, dy = 0, scale = 1, levels = ['L1', 'L2', 'L3', 'L4', 'L5'], hip = true, s1 = true, unoriented = [] } = {}) {
  const px = (x, y) => [x * scale + dx, y * scale + dy];
  const vertebrae = {};
  levels.forEach((level) => {
    const i = ['L1', 'L2', 'L3', 'L4', 'L5'].indexOf(level);
    const top = 100 + i * 100;
    vertebrae[level] = {
      superior: [px(160, top), px(100, top)], inferior: [px(160, top + 80), px(100, top + 80)],
      quadrilateral: [px(160, top), px(100, top), px(100, top + 80), px(160, top + 80)],
      ...(unoriented.includes(level) ? { anterior_confirmed: false } : {}),
    };
  });
  return { vertebrae, s1_superior: s1 ? [px(170, 610), px(110, 620)] : null, l1_center: px(130, 140),
    hip_midpoint: hip ? px(260, 760) : null, femoral_circles: [], image_width: 1000, image_height: 1000 };
}

// C2 (inferior only) over C3-C7, 60 px apart, anterior on the LEFT of the image (anterior_side 'left').
export function cervicalGeometry({ dx = 0, dy = 0, scale = 1, side = 'left', levels = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'] } = {}) {
  const px = (x, y) => [x * scale + dx, y * scale + dy];
  const vertebrae = {};
  levels.forEach((level) => {
    const i = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'].indexOf(level);
    const top = 50 + i * 60;
    vertebrae[level] = level === 'C2'
      ? { superior: null, inferior: [px(40, top + 40), px(80, top + 40)], quadrilateral: null }
      : { superior: [px(40, top), px(80, top)], inferior: [px(40, top + 40), px(80, top + 40)],
        quadrilateral: [px(40, top), px(80, top), px(80, top + 40), px(40, top + 40)] };
  });
  return { region: 'cervical', vertebrae, anterior_side: side, c2_centroid: px(60, 70), image_width: 1000, image_height: 1000 };
}

// normalizeCalibration (calibration.js) needs a 64-hex source_sha256, a status it knows (a calibrated one: detected,
// dicom or corrected) and, for 'dicom', the spacing source 'dicom_pixel_spacing'; without them every millimetre reads null.
export const CALIBRATION = { version: 1, source_sha256: 'a'.repeat(64), width: 1000, height: 1000, coordinate_space: 'original_image',
  status: 'dicom', spacing: { row_mm: 0.5, column_mm: 0.5, source: 'dicom_pixel_spacing' }, candidates: [], selected_index: null };

export function study(id, overrides = {}) {
  return {
    id, source: 'real', filePath: `C:\\films\\${id}.png`, fileName: `${id}.png`, name: null, workspaceFolder: 'C:\\films',
    subjectId: null, timepoint: null, filmDate: null, reviewedAt: null, addedAt: '2026-09-30T00:00:00.000Z',
    view: 'Standing lateral', thumbnail: null, region: 'lumbar', anteriorSide: null,
    measurements: { PI: 50, PT: 12, SS: 38, L1PA: 8, LL: { 'L1-S1': 49 } },
    geometry: lumbarGeometry(), qc: { coverage: { partial: false, unoriented: [] } }, clinical: {}, calibration: null, ...overrides,
  };
}

test('the registry: thirteen blocks in four families, each with a kind and a region list', () => {
  assert.deepEqual(REGIONS, ['lumbar', 'cervical', 'full_spine']);
  assert.deepEqual(FAMILIES, ['lumbar', 'cervical', 'whole', 'appearance']);
  assert.deepEqual(BLOCK_KEYS, ['V', 'H', 'A', 'SL', 'D', 'VC', 'AC', 'BC', 'SC', 'B', 'W', 'C', 'CC']);
  assert.deepEqual(ENTRY_KEYS, ['A', 'SL', 'D', 'AC', 'BC', 'SC', 'B']);
  assert.equal(BLOCKS.length, 13);
  assert.deepEqual(blockOf('A'), { key: 'A', family: 'lumbar', kind: 'alignment', regions: ['lumbar', 'full_spine'], label: 'no alignment', weights: ALIGNMENT_WEIGHTS, floor: 2 });
  assert.deepEqual(blockOf('W').regions, ['full_spine']);
  assert.equal(blockOf('CC').family, 'appearance');
  assert.deepEqual(ALIGNMENT_ORDER, ['PI', 'PT', 'SS', 'LL L1-S1', 'PI-LL', 'L1PA']);
  assert.deepEqual(ALIGNMENT_WEIGHTS, [1, 0.8, 0.8, 0.6, 1, 0.8]);
  assert.equal(LANDMARK_ORDER.length, 22);
  assert.deepEqual(CERVICAL_ORDER.slice(0, 6), ['C2.IA', 'C2.IP', 'C3.SA', 'C3.SP', 'C3.IA', 'C3.IP']);
  assert.equal(CERVICAL_ORDER.length, 22);
  assert.equal(LUMBAR_SEGMENTAL_ORDER.length, 10);
  assert.equal(CERVICAL_SEGMENTAL_ORDER.length, 10);
  assert.deepEqual(DISC_ORDER.slice(0, 3), ['L1-L2 anterior', 'L1-L2 middle', 'L1-L2 posterior']);
  assert.equal(DISC_ORDER.length, 15);
});

test('weightsFor sums to one per family switched on, by region and mode, and never divides by zero', () => {
  const sum = (w, keys) => keys.reduce((s, k) => s + w[k], 0);
  const w = weightsFor('full_spine', 'all');
  assert.ok(Math.abs(sum(w, ['V', 'H', 'A', 'SL', 'D']) - 1) < 1e-12);
  assert.ok(Math.abs(sum(w, ['VC', 'AC', 'BC', 'SC']) - 1) < 1e-12);
  assert.ok(Math.abs(sum(w, ['B', 'W']) - 1) < 1e-12);
  assert.ok(Math.abs(sum(w, ['C', 'CC']) - 1) < 1e-12);
  const lumbar = weightsFor('lumbar', 'all');
  assert.deepEqual(BLOCK_KEYS.filter((k) => lumbar[k] > 0), ['V', 'H', 'A', 'SL', 'D', 'C']);
  assert.equal(lumbar.C, 1);
  const cervical = weightsFor('cervical', 'alignment');
  assert.deepEqual(BLOCK_KEYS.filter((k) => cervical[k] > 0), ['AC', 'BC', 'SC']);
  assert.ok(Math.abs(cervical.AC - 1 / 3) < 1e-12);
  const shape = weightsFor('full_spine', 'shape');
  assert.deepEqual(BLOCK_KEYS.filter((k) => shape[k] > 0), ['V', 'H', 'D', 'VC']);
  assert.equal(shape.B, 0);
  assert.equal(shape.W, 0);
  assert.ok(Object.values(shape).every(Number.isFinite));
  assert.deepEqual(weightsFor('lumbar', 'appearance'), { ...Object.fromEntries(BLOCK_KEYS.map((k) => [k, 0])), C: 1 });
  assert.ok(Object.isFrozen(w));
});

test('lumbarPoints collects whole levels and S1, skips an incomplete or unoriented level, and needs no coverage flag', () => {
  const full = lumbarPoints(study('a'));
  assert.equal(full.size, 22);
  assert.deepEqual(full.get('L1.SA'), [160, 100]);
  assert.deepEqual(full.get('S1.SP'), [110, 620]);
  const missing = lumbarPoints(study('b', { geometry: lumbarGeometry({ levels: ['L2', 'L3', 'L4', 'L5'] }), qc: { coverage: { partial: true, unoriented: [] } } }));
  assert.equal(missing.size, 18);
  assert.equal(missing.has('L1.SA'), false);
  const unoriented = lumbarPoints(study('c', { geometry: lumbarGeometry({ unoriented: ['L3'] }) }));
  assert.equal(unoriented.size, 18);
  assert.equal(unoriented.has('L3.IP'), false);
  assert.equal(lumbarPoints(study('d', { geometry: lumbarGeometry({ s1: false }) })).size, 20);
  assert.equal(lumbarPoints(study('e', { geometry: null })).size, 0);
  assert.equal(lumbarPoints(study('f', { geometry: cervicalGeometry() })).size, 0);
});

test('cervicalPoints collects C2 inferior and C3-C7 corners, only with an anterior side', () => {
  const points = cervicalPoints(study('a', { region: 'cervical', geometry: cervicalGeometry() }));
  assert.equal(points.size, 22);
  assert.deepEqual(points.get('C2.IA'), [40, 90]);
  assert.deepEqual(points.get('C7.IP'), [80, 390]);
  assert.equal(cervicalPoints(study('b', { region: 'cervical', geometry: cervicalGeometry({ side: null }) })).size, 0);
  assert.equal(cervicalPoints(study('c', { region: 'cervical', geometry: cervicalGeometry({ levels: ['C3', 'C4', 'C5', 'C6', 'C7'] }) })).size, 20);
  assert.equal(cervicalPoints(study('d')).size, 0);
});

test('the entry readers return fixed-order arrays with null per absent value', () => {
  const s = study('a');
  assert.deepEqual(alignment(s), [50, 12, 38, 49, 1, 8]);
  assert.deepEqual(alignment(study('b', { measurements: { PI: null, PT: 12, SS: 38, L1PA: null, LL: { 'L1-S1': 49 } } })), [null, 12, 38, 49, null, null]);
  assert.deepEqual(alignment(study('c', { measurements: null })), [null, null, null, null, null, null]);
  const seg = lumbarSegmental(s);
  assert.equal(seg.length, 10);
  assert.ok(seg.every((v) => v === null || Number.isFinite(v)));
  assert.deepEqual(cervicalSegmental(s), new Array(10).fill(null));
  assert.deepEqual(discHeights(s), new Array(15).fill(null));
  const calibrated = study('d', { calibration: CALIBRATION });
  const heights = discHeights(calibrated);
  assert.equal(heights.length, 15);
  assert.ok(heights.every(Number.isFinite));
  assert.ok(Math.abs(heights[1] - 10) < 1e-9, 'L1-L2 middle: 20 px between endplate midpoints at 0.5 mm/px');
  assert.deepEqual(cervicalLordosis(s), [null]);
  assert.deepEqual(cervicalBalance(s), [null]);
  assert.deepEqual(globalBalance(s), [null]);
  const cervical = study('e', { region: 'cervical', geometry: cervicalGeometry(), measurements: { region: 'cervical' }, calibration: CALIBRATION });
  assert.ok(Number.isFinite(cervicalLordosis(cervical)[0]));
  assert.ok(Number.isFinite(cervicalBalance(cervical)[0]));
  assert.deepEqual(cervicalBalance(study('f', { region: 'cervical', geometry: cervicalGeometry(), measurements: { region: 'cervical' } })), [null], 'no calibration, no millimetres');
});

test('studyBlocks assembles region, points, hip, side, entries, vectors and model', () => {
  const record = { version: 2, id: 'a', model: { onnx_sha256: 'abc' }, region: 'lumbar', lumbar: [1, 0], cervical: null, whole: [0, 1] };
  const b = studyBlocks(study('a'), record);
  assert.equal(b.region, 'lumbar');
  assert.equal(b.lumbar.size, 22);
  assert.equal(b.cervical.size, 0);
  assert.deepEqual(b.hip, [260, 760]);
  assert.equal(b.side, null);
  assert.deepEqual(Object.keys(b.entries), ENTRY_KEYS);
  assert.deepEqual(b.vectors, { C: [1, 0], CC: null, W: [0, 1] });
  assert.equal(b.model, 'abc');
  const none = studyBlocks(study('b', { geometry: null, measurements: null }), null);
  assert.equal(none.lumbar.size, 0);
  assert.equal(none.hip, null);
  assert.deepEqual(none.vectors, { C: null, CC: null, W: null });
  assert.equal(none.model, null);
});

test('hasRegion and defaultRegion follow the anatomy a film carries', () => {
  const lumbar = study('a');
  assert.equal(hasRegion(lumbar, 'lumbar'), true);
  assert.equal(hasRegion(lumbar, 'cervical'), false);
  assert.equal(hasRegion(lumbar, 'full_spine'), false);
  assert.equal(defaultRegion(lumbar), 'lumbar');
  const anglesOnly = study('b', { geometry: { vertebrae: {}, s1_superior: null } });
  assert.equal(hasRegion(anglesOnly, 'lumbar'), true, 'measured angles alone are lumbar anatomy');
  const cervical = study('c', { region: 'cervical', geometry: cervicalGeometry(), measurements: { region: 'cervical' } });
  assert.equal(hasRegion(cervical, 'cervical'), true);
  assert.equal(hasRegion(cervical, 'lumbar'), false);
  assert.equal(defaultRegion(cervical), 'cervical');
  // Renamed from the brief's second `lumbar`/`cervical`: redeclaring a const in one scope is a SyntaxError.
  const lumbarParts = lumbarGeometry();
  const cervicalParts = cervicalGeometry();
  const full = study('d', {
    region: 'auto',
    geometry: { ...lumbarParts, vertebrae: { ...lumbarParts.vertebrae, ...cervicalParts.vertebrae }, anterior_side: 'left', c2_centroid: [60, 70], c7_centroid: [60, 370], region: 'full_spine' },
    measurements: { PI: 50, PT: 12, SS: 38, L1PA: 8, LL: { 'L1-S1': 49 }, region: 'full_spine' },
  });
  assert.equal(hasRegion(full, 'full_spine'), true);
  assert.equal(hasRegion(full, 'lumbar'), true);
  assert.equal(hasRegion(full, 'cervical'), true);
  assert.equal(defaultRegion(full), 'full_spine');
  assert.equal(hasRegion(study('e', { measurements: null, geometry: null }), 'lumbar'), false);
});
