// isHandPlaced (2026-10-10, level editor, ruling R16 as amended): a study no model run ever produced. A run
// records both a prediction id and qc.models; a level-editor commit through /measure records neither.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isHandPlaced } from '../renderer/data/predictions.js';

test('isHandPlaced: no prediction id and no qc.models is a study no model run produced', () => {
  assert.equal(isHandPlaced({ predictionId: null, qc: null }), true);
  assert.equal(isHandPlaced({ qc: null }), true, 'an absent id reads as none');
  assert.equal(isHandPlaced({ predictionId: null, qc: { coverage: { partial: true }, manual_edits: { landmarks: true } } }), true,
    'the qc a level-editor commit writes has no models');
});

test('isHandPlaced: a run before v1.0.10 has qc.models but no prediction id, and is not hand-placed', () => {
  assert.equal(isHandPlaced({ predictionId: null, qc: { models: { vertebrae: 'unet' } } }), false);
});

test('isHandPlaced: a prediction id always means a model run', () => {
  assert.equal(isHandPlaced({ predictionId: 'run-1', qc: null }), false);
  assert.equal(isHandPlaced({ predictionId: 'run-1', qc: { models: { vertebrae: 'unet' } } }), false);
});
