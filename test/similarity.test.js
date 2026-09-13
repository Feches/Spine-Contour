import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANDMARK_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS, MODES, BLOCK_KEYS, vector, alignment, blocks,
  shapeDistance, pelvicDistance, alignmentDistance, appearanceDistance, pairDistances, medianScale, fuse,
  matchScore, candidates, findSimilar, openReason, angleLine, subjectFilms, needsEmbedding,
} from '../renderer/data/similarity.js';
import { HAND_ADDED } from '../renderer/data/parameters.js';

// A synthetic column: five bodies stacked 100 px apart, anterior on the RIGHT (x = 160/140), S1 under
// them, the hip well below and in front. `dx`, `dy`, `scale` place a copy elsewhere; `flip` mirrors it.
function geometry({ dx = 0, dy = 0, scale = 1, flip = false, levels = ['L1', 'L2', 'L3', 'L4', 'L5'], hip = true, s1 = true } = {}) {
  const px = (x, y) => [flip ? -(x * scale + dx) : x * scale + dx, y * scale + dy];
  const vertebrae = {};
  levels.forEach((level) => {
    const i = ['L1', 'L2', 'L3', 'L4', 'L5'].indexOf(level);
    const top = 100 + i * 100;
    vertebrae[level] = {
      superior: [px(160, top), px(100, top)],
      inferior: [px(160, top + 80), px(100, top + 80)],
      quadrilateral: [px(160, top), px(100, top), px(100, top + 80), px(160, top + 80)],
    };
  });
  return {
    vertebrae,
    s1_superior: s1 ? [px(170, 610), px(110, 620)] : null,
    l1_center: levels.includes('L1') ? px(130, 140) : null,
    hip_midpoint: hip ? px(260, 760) : null,
    femoral_circles: hip ? [[...px(250, 760), 30], [...px(270, 760), 30]] : [],
  };
}

function study(id, overrides = {}) {
  return {
    id, source: 'real', filePath: `C:\\films\\${id}.png`, fileName: `${id}.png`, name: null, workspaceFolder: 'C:\\films',
    subjectId: null, timepoint: null, filmDate: null, reviewedAt: null, addedAt: '2026-09-12T00:00:00.000Z',
    view: 'Standing lateral', thumbnail: null,
    measurements: { PI: 50, PT: 12, SS: 38, L1PA: 8, LL: { 'L1-S1': 49 } },
    geometry: geometry(), qc: { coverage: { partial: false, unoriented: [] } }, clinical: {}, ...overrides,
  };
}

const unit = (values) => { const n = Math.hypot(...values); return values.map((v) => v / n); };
function embedding(id, crop, whole = null, filmType = 'lumbar', sha = 'abc') {
  return { version: 1, id, computedAt: 'x', sourceSha256: null, model: { onnx_sha256: sha }, filmType, crop: unit(crop), whole: whole ? unit(whole) : null };
}

test('the landmark order is the 22 corners then S1, and the alignment order carries its weights', () => {
  assert.equal(LANDMARK_ORDER.length, 22);
  assert.deepEqual(LANDMARK_ORDER.slice(0, 4), ['L1.SA', 'L1.SP', 'L1.IA', 'L1.IP']);
  assert.deepEqual(LANDMARK_ORDER.slice(20), ['S1.SA', 'S1.SP']);
  assert.deepEqual(ALIGNMENT_ORDER, ['PI', 'PT', 'SS', 'LL L1-S1', 'PI-LL']);
  assert.deepEqual(ALIGNMENT_WEIGHTS, [1, 0.8, 0.8, 0.6, 1]);
  assert.deepEqual(BLOCK_KEYS, ['V', 'H', 'A', 'C', 'W']);
  assert.deepEqual(MODES.all, { V: 1, H: 1, A: 1, C: 1, W: 1 });
  assert.deepEqual(MODES.shape, { V: 1, H: 1, A: 0, C: 0, W: 0 });
  assert.deepEqual(MODES.alignment, { V: 0, H: 0, A: 1, C: 0, W: 0 });
  assert.deepEqual(MODES.appearance, { V: 0, H: 0, A: 0, C: 1, W: 1 });
});

test('vector centres the 22 points, scales them to unit centroid size and carries the hip through the same transform', () => {
  const v = vector(study('SP-1'));
  assert.equal(v.V.length, 44);
  const xs = v.V.filter((_, i) => i % 2 === 0);
  const ys = v.V.filter((_, i) => i % 2 === 1);
  const mean = (list) => list.reduce((s, x) => s + x, 0) / list.length;
  assert.ok(Math.abs(mean(xs)) < 1e-12 && Math.abs(mean(ys)) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...v.V) - 1) < 1e-12);
  // The hip is below and in front of the column: positive x (anterior), positive y (down).
  assert.ok(v.H[0] > 0 && v.H[1] > 0.5);
});

test('a translated, scaled or mirrored copy has the same vector, and orientation is never removed', () => {
  const base = vector(study('SP-1'));
  const moved = vector(study('SP-2', { geometry: geometry({ dx: 500, dy: -40, scale: 2.5 }) }));
  const flipped = vector(study('SP-3', { geometry: geometry({ flip: true }) }));
  assert.ok(shapeDistance(base.V, moved.V) < 1e-9);
  assert.ok(shapeDistance(base.V, flipped.V) < 1e-9);
  assert.ok(pelvicDistance(base.H, flipped.H) < 1e-9);
  // A column tilted 15 degrees is a different shape: no rotation normalisation.
  const c = Math.cos(Math.PI / 12), s = Math.sin(Math.PI / 12);
  const rotated = structuredClone(study('SP-4').geometry);
  const rotate = ([x, y]) => [c * x - s * y, s * x + c * y];
  for (const body of Object.values(rotated.vertebrae)) {
    body.superior = body.superior.map(rotate); body.inferior = body.inferior.map(rotate); body.quadrilateral = body.quadrilateral.map(rotate);
  }
  rotated.s1_superior = rotated.s1_superior.map(rotate);
  rotated.hip_midpoint = rotate(rotated.hip_midpoint);
  assert.ok(shapeDistance(base.V, vector(study('SP-4', { geometry: rotated })).V) > 0.05);
});

test('vector is null for a missing level, a missing S1, partial or unoriented coverage, a demo, or an unsegmented study', () => {
  assert.equal(vector(study('SP-1', { geometry: geometry({ levels: ['L1', 'L2', 'L3', 'L4'] }) })), null);
  assert.equal(vector(study('SP-1', { geometry: geometry({ s1: false }) })), null);
  assert.equal(vector(study('SP-1', { qc: { coverage: { partial: true, unoriented: [] } } })), null);
  assert.equal(vector(study('SP-1', { qc: { coverage: { partial: false, unoriented: ['L3'] } } })), null);
  const unconfirmed = geometry(); unconfirmed.vertebrae.L2.anterior_confirmed = false;
  assert.equal(vector(study('SP-1', { geometry: unconfirmed })), null);
  assert.equal(vector({ id: 'SP-0042', source: 'demo', measurements: { PI: 50 }, geometry: null, qc: null }), null);
  assert.equal(vector(study('SP-1', { measurements: null, geometry: null })), null);
  assert.equal(vector(study('SP-1', { geometry: geometry({ hip: false }) })).H, null);
});

test('alignment is the five angles with PI-LL derived, or null with one missing', () => {
  assert.deepEqual(alignment(study('SP-1')), [50, 12, 38, 49, 1]);
  assert.equal(alignment(study('SP-1', { measurements: { PI: null, PT: 12, SS: 38, LL: { 'L1-S1': 49 } } })), null);
  assert.equal(alignment(study('SP-1', { measurements: { PI: 50, PT: 12, SS: 38, LL: { 'L1-S1': null } } })), null);
  assert.equal(alignment({ measurements: null }), null);
  assert.equal(alignment(null), null);
});

test('the four distances: zero for a copy, symmetric, weighted for alignment, cosine for appearance', () => {
  const a = vector(study('SP-1'));
  assert.equal(shapeDistance(a.V, a.V), 0);
  assert.equal(pelvicDistance(a.H, a.H), 0);
  assert.equal(alignmentDistance([50, 12, 38, 49, 1], [50, 12, 38, 49, 1]), 0);
  assert.ok(Math.abs(alignmentDistance([50, 12, 38, 49, 1], [60, 12, 38, 49, 11]) - Math.sqrt(1 * 100 + 1 * 100)) < 1e-9);
  assert.ok(Math.abs(alignmentDistance([50, 12, 38, 49, 1], [50, 22, 38, 49, 1]) - Math.sqrt(0.8 * 100)) < 1e-9);
  assert.equal(alignmentDistance([1, 2, 3, 4, 5], [2, 3, 4, 5, 6]), alignmentDistance([2, 3, 4, 5, 6], [1, 2, 3, 4, 5]));
  assert.ok(Math.abs(appearanceDistance(unit([1, 0]), unit([1, 0]))) < 1e-12);
  assert.ok(Math.abs(appearanceDistance(unit([1, 0]), unit([0, 1])) - 1) < 1e-12);
  assert.ok(Math.abs(appearanceDistance(unit([1, 0]), unit([-1, 0])) - 2) < 1e-12);
});

test('blocks and pairDistances: every block only when both have it, the same model, and W only between two whole-spine films', () => {
  const open = blocks(study('SP-1'), embedding('SP-1', [1, 0], [1, 0], 'whole-spine'));
  const same = blocks(study('SP-2'), embedding('SP-2', [1, 0], [0, 1], 'whole-spine'));
  const lumbar = blocks(study('SP-3'), embedding('SP-3', [0, 1], [0, 1], 'lumbar'));
  const otherModel = blocks(study('SP-4'), embedding('SP-4', [1, 0], [1, 0], 'whole-spine', 'zzz'));
  const noHip = blocks(study('SP-5', { geometry: geometry({ hip: false }), measurements: { PI: null, PT: null, SS: 38, LL: { 'L1-S1': 49 } } }), null);
  const all = pairDistances(open, same, 'all');
  assert.equal(all.V, 0); assert.equal(all.H, 0); assert.equal(all.A, 0); assert.equal(all.C, 0);
  assert.ok(Math.abs(all.W - 1) < 1e-12);
  const withLumbar = pairDistances(open, lumbar, 'all');
  assert.ok(Math.abs(withLumbar.C - 1) < 1e-12);
  assert.equal(withLumbar.W, null);
  const across = pairDistances(open, otherModel, 'all');
  assert.equal(across.C, null); assert.equal(across.W, null); assert.equal(across.V, 0);
  const sparse = pairDistances(open, noHip, 'all');
  assert.equal(sparse.H, null); assert.equal(sparse.A, null); assert.equal(sparse.C, null); assert.equal(sparse.V, 0);
  assert.deepEqual(pairDistances(open, same, 'shape'), { V: 0, H: 0, A: null, C: null, W: null });
  assert.deepEqual(pairDistances(open, same, 'alignment'), { V: null, H: null, A: 0, C: null, W: null });
  const appearance = pairDistances(open, same, 'appearance');
  assert.equal(appearance.V, null); assert.equal(appearance.C, 0); assert.ok(Math.abs(appearance.W - 1) < 1e-12);
});

test('medianScale needs three present values and a positive median, else 1', () => {
  assert.equal(medianScale([]), 1);
  assert.equal(medianScale([2, 4]), 1);
  assert.equal(medianScale([null, 2, 4]), 1);
  assert.equal(medianScale([2, 4, 9]), 4);
  assert.equal(medianScale([2, 4, 9, 20]), 6.5);
  assert.equal(medianScale([0, 0, 0]), 1);
  assert.equal(medianScale([null, 1, 3, 5, undefined]), 3);
});

test('fuse is the weighted root-mean-square of the present scaled blocks and names them; nothing present is null', () => {
  const scales = { V: 2, H: 1, A: 10, C: 0.5, W: 0.5 };
  const one = fuse({ V: 2, H: null, A: null, C: null, W: null }, scales, MODES.all);
  assert.deepEqual(one, { d: 1, blocks: ['V'] });
  const two = fuse({ V: 2, H: 3, A: null, C: null, W: null }, scales, MODES.all);
  assert.ok(Math.abs(two.d - Math.sqrt((1 + 9) / 2)) < 1e-12);
  assert.deepEqual(two.blocks, ['V', 'H']);
  assert.deepEqual(fuse({ V: 2, H: 3, A: 20, C: 1, W: 1 }, scales, MODES.alignment), { d: 2, blocks: ['A'] });
  assert.equal(fuse({ V: null, H: null, A: null, C: null, W: null }, scales, MODES.all), null);
  assert.equal(fuse({ V: 2, H: 3, A: null, C: null, W: null }, scales, MODES.appearance), null);
  // Any weight table works, not only the four presets: a later stage's sliders pass their own.
  const custom = fuse({ V: 2, H: 3, A: null, C: null, W: null }, scales, { V: 3, H: 1, A: 0, C: 0, W: 0 });
  assert.ok(Math.abs(custom.d - Math.sqrt((3 * 1 + 1 * 9) / 4)) < 1e-12);
});

test('matchScore is 100 at zero distance, falls with it, and is clamped to 0..100', () => {
  assert.equal(matchScore(0), 100);
  assert.equal(matchScore(0.5), 61);
  assert.equal(matchScore(1), 37);
  assert.equal(matchScore(10), 0);
  assert.equal(matchScore(-1), 100);
});

test('candidates: real, not self, full coverage, in scope, not the same subject, with an embedding when the mode needs one', () => {
  const open = study('SP-1', { subjectId: 'S001', workspaceFolder: 'C:\\A' });
  const all = [
    open,
    study('SP-2', { workspaceFolder: 'C:\\A' }),
    study('SP-3', { workspaceFolder: 'C:\\B' }),
    study('SP-4', { workspaceFolder: null }),
    study('SP-5', { workspaceFolder: 'C:\\A', subjectId: ' s001 ' }),
    study('SP-6', { workspaceFolder: 'C:\\A', qc: { coverage: { partial: true, unoriented: [] } } }),
    { ...study('SP-0042'), source: 'demo', geometry: null },
  ];
  const embeddings = { 'SP-2': embedding('SP-2', [1, 0]), 'SP-3': embedding('SP-3', [1, 0]) };
  const ids = (list) => list.map((s) => s.id);
  assert.deepEqual(ids(candidates(open, all, { scope: 'all', mode: 'shape', embeddings })), ['SP-2', 'SP-3', 'SP-4']);
  assert.deepEqual(ids(candidates(open, all, { scope: 'workspace', mode: 'shape', embeddings })), ['SP-2']);
  assert.deepEqual(ids(candidates(open, all, { scope: 'all', mode: 'all', embeddings })), ['SP-2', 'SP-3']);
  assert.deepEqual(ids(candidates(open, all, { scope: 'all', mode: 'appearance', embeddings })), ['SP-2', 'SP-3']);
  assert.deepEqual(ids(candidates(open, all, { scope: 'all', mode: 'alignment', embeddings: {} })), ['SP-2', 'SP-3', 'SP-4']);
  // A hand-added open study's workspace is the other hand-added films.
  const hand = study('SP-9', { workspaceFolder: null });
  assert.deepEqual(ids(candidates(hand, [hand, ...all], { scope: 'workspace', mode: 'shape', embeddings: {} })), ['SP-4']);
  assert.equal(HAND_ADDED, '__hand__');
});

test('findSimilar ranks ascending, breaks ties by id, returns n, and counts the stale-model candidates', () => {
  const open = study('SP-1');
  const near = study('SP-2', { geometry: geometry({ dx: 3, dy: 1 }), measurements: { PI: 52, PT: 12, SS: 40, LL: { 'L1-S1': 49 } } });
  const far = study('SP-3', { measurements: { PI: 75, PT: 30, SS: 45, LL: { 'L1-S1': 30 } } });
  const twin = study('SP-4');
  const twinToo = study('SP-5');
  const stale = study('SP-6');
  const embeddings = {
    'SP-1': embedding('SP-1', [1, 0]), 'SP-2': embedding('SP-2', [0.9, 0.1]), 'SP-3': embedding('SP-3', [0, 1]),
    'SP-4': embedding('SP-4', [1, 0]), 'SP-5': embedding('SP-5', [1, 0]), 'SP-6': embedding('SP-6', [1, 0], null, 'lumbar', 'old'),
  };
  const all = [open, far, twinToo, near, twin, stale];
  const result = findSimilar(open, all, { scope: 'all', mode: 'all', embeddings, n: 5 });
  // SP-6 shares the open study's geometry and angles: it ties at zero on V, H and A (its embedding
  // is from another graph, so C never enters), and the tie breaks by id.
  assert.deepEqual(result.matches.map((m) => m.study.id), ['SP-4', 'SP-5', 'SP-6', 'SP-2', 'SP-3']);
  assert.equal(result.matches[0].d, 0);
  assert.equal(result.matches[0].match, 100);
  assert.deepEqual(result.matches[0].blocks, ['V', 'H', 'A', 'C']);
  assert.deepEqual(result.matches[2].blocks, ['V', 'H', 'A']);
  assert.equal(result.total, 5);
  assert.equal(result.stale, 1);
  assert.equal(findSimilar(open, all, { scope: 'all', mode: 'all', embeddings, n: 2 }).matches.length, 2);
  // Under appearance the stale candidate has no block at all and is dropped from the ranking.
  const appearance = findSimilar(open, all, { scope: 'all', mode: 'appearance', embeddings });
  assert.deepEqual(appearance.matches.map((m) => m.study.id), ['SP-4', 'SP-5', 'SP-2', 'SP-3']);
  assert.equal(appearance.total, 4);
  assert.equal(appearance.stale, 1);
  assert.deepEqual(findSimilar(open, [open], { embeddings }), { matches: [], total: 0, stale: 0 });
});

test('openReason names why the tab shows no cards', () => {
  const e = { 'SP-1': embedding('SP-1', [1, 0]) };
  assert.equal(openReason(study('SP-1', { measurements: null, geometry: null }), 'all', e), 'unsegmented');
  assert.equal(openReason(study('SP-1', { qc: { coverage: { partial: true, unoriented: [] } } }), 'all', e), 'partial');
  assert.equal(openReason(study('SP-1'), 'all', {}), 'no-embedding');
  assert.equal(openReason(study('SP-1'), 'appearance', {}), 'no-embedding');
  assert.equal(openReason(study('SP-1'), 'shape', {}), null);
  assert.equal(openReason(study('SP-1', { measurements: { PI: null, PT: 12, SS: 38, LL: { 'L1-S1': 49 } } }), 'alignment', e), 'no-alignment');
  assert.equal(openReason(study('SP-1', { measurements: { PI: null, PT: 12, SS: 38, LL: { 'L1-S1': 49 } } }), 'all', e), null);
  assert.equal(openReason(study('SP-1'), 'all', e), null);
  assert.equal(needsEmbedding('all'), true);
  assert.equal(needsEmbedding('appearance'), true);
  assert.equal(needsEmbedding('shape'), false);
  assert.equal(needsEmbedding('alignment'), false);
});

test('angleLine is the candidate minus the open study in whole signed degrees, with a dash per absent angle', () => {
  const open = study('SP-1');
  const other = study('SP-2', { measurements: { PI: 52.4, PT: 11.6, SS: 40.5, LL: { 'L1-S1': 43 } } });
  assert.equal(angleLine(open, other), 'PI +2 \u00B7 LL \u22126 \u00B7 PT 0 \u00B7 SS +3');
  const missing = study('SP-3', { measurements: { PI: null, PT: 12, SS: null, LL: { 'L1-S1': 49 } } });
  assert.equal(angleLine(open, missing), 'PI \u2014 \u00B7 LL 0 \u00B7 PT 0 \u00B7 SS \u2014');
  assert.equal(angleLine(open, { measurements: null }), 'PI \u2014 \u00B7 LL \u2014 \u00B7 PT \u2014 \u00B7 SS \u2014');
});

test('subjectFilms is the real films sharing the subject key, or the study alone', () => {
  const a = study('SP-1', { subjectId: 'S001' });
  const b = study('SP-2', { subjectId: ' s001' });
  const c = study('SP-3', { subjectId: 'S002' });
  const d = study('SP-4');
  const demo = { ...study('SP-0042', { subjectId: 'S001' }), source: 'demo' };
  assert.deepEqual(subjectFilms(a, [a, b, c, d, demo]).map((s) => s.id), ['SP-1', 'SP-2']);
  assert.deepEqual(subjectFilms(d, [a, b, c, d]).map((s) => s.id), ['SP-4']);
});
