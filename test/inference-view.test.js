import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferenceView } from '../renderer/data/inference-view.js';
import { VIEW_SUGGESTIONS } from '../renderer/data/timepoints.js';

test('all supported positions and legacy lateral labels map to the lateral model', () => {
  for (const view of [...VIEW_SUGGESTIONS, 'lateral', 'Lateral lumbar', 'Lumbar lateral', 'standing', 'FLEX', ' supine_lateral ']) {
    assert.equal(inferenceView(view), 'lateral', view);
  }
});

test('AP, oblique and combined views cannot masquerade as lateral', () => {
  for (const view of ['AP', 'PA', 'oblique', 'AP/lateral', 'AP lateral', 'lateral oblique']) {
    assert.equal(inferenceView(view), null, String(view));
  }
});

// (2026-10-19) An Unknown view is the backend's to classify during the run (spec 5.2), so it passes
// the gate; only a view a person set to something explicitly non-lateral is refused before the run.
test('a missing, blank or Unknown view passes the gate as lateral', () => {
  for (const view of [null, undefined, '', '  ', 'unknown', 'Unknown', ' UNKNOWN ']) {
    assert.equal(inferenceView(view), 'lateral', String(view));
  }
});
