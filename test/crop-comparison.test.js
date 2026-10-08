import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparisonRegions, validWindow } from '../renderer/data/crop-comparison.js';

test('comparison uses accepted source-image windows and reports per-region fallback', () => {
  const regions = comparisonRegions({ framing: {
    cervical_window: [10, 20, 70, 120], lumbar_window: [20, 140, 90, 250],
    cervical: { method_used: 'model' }, lumbar: { method_used: 'search_fallback' },
  } });
  assert.deepEqual(regions.map(({ name, window, methodLabel }) => [name, window, methodLabel]), [
    ['Cervical', [10, 20, 70, 120], 'Trained model'],
    ['Lumbar', [20, 140, 90, 250], 'Crop search fallback'],
  ]);
});

test('missing or malformed windows are not drawn as accepted crops', () => {
  assert.equal(validWindow([0, 0, 50, 100]), true);
  assert.equal(validWindow([50, 0, 0, 100]), false);
  assert.equal(validWindow([0, 0, Infinity, 100]), false);
  const regions = comparisonRegions({ framing: { cervical_window: null, lumbar_window: [4, 4, 4, 20] } });
  assert.deepEqual(regions.map(({ window, methodLabel }) => [window, methodLabel]), [
    [null, 'No accepted crop'], [null, 'No accepted crop'],
  ]);
});

test('a rejected model proposal remains visible beside search fallback in source coordinates', () => {
  const regions = comparisonRegions({ framing: {
    canonical_mirror: true,
    cervical_window: [300, 20, 500, 220],
    cervical: { method_used: 'search_fallback', model_proposals: [[50, 25, 220, 245]] },
    lumbar_window: null,
    lumbar: { method_used: 'search_fallback', model_proposals: [[80, 300, 270, 550]] },
  } }, 600);
  assert.deepEqual(regions[0].candidateWindow, [380, 25, 550, 245]);
  assert.deepEqual(regions[1].candidateWindow, [330, 300, 520, 550]);
  assert.equal(regions[1].methodLabel, 'No accepted crop');
});
