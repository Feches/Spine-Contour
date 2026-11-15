import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMarks, neckBox, s1Frame, regionForMarks, addMarkPoint, marksSummary } from '../renderer/data/crop-marks.js';
import { validate } from '../renderer/data/persistence.js';

const S1 = [[300, 1500], [380, 1480]];
const NECK = [[250, 200], [270, 520]];

test('marks keep only complete two-point marks', () => {
  assert.deepEqual(normalizeMarks({ s1: S1, neck: [[1, 2]] }), { s1: S1, neck: null });
  assert.equal(normalizeMarks({ s1: null, neck: null }), null);
  assert.equal(normalizeMarks({ s1: [[1, 2], [3, Number.NaN]] }), null);
  assert.equal(normalizeMarks('nope'), null);
});

test('the previews match the backend crops exactly, clipped at the film edges', () => {
  // Pinned from backend/region_hints.neck_box and framing.reframe (+15% up, as lumbar_windows reads it) on (2000, 800).
  assert.deepEqual(neckBox(NECK, 800, 2000), [100, 200, 420, 520]);
  assert.deepEqual(s1Frame(S1, 800, 2000), [0, 600, 725, 1927]);
  assert.deepEqual(s1Frame([[100, 300], [160, 330]], 800, 2000), [0, 0, 443, 671]);
  assert.deepEqual(s1Frame([[700, 1900], [790, 1880]], 800, 2000), [315, 951, 800, 2000]);
  assert.equal(s1Frame([[1, 1], [2, 2]], 800, 2000), null);
});

test('a neck mark runs full spine; an S1 mark keeps the region, except cervical', () => {
  assert.equal(regionForMarks('lumbar', { s1: null, neck: NECK }), 'full_spine');
  assert.equal(regionForMarks('lumbar', { s1: S1, neck: null }), 'lumbar');
  assert.equal(regionForMarks('auto', { s1: S1, neck: null }), 'auto');
  assert.equal(regionForMarks('cervical', { s1: S1, neck: null }), 'auto');
});

test('clicks fill a mark, and a third click starts it again', () => {
  let marks = { s1: null, neck: null };
  marks = addMarkPoint(marks, 's1', [1, 2]);
  marks = addMarkPoint(marks, 's1', [3, 4]);
  assert.deepEqual(marks.s1, [[1, 2], [3, 4]]);
  assert.deepEqual(addMarkPoint(marks, 's1', [5, 6]).s1, [[5, 6]]);
  assert.equal(marksSummary(marks), 'lumbar crop from S1');
  assert.equal(marksSummary({ s1: S1, neck: NECK }), 'lumbar crop from S1 and neck crop from C2–C7');
});

test('saved studies keep their crop marks and drop malformed ones', () => {
  const entry = (regionHints) => ({ version: 1, studies: [{ id: 'SP-0001', source: 'real', fileName: 'a.png',
    addedAt: '2026-11-12T00:00:00.000Z', region: 'full_spine', regionHints }] });
  const ok = validate(entry({ s1: S1, neck: null }));
  assert.deepEqual((ok.studies ?? ok)[0].regionHints, { s1: S1, neck: null });
  const bad = validate(entry({ s1: 'x' }));
  assert.equal((bad.studies ?? bad)[0].regionHints, null);
});
