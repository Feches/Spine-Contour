import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRegionChange, applyRegionChange, regionChangePrompt, regionChangeToast } from '../renderer/data/region-change.js';

const segmented = (id, region) => ({ id, source: 'real', region, geometry: { region: 'lumbar' }, measurements: { LL: 50 },
  qc: {}, predictionId: `p${id}`, reviewedAt: 1, anteriorSide: 'left', processingError: null, name: `film ${id}` });
const fresh = (id, region = 'auto') => ({ id, source: 'real', region, geometry: null, measurements: null, predictionId: null });

test('only studies whose requested region differs change, and results they hold are counted', () => {
  const plan = planRegionChange([segmented(1, 'auto'), fresh(2), segmented(3, 'cervical'), fresh(4, 'cervical')], 'cervical');
  assert.deepEqual(plan, { ids: [1, 2], unchanged: 2, cleared: 1 });
});

test('a study with no stored region counts as Auto detect', () => {
  assert.deepEqual(planRegionChange([{ id: 7, source: 'real' }], 'auto'), { ids: [], unchanged: 1, cleared: 0 });
});

test('demo studies and unknown regions are never changed', () => {
  assert.deepEqual(planRegionChange([{ ...fresh(1), source: 'demo' }], 'lumbar').ids, []);
  assert.deepEqual(planRegionChange([fresh(1)], 'thoracic').ids, []);
  const studies = [fresh(1)];
  assert.equal(applyRegionChange(studies, [1], 'thoracic'), studies);
});

test('a changed study is cleared exactly as the Analysis Region select clears it', () => {
  const before = [segmented(1, 'auto'), segmented(2, 'lumbar')];
  const after = applyRegionChange(before, [1], 'full_spine');
  assert.equal(after[1], before[1], 'untouched records keep their identity');
  assert.deepEqual(after[0], { ...before[0], region: 'full_spine', anteriorSide: null, geometry: null, measurements: null,
    qc: null, reviewedAt: null, predictionId: null, processingError: null, processingErrorAt: null });
  assert.equal(after[0].name, 'film 1');
});

test('the prompt names the count, the region and the results it clears', () => {
  assert.equal(regionChangePrompt({ ids: [1], cleared: 1 }, 'cervical'),
    'Set 1 study to Cervical? Its saved result will be cleared; segment it again.');
  assert.equal(regionChangePrompt({ ids: [1, 2, 3], cleared: 3 }, 'full_spine'),
    'Set 3 studies to Full spine? Their saved results will be cleared; segment them again.');
  assert.equal(regionChangePrompt({ ids: [1, 2, 3], cleared: 2 }, 'lumbar'),
    'Set 3 studies to Lumbar? 2 of their saved results will be cleared; segment them again.');
  assert.equal(regionChangeToast({ ids: [1, 2], unchanged: 1 }, 'auto'), 'Set 2 studies to Auto detect. 1 already was Auto detect.');
  assert.equal(regionChangeToast({ ids: [], unchanged: 2 }, 'lumbar'), 'Set 0 studies to Lumbar. 2 already were Lumbar.');
});
