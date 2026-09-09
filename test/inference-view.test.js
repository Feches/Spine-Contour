import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferenceView } from '../renderer/data/inference-view.js';
import { VIEW_SUGGESTIONS } from '../renderer/data/timepoints.js';

test('all supported positions and legacy lateral labels map to the lateral model', () => {
  for (const view of [...VIEW_SUGGESTIONS, 'lateral', 'Lateral lumbar', 'Lumbar lateral', 'standing', 'FLEX', ' supine_lateral ']) {
    assert.equal(inferenceView(view), 'lateral', view);
  }
});

test('AP, oblique, combined and unspecified views cannot masquerade as lateral', () => {
  for (const view of ['AP', 'PA', 'oblique', 'AP/lateral', 'AP lateral', 'lateral oblique', 'unknown', '', '  ', null, undefined]) {
    assert.equal(inferenceView(view), null, String(view));
  }
});
