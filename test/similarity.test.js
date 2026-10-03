import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANDMARK_ORDER, CERVICAL_ORDER, BLOCK_KEYS, MODES, SCOPES, LUMBAR_SHAPE, CERVICAL_SHAPE, vector, cervicalVector,
  shapePair, hipUnder, entryDistance, appearanceDistance, pairDistances, medianScale, fuse, matchScore, candidates,
  findSimilar, openReason, angleLine, subjectFilms, needsEmbedding, weightsFor, studyBlocks, heldRegion,
} from '../renderer/data/similarity.js';
import { lumbarPoints, cervicalPoints, globalBalance } from '../renderer/data/similarity-blocks.js';
import { HAND_ADDED } from '../renderer/data/parameters.js';
import { lumbarGeometry, cervicalGeometry, CALIBRATION, study } from './fixtures/similarity-fixtures.js';

const unit = (values) => { const n = Math.hypot(...values); return values.map((v) => v / n); };
function record(id, { lumbar = null, cervical = null, whole = null, region = 'lumbar', sha = 'abc' } = {}) {
  return { version: 2, id, computedAt: 'x', sourceSha256: null, model: { onnx_sha256: sha }, region,
    lumbar: lumbar ? unit(lumbar) : null, cervical: cervical ? unit(cervical) : null, whole: whole ? unit(whole) : null };
}
function fullSpine(id, overrides = {}) {
  const lumbar = lumbarGeometry(overrides.lumbar ?? {});
  const cervical = cervicalGeometry(overrides.cervical ?? {});
  return study(id, {
    region: 'full_spine',
    geometry: { ...lumbar, vertebrae: { ...lumbar.vertebrae, ...cervical.vertebrae }, anterior_side: 'left',
      c2_centroid: [60, 70], c7_centroid: [60, 370], region: 'full_spine', source_sha256: CALIBRATION.source_sha256 },
    measurements: { PI: 50, PT: 12, SS: 38, L1PA: 8, LL: { 'L1-S1': 49 }, region: 'full_spine', GLOBAL_SVA_MM: null, GLOBAL_SVA_PX: null },
    ...overrides.study,
  });
}
function cervicalStudy(id, overrides = {}) {
  return study(id, { region: 'cervical', geometry: cervicalGeometry(overrides.geometry ?? {}), measurements: { region: 'cervical' }, ...overrides.study });
}

test('the module re-exports the registry and names the modes and scopes', () => {
  assert.deepEqual(MODES, ['all', 'shape', 'alignment', 'appearance']);
  assert.deepEqual(SCOPES, ['all', 'workspace']);
  assert.equal(BLOCK_KEYS.length, 13);
  assert.equal(LANDMARK_ORDER.length, 22);
  assert.equal(CERVICAL_ORDER.length, 22);
  assert.deepEqual(LUMBAR_SHAPE, { order: LANDMARK_ORDER, floor: 14, require: ['S1.SA', 'S1.SP'] });
  assert.deepEqual(CERVICAL_SHAPE, { order: CERVICAL_ORDER, floor: 14, require: [] });
  assert.equal(needsEmbedding('all'), true);
  assert.equal(needsEmbedding('shape'), false);
});

test('vector gives the complete 44-number lumbar shape or null; cervicalVector its twin', () => {
  const v = vector(study('a'));
  assert.equal(v.V.length, 44);
  assert.equal(v.H.length, 2);
  assert.ok(Math.abs(Math.hypot(...v.V) - 1) < 1e-12);
  assert.equal(vector(study('b', { geometry: lumbarGeometry({ levels: ['L2', 'L3', 'L4', 'L5'] }) })), null);
  assert.equal(vector(study('c', { geometry: lumbarGeometry({ hip: false }) })).H, null);
  const c = cervicalVector(cervicalStudy('d'));
  assert.equal(c.V.length, 44);
  assert.equal(cervicalVector(study('e')), null);
});

test('shapePair over shared points equals the complete distance when both films are complete, is invariant to translation and scale, mirrors, and drops below the floor', () => {
  const a = lumbarPoints(study('a'));
  const b = lumbarPoints(study('b', { geometry: lumbarGeometry({ dx: 300, dy: -50, scale: 2 }) }));
  const pair = shapePair(a, b, LUMBAR_SHAPE, null, null);
  assert.ok(pair.d < 1e-9, `translated and scaled copy: ${pair.d}`);
  const va = vector(study('a')).V;
  const vb = vector(study('b', { geometry: lumbarGeometry({ dx: 300, dy: -50, scale: 2 }) })).V;
  assert.ok(Math.abs(pair.d - Math.hypot(...va.map((x, i) => x - vb[i]))) < 1e-9, 'the shared-point distance is the complete distance');
  const flipped = lumbarPoints(study('c', { geometry: { ...lumbarGeometry(), vertebrae: Object.fromEntries(Object.entries(lumbarGeometry().vertebrae).map(([k, body]) => [k, { ...body, superior: body.superior.map(([x, y]) => [-x, y]), inferior: body.inferior.map(([x, y]) => [-x, y]) }])), s1_superior: [[-170, 610], [-110, 620]] } }));
  assert.ok(shapePair(a, flipped, LUMBAR_SHAPE, null, null).d < 1e-9, 'a mirrored film reads as the same shape');
  const four = lumbarPoints(study('d', { geometry: lumbarGeometry({ levels: ['L2', 'L3', 'L4', 'L5'] }) }));
  const shared = shapePair(a, four, LUMBAR_SHAPE, null, null);
  assert.ok(shared && shared.d < 1e-9, 'four shared levels plus S1 rank on the shared points');
  const two = lumbarPoints(study('e', { geometry: lumbarGeometry({ levels: ['L4', 'L5'] }) }));
  assert.equal(shapePair(a, two, LUMBAR_SHAPE, null, null), null, 'two levels are below the floor');
  const noS1 = lumbarPoints(study('f', { geometry: lumbarGeometry({ s1: false }) }));
  assert.equal(shapePair(a, noS1, LUMBAR_SHAPE, null, null), null, 'the lumbar shape needs S1');
  // The transforms travel with the pair so the hip can follow them.
  assert.deepEqual(Object.keys(pair.a).sort(), ['cx', 'cy', 'list', 'sign', 'size']);
  const hipA = hipUnder([260, 760], pair.a);
  const hipB = hipUnder([300 + 520, -50 + 1520], pair.b);
  assert.ok(Math.hypot(hipA[0] - hipB[0], hipA[1] - hipB[1]) < 1e-9);
});

test('the cervical shape mirrors by the recorded side and needs four bodies', () => {
  const left = cervicalPoints(cervicalStudy('a'));
  const right = cervicalPoints(cervicalStudy('b', { geometry: { side: 'right' } }));
  const mirrored = new Map([...right].map(([name, [x, y]]) => [name, [-x, y]]));
  assert.ok(shapePair(left, mirrored, CERVICAL_SHAPE, -1, 1).d < 1e-9, 'a right-facing copy mirrored in x is the same shape');
  assert.ok(shapePair(left, right, CERVICAL_SHAPE, -1, 1).d > 0.1, 'without the mirror they differ');
  const three = cervicalPoints(cervicalStudy('c', { geometry: { levels: ['C5', 'C6', 'C7'] } }));
  assert.equal(shapePair(left, three, CERVICAL_SHAPE, -1, -1), null);
  const four = cervicalPoints(cervicalStudy('d', { geometry: { levels: ['C2', 'C5', 'C6', 'C7'] } }));
  assert.ok(shapePair(left, four, CERVICAL_SHAPE, -1, -1) !== null, 'C2 plus three bodies is fourteen points');
});

test('entryDistance is a weighted RMS over the entries both have, null below the floor', () => {
  assert.ok(Math.abs(entryDistance([1, 2, 3], [1, 2, 3], null, 1)) < 1e-12);
  assert.ok(Math.abs(entryDistance([0, 0], [3, 4], null, 1) - Math.sqrt(12.5)) < 1e-12);
  assert.ok(Math.abs(entryDistance([0, 0, 10], [3, 4, null], null, 2) - Math.sqrt(12.5)) < 1e-12, 'a null on either side leaves the entry out');
  assert.equal(entryDistance([0, null, 10], [3, 4, null], null, 2), null, 'one shared entry is below a floor of two');
  assert.ok(Math.abs(entryDistance([0, 0], [1, 1], [1, 3], 1) - 1) < 1e-12, 'weights divide out');
  assert.equal(entryDistance([null], [null], null, 1), null);
});

test('pairDistances fills every switched-on block or null, follows the weights, and keeps millimetre blocks off an uncalibrated pair', () => {
  const open = studyBlocks(study('a', { calibration: CALIBRATION }), record('a', { lumbar: [1, 0, 0], whole: [0, 1, 0] }));
  const same = studyBlocks(study('b', { calibration: CALIBRATION, geometry: lumbarGeometry({ dx: 10 }) }), record('b', { lumbar: [1, 0, 0], whole: [0, 1, 0] }));
  const d = pairDistances(open, same, weightsFor('lumbar', 'all'));
  assert.deepEqual(Object.keys(d), BLOCK_KEYS);
  assert.ok(d.V < 1e-9 && d.H < 1e-9 && d.A < 1e-9 && d.C < 1e-9);
  assert.equal(d.D !== null, true, 'both calibrated: disc heights present');
  assert.equal(d.W, null, 'W is off under lumbar');
  assert.equal(d.VC, null);
  const uncalibrated = studyBlocks(study('c', { geometry: lumbarGeometry({ dx: 10 }) }), record('c', { lumbar: [1, 0, 0] }));
  const e = pairDistances(open, uncalibrated, weightsFor('lumbar', 'all'));
  assert.equal(e.D, null, 'one film uncalibrated: no disc heights');
  assert.ok(e.V < 1e-9);
  const noHip = studyBlocks(study('d', { geometry: lumbarGeometry({ hip: false }) }), null);
  const f = pairDistances(open, noHip, weightsFor('lumbar', 'all'));
  assert.equal(f.H, null);
  assert.equal(f.C, null, 'no embedding on one side');
  const other = studyBlocks(study('e'), record('e', { lumbar: [1, 0, 0], sha: 'zzz' }));
  assert.equal(pairDistances(open, other, weightsFor('lumbar', 'all')).C, null, 'different models never compare');
  const shapeOnly = pairDistances(open, same, weightsFor('lumbar', 'shape'));
  assert.equal(shapeOnly.A, null, 'a block with weight 0 is not computed');
  assert.ok(shapeOnly.V < 1e-9);
});

test('pairDistances between two full-spine films fills the cervical and whole-spine blocks, and W only when both are full spine', () => {
  const a = studyBlocks(fullSpine('a', { study: { calibration: CALIBRATION } }), record('a', { lumbar: [1, 0], cervical: [0, 1], whole: [1, 1], region: 'full_spine' }));
  const b = studyBlocks(fullSpine('b', { lumbar: { dx: 5 }, cervical: { dx: 5 }, study: { calibration: CALIBRATION } }), record('b', { lumbar: [1, 0], cervical: [0, 1], whole: [1, 1], region: 'full_spine' }));
  const d = pairDistances(a, b, weightsFor('full_spine', 'all'));
  assert.ok(d.VC < 1e-9 && d.CC < 1e-9 && d.W < 1e-9);
  assert.equal(d.AC !== null, true);
  assert.equal(d.SC !== null, true);
  const lumbar = studyBlocks(study('c', { calibration: CALIBRATION }), record('c', { lumbar: [1, 0], whole: [1, 1] }));
  const mixed = pairDistances(a, lumbar, weightsFor('full_spine', 'all'));
  assert.equal(mixed.W, null, 'a lumbar film has no whole-film block against a full-spine one');
  assert.ok(mixed.V < 1e-9, 'but the lumbar shape compares');
  assert.equal(mixed.VC, null);
});

test('medianScale is the median of whatever is present (one value is itself, two their mean), 1 with none or a non-positive median; fuse and matchScore are stage 1', () => {
  assert.equal(medianScale([1, 2, 3]), 2);
  assert.equal(medianScale([1, 2]), 1.5, 'two present values scale by their mean (ruling R20)');
  assert.equal(medianScale([4, null]), 4, 'a lone value scales its pair to 1');
  assert.equal(medianScale([]), 1);
  assert.equal(medianScale([null, null]), 1);
  assert.equal(medianScale([0]), 1);
  assert.equal(medianScale([0, 0, 0]), 1);
  const distances = Object.fromEntries(BLOCK_KEYS.map((k) => [k, null]));
  distances.V = 2; distances.A = 4;
  const fused = fuse(distances, { V: 2, A: 2 }, weightsFor('lumbar', 'all'));
  assert.deepEqual(fused.blocks, ['V', 'A']);
  assert.ok(Math.abs(fused.d - Math.sqrt((0.2 * 1 + 0.2 * 4) / 0.4)) < 1e-12);
  assert.equal(fuse(Object.fromEntries(BLOCK_KEYS.map((k) => [k, null])), {}, weightsFor('lumbar', 'all')), null);
  assert.equal(matchScore(0), 100);
  assert.equal(matchScore(1), 37);
});

test('candidates filter by region anatomy, scope, subject and embedding need — never by coverage', () => {
  const open = study('open', { subjectId: 'S1' });
  const pool = [
    open,
    study('same-subject', { subjectId: 's1' }),
    study('partial', { geometry: lumbarGeometry({ levels: ['L3', 'L4', 'L5'], hip: false }), qc: { coverage: { partial: true, unoriented: [] } } }),
    study('angles-only', { geometry: { vertebrae: {}, s1_superior: null } }),
    cervicalStudy('neck'),
    study('hand', { workspaceFolder: '' }),
    study('unsegmented', { measurements: null, geometry: null }),
    study('demo', { source: 'demo' }),
  ];
  const ids = (list) => list.map((s) => s.id);
  assert.deepEqual(ids(candidates(open, pool, { scope: 'all', region: 'lumbar', mode: 'shape' })), ['partial', 'angles-only', 'hand']);
  assert.deepEqual(ids(candidates(open, pool, { scope: 'workspace', region: 'lumbar', mode: 'shape' })), ['partial', 'angles-only']);
  assert.deepEqual(ids(candidates(open, pool, { scope: 'all', region: 'cervical', mode: 'shape' })), ['neck']);
  assert.deepEqual(ids(candidates(open, pool, { scope: 'all', region: 'full_spine', mode: 'shape' })), []);
  const embeddings = { partial: record('partial', { lumbar: [1, 0] }) };
  assert.deepEqual(ids(candidates(open, pool, { scope: 'all', region: 'lumbar', mode: 'all', embeddings })), ['partial']);
});

test('findSimilar ranks by region, names the absent blocks, counts stale records, and defaults the region to the open film', () => {
  const open = study('open', { calibration: CALIBRATION });
  const near = study('near', { geometry: lumbarGeometry({ dx: 3 }), calibration: CALIBRATION });
  const far = study('far', { measurements: { PI: 75, PT: 30, SS: 45, L1PA: 20, LL: { 'L1-S1': 30 } }, geometry: lumbarGeometry({ scale: 1.3, dy: 40 }) });
  const noHip = study('nohip', { geometry: lumbarGeometry({ hip: false }), measurements: { PI: null, PT: null, SS: 38, L1PA: null, LL: { 'L1-S1': 49 } } });
  const stale = study('stale');
  const embeddings = {
    open: record('open', { lumbar: [1, 0, 0] }), near: record('near', { lumbar: [1, 0, 0] }),
    far: record('far', { lumbar: [0, 1, 0] }), stale: record('stale', { lumbar: [1, 0, 0], sha: 'old' }),
  };
  const all = findSimilar(open, [open, near, far, noHip, stale], { scope: 'all', mode: 'all', embeddings });
  assert.equal(all.region, 'lumbar');
  // near and stale both sit at distance 0 on every block they share with the open film (stale is the
  // same geometry; its differing model only removes C), so they tie and sort by id; far's angles differ.
  assert.deepEqual(all.matches.map((m) => m.study.id), ['near', 'stale', 'far']);
  assert.equal(all.stale, 1);
  assert.equal(all.total, 3);
  assert.deepEqual(all.matches[0].blocks, ['V', 'H', 'A', 'SL', 'D', 'C']);
  assert.deepEqual(all.matches[0].absent, []);
  assert.deepEqual(all.matches[1].absent, ['D', 'C'], 'stale has another model and no calibration');
  assert.deepEqual(all.matches[2].absent, ['D'], 'far is uncalibrated');
  const shape = findSimilar(open, [open, near, far, noHip, stale], { scope: 'all', mode: 'shape' });
  // Under Shape only V, H and D count, and every candidate is a translated or scaled copy of the open film's
  // shape: near, nohip (on V alone) and stale sit at exactly 0 and tie by id; far, whose angles differ, is a
  // shape match too (within float noise), so its place is not asserted.
  assert.deepEqual(shape.matches.map((m) => m.study.id).filter((id) => id !== 'far'), ['near', 'nohip', 'stale']);
  assert.ok(shape.matches.every((m) => m.d < 1e-9), 'angles do not enter the Shape ranking');
  assert.ok(shape.matches.some((m) => m.study.id === 'nohip' && m.absent.includes('H') && m.absent.includes('D')));
  assert.equal(shape.stale, 0);
  const alignment = findSimilar(open, [open, near, far, noHip], { scope: 'all', mode: 'alignment' });
  assert.equal(alignment.matches.at(-1).study.id, 'far');
  assert.ok(alignment.matches.some((m) => m.study.id === 'nohip' && m.blocks.includes('A')), 'two shared angles are enough for A');
  // Spec decision 15: ten cards by default, the rest counted in total.
  const many = Array.from({ length: 11 }, (_, i) => study(`m${i}`, { geometry: lumbarGeometry({ dx: i }) }));
  const ten = findSimilar(open, [open, ...many], { scope: 'all', mode: 'shape' });
  assert.equal(ten.matches.length, 10);
  assert.equal(ten.total, 11);
});

test('findSimilar under full_spine lists the absent cervical blocks for a film whose neck was not found', () => {
  const open = fullSpine('open', { study: { calibration: CALIBRATION } });
  const neckless = fullSpine('neckless', { study: { calibration: CALIBRATION } });
  for (const level of ['C2', 'C3', 'C4', 'C5', 'C6', 'C7']) delete neckless.geometry.vertebrae[level];
  neckless.geometry.c2_centroid = null;
  neckless.geometry.c7_centroid = null; // no C7, no global SVA either
  const embeddings = { open: record('open', { lumbar: [1, 0], cervical: [0, 1], whole: [1, 1], region: 'full_spine' }),
    neckless: record('neckless', { lumbar: [1, 0], whole: [1, 1], region: 'full_spine' }) };
  const { matches, region } = findSimilar(open, [open, neckless], { scope: 'all', mode: 'all', embeddings });
  assert.equal(region, 'full_spine');
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].absent, ['VC', 'AC', 'BC', 'SC', 'B', 'CC']);
  assert.ok(matches[0].blocks.includes('W') && matches[0].blocks.includes('V'));
});

test('the whole-spine balance: globalBalance is finite on a calibrated full-spine film, B is present for a calibrated pair, and B and BC are absent when one film is uncalibrated', () => {
  const a = fullSpine('a', { study: { calibration: CALIBRATION } });
  const b = fullSpine('b', { study: { calibration: CALIBRATION } });
  b.geometry.c7_centroid = [40, 370]; // 20 px further back at 0.5 mm/px: 10 mm more C7-S1 SVA
  assert.ok(Math.abs(globalBalance(a)[0] - 25) < 1e-9, 'C7 50 px behind S1 posterior at 0.5 mm/px');
  const d = pairDistances(studyBlocks(a, null), studyBlocks(b, null), weightsFor('full_spine', 'all'));
  assert.ok(Math.abs(d.B - 10) < 1e-9, `B is the SVA difference in millimetres: ${d.B}`);
  assert.ok(Number.isFinite(d.BC), 'both calibrated: the cervical balance compares');
  const e = pairDistances(studyBlocks(a, null), studyBlocks(fullSpine('u'), null), weightsFor('full_spine', 'all'));
  assert.equal(e.B, null, 'one film uncalibrated: no global balance');
  assert.equal(e.BC, null, 'one film uncalibrated: no cervical balance');
  assert.ok(Number.isFinite(e.AC), 'the angles still compare');
});

test('a block only two candidates share is scaled by their mean, so a calibrated pair is not buried under raw millimetres (ruling R20)', () => {
  // A calibrated open full-spine film; two calibrated candidates with the same shape and angles whose
  // C7-S1 SVA is 10 and 15 mm off (C7 20 and 30 px further back at 0.5 mm/px); uncalibrated candidates
  // (no D, BC or B) off in PI and LL. Every film carries the same embedding, so the appearance blocks
  // are present and exactly 0 (axis vectors: a normalised [1, 1] would leave 2e-16 of float noise for
  // the median to scale up). Under the old rule (scale 1 below three values) B entered as raw 10 and 15
  // and the calibrated pair scored 3% and 0%, below every uncalibrated film.
  const calibrated = (id, c7x) => {
    const s = fullSpine(id, { study: { calibration: CALIBRATION } });
    s.geometry.c7_centroid = [c7x, 370];
    return s;
  };
  const uncalibrated = (id, deg) => fullSpine(id, { study: {
    measurements: { PI: 50 + deg, PT: 12, SS: 38, L1PA: 8, LL: { 'L1-S1': 49 + deg }, region: 'full_spine', GLOBAL_SVA_MM: null, GLOBAL_SVA_PX: null },
  } });
  const rank = (pool) => {
    const embeddings = Object.fromEntries(pool.map((s) => [s.id, record(s.id, { lumbar: [1, 0], cervical: [0, 1], whole: [1, 0], region: 'full_spine' })]));
    return findSimilar(pool[0], pool, { scope: 'all', mode: 'all', embeddings }).matches;
  };
  // The probe's own spread, 10-20 degrees: the calibrated films interleave by how far off they are.
  const spread = rank([calibrated('open', 60), calibrated('mm10', 40), calibrated('mm15', 30),
    uncalibrated('deg10', 10), uncalibrated('deg15', 15), uncalibrated('deg20', 20)]);
  assert.deepEqual(spread.map((m) => m.study.id), ['deg10', 'mm10', 'deg15', 'mm15', 'deg20']);
  assert.ok(spread.filter((m) => m.study.id.startsWith('mm')).every((m) => m.blocks.includes('B') && m.match >= 60),
    spread.map((m) => `${m.study.id} ${m.match}%`).join(', '));
  // Three uncalibrated films all 15 degrees off: the pair still scores like its neighbours, not 3% and 0%.
  const level = rank([calibrated('open', 60), calibrated('mm10', 40), calibrated('mm15', 30),
    uncalibrated('degA', 15), uncalibrated('degB', 15), uncalibrated('degC', 15)]);
  assert.ok(level.filter((m) => m.study.id.startsWith('mm')).every((m) => m.match >= 60),
    level.map((m) => `${m.study.id} ${m.match}%`).join(', '));
});

test('openReason names why the open study has no cards', () => {
  const embeddings = { a: record('a', { lumbar: [1, 0] }) };
  assert.equal(openReason(study('a', { measurements: null, geometry: null }), 'lumbar', 'all', embeddings), 'unsegmented');
  assert.equal(openReason(study('a'), 'cervical', 'shape', embeddings), 'no-region');
  assert.equal(openReason(study('b'), 'lumbar', 'all', embeddings), 'no-embedding');
  // Landmarks present (so the film has lumbar anatomy) but no angle: the measured ones null and the
  // segmental readers refusing endplates outside a 10 px image.
  assert.equal(openReason(study('a', { measurements: { PI: null, PT: null, SS: null, L1PA: null, LL: {} }, geometry: { ...lumbarGeometry(), image_width: 10, image_height: 10 } }), 'lumbar', 'alignment', embeddings), 'no-alignment');
  assert.equal(openReason(study('a'), 'lumbar', 'all', embeddings), null);
  // Three levels and S1 are the fourteen points V needs; one level and S1 (six points) leave Shape nothing.
  assert.equal(openReason(study('a', { geometry: lumbarGeometry({ levels: ['L3', 'L4', 'L5'], hip: false }), qc: { coverage: { partial: true, unoriented: [] } } }), 'lumbar', 'shape', embeddings), null, 'partial is not a reason any more');
  assert.equal(openReason(study('a', { geometry: lumbarGeometry({ levels: ['L5'], hip: false }), qc: { coverage: { partial: true, unoriented: [] } } }), 'lumbar', 'shape', embeddings), 'no-blocks', 'below the shape floor, by its points, not its flag');
});

test("openReason is 'no-blocks' when the open film has none of the mode's blocks for the region against itself (ruling R21)", () => {
  // L1-L5 and no S1, uncalibrated: V needs S1, H follows V, D needs a scale -- nothing to rank on by shape.
  const noS1 = study('n', { geometry: lumbarGeometry({ s1: false }) });
  assert.equal(openReason(noS1, 'lumbar', 'shape', {}), 'no-blocks');
  assert.equal(openReason(noS1, 'lumbar', 'alignment', {}), null, 'its angles rank under Alignment');
  // A record without the region's crop has nothing for Appearance to compare.
  const neckOnly = { n: record('n', { cervical: [0, 1] }) };
  assert.equal(openReason(noS1, 'lumbar', 'appearance', neckOnly), 'no-blocks');
  assert.equal(openReason(study('a'), 'lumbar', 'shape', {}), null);
});

test('heldRegion keeps the pick made on the open film while the film has that anatomy, else the film’s own region', () => {
  const lumbar = study('a');
  const full = fullSpine('f');
  assert.equal(heldRegion(null, lumbar), 'lumbar');
  assert.equal(heldRegion({ openId: 'f', region: 'lumbar' }, full), 'lumbar');
  assert.equal(heldRegion({ openId: 'f', region: 'cervical' }, full), 'cervical');
  assert.equal(heldRegion({ openId: 'other', region: 'lumbar' }, full), 'full_spine', 'a pick made on another film is not this one’s');
  assert.equal(heldRegion({ openId: 'a', region: 'cervical' }, lumbar), 'lumbar', 'a pick the film has no anatomy for falls back');
  assert.equal(heldRegion({ openId: 'a', region: 'full_spine' }, lumbar), 'lumbar');
  assert.equal(heldRegion({ openId: 'a', region: 'sideways' }, lumbar), 'lumbar');
});

test('angleLine follows the region: lumbar angles, or the cervical Cobb and SVA', () => {
  const open = study('a', { calibration: CALIBRATION });
  const other = study('b', { measurements: { PI: 60, PT: 15, SS: 45, L1PA: 8, LL: { 'L1-S1': 44 } } });
  assert.equal(angleLine(open, other, 'lumbar'), 'PI +10 \u00B7 LL \u22125 \u00B7 PT +3 \u00B7 SS +7');
  assert.equal(angleLine(open, other, 'full_spine'), 'PI +10 \u00B7 LL \u22125 \u00B7 PT +3 \u00B7 SS +7');
  const neckA = cervicalStudy('c', { study: { calibration: CALIBRATION } });
  const neckB = cervicalStudy('d', { geometry: { dx: 20 }, study: { calibration: CALIBRATION } });
  assert.match(angleLine(neckA, neckB, 'cervical'), /^Cobb [+\u2212]?\d+ \u00B7 SVA [+\u2212]?\d+$/);
  const uncalibrated = cervicalStudy('e', { geometry: { dx: 20 } });
  assert.match(angleLine(neckA, uncalibrated, 'cervical'), /SVA \u2014$/);
});

test('subjectFilms is stage 1', () => {
  const a = study('a', { subjectId: 'S1' });
  const b = study('b', { subjectId: 's1' });
  assert.deepEqual(subjectFilms(a, [a, b, study('c')]).map((s) => s.id), ['a', 'b']);
  assert.deepEqual(subjectFilms(study('d'), [a]).map((s) => s.id), ['d']);
});
