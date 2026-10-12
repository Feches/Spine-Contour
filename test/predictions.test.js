// isHandPlaced (2026-10-10, level editor, ruling R16 as amended): a study no model run ever produced. A run
// records both a prediction id and qc.models; a level-editor commit through /measure records neither.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isHandPlaced, hasStoredImage } from '../renderer/data/predictions.js';

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

// hasStoredImage (2026-10-12, review round 1 of gate feedback G6; ruling R42): the film is a model run's stored image,
// which Mark reviewed's label record reads with no /decode. loadFilm's step (1) restores exactly these studies.
const RESULT = { measurements: { SS: 40 }, geometry: { vertebrae: {} } };

test('hasStoredImage: a real model result, with a prediction id or (before v1.0.10) qc.models alone', () => {
  assert.equal(hasStoredImage({ source: 'real', predictionId: 'run-1', qc: null, ...RESULT }), true);
  assert.equal(hasStoredImage({ source: 'real', predictionId: null, qc: { models: { vertebrae: 'unet' } }, ...RESULT }), true);
});

test('hasStoredImage: false for a film placed by hand, one with no result, a demo and no study', () => {
  assert.equal(hasStoredImage({ source: 'real', predictionId: null, qc: { coverage: {} }, ...RESULT }), false,
    'placed by hand (R16): its stored image is its decoded original');
  assert.equal(hasStoredImage({ source: 'real', predictionId: 'run-1', qc: null, measurements: null, geometry: null }), false,
    'no result: nothing to label');
  assert.equal(hasStoredImage({ source: 'real', predictionId: 'run-1', qc: null, measurements: { SS: 40 }, geometry: null }), false,
    'measurements with no geometry are no result');
  assert.equal(hasStoredImage({ source: 'demo', predictionId: 'run-1', qc: null, ...RESULT }), false, 'a demo has no sidecar');
  assert.equal(hasStoredImage(undefined), false);
  assert.equal(hasStoredImage(null), false);
});
