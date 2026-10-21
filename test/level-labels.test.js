/**
 * (2026-10-13, gate feedback G7; plan D20, rulings R43 and R44) The level editor's label plates: where each sits
 * (outside its body, on the posterior side) and the pure parts of the plate drag. renderer/viewer/level-labels.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  labelAnchor, labelPlacement, plateAnteriorSide, plateOffset, plateAt, movePlate, resetPlate,
} from '../renderer/viewer/level-labels.js';
import { openEditor, setLevelGeometry, toggleVisible } from '../renderer/data/levels.js';

// A body facing LEFT (anterior at the smaller x): SA [30,20], SP [60,20], IA [30,50], IP [60,50].
const LEFT_BODY = { superior: [[30, 20], [60, 20]], inferior: [[30, 50], [60, 50]] };
// Its mirror, facing RIGHT (the owner's film): the posterior edge is on the left.
const RIGHT_BODY = { superior: [[90, 20], [60, 20]], inferior: [[90, 50], [60, 50]] };
// A body whose posterior edge is within 1 px of its corners' mean x: the side cannot be read from it.
const THIN_BODY = { superior: [[40, 20], [40.5, 20]], inferior: [[40, 50], [40.5, 50]] };

function emptyEditor() {
  return openEditor({ study: { geometry: null }, region: 'auto', modelGeometry: null, saved: null });
}

// ---------- labelPlacement ----------

test('a body facing left: the anchor is the posterior edge\'s middle and the plate extends right, away from the body', () => {
  assert.deepEqual(labelPlacement('L3', LEFT_BODY, null), { anchor: [60, 35], side: 1 });
  assert.deepEqual(labelPlacement('C4', LEFT_BODY, 'right'), { anchor: [60, 35], side: 1 }, 'the body outranks the film\'s side');
});

test('a body facing right: the posterior edge is on the left and the plate extends left (-1)', () => {
  assert.deepEqual(labelPlacement('L3', RIGHT_BODY, null), { anchor: [60, 35], side: -1 });
  assert.deepEqual(labelPlacement('L3', RIGHT_BODY, 'left'), { anchor: [60, 35], side: -1 }, 'the body outranks the film\'s side');
  // A tilted body: the sign of (posterior middle x - the four corners' mean x).
  const tilted = { superior: [[371, 305], [255, 307]], inferior: [[373, 373], [257, 375]] };
  assert.deepEqual(labelPlacement('L3', tilted, null), { anchor: [256, 341], side: -1 });
});

test('a body whose posterior edge is under 1 px from its middle falls back to the side opposite the film\'s anterior', () => {
  assert.equal(labelPlacement('L3', THIN_BODY, 'right').side, -1);
  assert.equal(labelPlacement('L3', THIN_BODY, 'left').side, 1);
  assert.equal(labelPlacement('L3', THIN_BODY, null).side, 1, 'unknown: +1');
});

test('an endplate: the anchor is SP and the side is the sign of SP x - SA x', () => {
  assert.deepEqual(labelPlacement('S1', { superior: [[30, 50], [60, 56]] }, 'right'), { anchor: [60, 56], side: 1 });
  assert.deepEqual(labelPlacement('S1', { superior: [[60, 50], [30, 56]] }, 'left'), { anchor: [30, 56], side: -1 });
  assert.deepEqual(labelPlacement('T1', { superior: [[60, 50], [30, 56]] }, null), { anchor: [30, 56], side: -1 });
});

test('a near-vertical endplate (SP x - SA x under 1 px) falls back to the film: right -> -1, left -> +1, unknown -> +1', () => {
  const upright = { superior: [[45, 40], [45.5, 70]] };
  assert.deepEqual(labelPlacement('S1', upright, 'right'), { anchor: [45.5, 70], side: -1 });
  assert.deepEqual(labelPlacement('S1', upright, 'left'), { anchor: [45.5, 70], side: 1 });
  assert.deepEqual(labelPlacement('S1', upright, null), { anchor: [45.5, 70], side: 1 });
  assert.equal(labelPlacement('S1', { superior: [[45, 40], [44.2, 70]] }, 'left').side, 1, 'a difference of -0.8 px falls back too');
  assert.equal(labelPlacement('S1', { superior: [[45, 40], [44, 70]] }, 'left').side, -1, 'exactly -1 px is read from the endplate');
  assert.equal(labelPlacement('S1', { superior: [[44, 40], [45, 70]] }, 'right').side, 1, 'exactly +1 px is read from the endplate');
});

test('T4\'s centroid always takes the film\'s side: right -> -1, left -> +1, unknown -> +1', () => {
  assert.deepEqual(labelPlacement('T4', { centroid: [45, 30] }, 'right'), { anchor: [45, 30], side: -1 });
  assert.deepEqual(labelPlacement('T4', { centroid: [45, 30] }, 'left'), { anchor: [45, 30], side: 1 });
  for (const unknown of [null, undefined, '', 'up']) {
    assert.deepEqual(labelPlacement('T4', { centroid: [45, 30] }, unknown), { anchor: [45, 30], side: 1 }, String(unknown));
  }
});

test('C2: the anchor is IP and the side is the sign of IP x - the centroid x; under 1 px falls back', () => {
  assert.deepEqual(labelPlacement('C2', { inferior: [[30, 50], [60, 54]], centroid: [45, 30] }, 'right'), { anchor: [60, 54], side: 1 });
  assert.deepEqual(labelPlacement('C2', { inferior: [[60, 50], [30, 54]], centroid: [45, 30] }, 'left'), { anchor: [30, 54], side: -1 });
  assert.equal(labelPlacement('C2', { inferior: [[30, 50], [45.4, 54]], centroid: [45, 30] }, 'right').side, -1);
  assert.equal(labelPlacement('C2', { inferior: [[30, 50], [45.4, 54]], centroid: [45, 30] }, null).side, 1);
});

test('the femoral heads have no plate, and a geometry that is not what its kind says has none either', () => {
  assert.equal(labelPlacement('FH1', { center: [10, 10], radius: 5, rim: null }, 'right'), null);
  assert.equal(labelPlacement('FH2', { center: [10, 10], radius: 5, rim: null }, null), null);
  assert.equal(labelPlacement('L3', null, null), null);
  assert.equal(labelPlacement('L3', { superior: [[30, 20]] }, null), null, 'a body whose only endplate is not a pair');
  assert.equal(labelPlacement('C2', { inferior: [[30, 50]] }, null), null, 'C2 with neither a pair nor a centroid');
  assert.equal(labelPlacement('S1', { superior: [[30, 50]] }, null), null);
  assert.equal(labelPlacement('T4', { centroid: [NaN, 3] }, null), null);
  assert.equal(labelPlacement('XX', LEFT_BODY, null), null, 'not a level');
});

test('the anchor is a fresh point: placing never hands out, or changes, the geometry\'s own arrays', () => {
  const endplate = { superior: [[30, 50], [60, 56]] };
  const placement = labelPlacement('S1', endplate, null);
  assert.notEqual(placement.anchor, endplate.superior[1]);
  placement.anchor[0] = 999;
  assert.deepEqual(endplate.superior[1], [60, 56]);
  const centroid = { centroid: [45, 30] };
  assert.notEqual(labelPlacement('T4', centroid, null).anchor, centroid.centroid);
});

test('labelAnchor keeps the anchors the plates had before G7', () => {
  assert.deepEqual(labelAnchor('L3', LEFT_BODY), [60, 35]);
  assert.deepEqual(labelAnchor('C2', { inferior: [[30, 50], [60, 54]], centroid: [45, 30] }), [60, 54]);
  assert.deepEqual(labelAnchor('S1', { superior: [[30, 50], [60, 56]] }), [60, 56]);
  assert.deepEqual(labelAnchor('T4', { centroid: [45, 30] }), [45, 30]);
  assert.equal(labelAnchor('FH1', { center: [1, 1], radius: 1 }), null);
});

// ---------- plateAnteriorSide ----------

test('the film\'s anterior side for the plates: the stored geometry\'s, then the study\'s, then the placed levels, else null', () => {
  const facingRight = setLevelGeometry(emptyEditor(), 'L3', RIGHT_BODY);
  assert.equal(plateAnteriorSide({ geometry: { anterior_side: 'left' }, anteriorSide: 'right' }, facingRight), 'left');
  assert.equal(plateAnteriorSide({ geometry: { anterior_side: null }, anteriorSide: 'right' }, null), 'right');
  assert.equal(plateAnteriorSide({ geometry: {}, anteriorSide: 'up' }, facingRight), 'right', 'the placed L3 faces right');
  assert.equal(plateAnteriorSide({ geometry: null, anteriorSide: null }, setLevelGeometry(emptyEditor(), 'L3', LEFT_BODY)), 'left');
  assert.equal(plateAnteriorSide({ geometry: null }, toggleVisible(facingRight, 'L3')), null, 'a hidden level says nothing');
  assert.equal(plateAnteriorSide(null, null), null);
  assert.equal(plateAnteriorSide({ geometry: null, anteriorSide: null }, emptyEditor()), null, 'a side is never guessed');
});

// ---------- the drag's pure parts ----------

test('plateOffset reads a level\'s offset as a fresh pair, and [0, 0] for none or a bad one', () => {
  const positions = { L3: [5, -4], L2: ['a', 2], L1: [NaN, 1], S1: [1] };
  const offset = plateOffset(positions, 'L3');
  assert.deepEqual(offset, [5, -4]);
  assert.notEqual(offset, positions.L3);
  for (const code of ['L2', 'L1', 'S1', 'L4']) assert.deepEqual(plateOffset(positions, code), [0, 0], code);
  assert.deepEqual(plateOffset(null, 'L3'), [0, 0]);
  assert.deepEqual(plateOffset(undefined, 'L3'), [0, 0]);
});

test('plateAt finds the plate under an image point, edges included, the last drawn on top; else null', () => {
  const plates = [
    { code: 'L2', x: 10, y: 10, width: 20, height: 10 },
    { code: 'L3', x: 25, y: 15, width: 20, height: 10 },
  ];
  assert.equal(plateAt(plates, [12, 12]).code, 'L2');
  assert.equal(plateAt(plates, [27, 17]).code, 'L3', 'where they overlap, the later plate (drawn on top) wins');
  assert.equal(plateAt(plates, [45, 25]).code, 'L3', 'the far corner is inside');
  assert.equal(plateAt(plates, [10, 10]).code, 'L2', 'the near corner is inside');
  assert.equal(plateAt(plates, [9.9, 12]), null);
  assert.equal(plateAt(plates, [46, 20]), null);
  assert.equal(plateAt([], [12, 12]), null);
  assert.equal(plateAt(null, [12, 12]), null);
});

test('movePlate sets a level\'s offset to its offset at the press plus the pointer\'s travel since, on a new object', () => {
  const positions = Object.freeze({ L1: [1, 2] });
  const next = movePlate(positions, 'L3', [5, -4], [100, 100], [130, 90]);
  assert.deepEqual(next, { L1: [1, 2], L3: [35, -14] });
  assert.notEqual(next, positions);
  assert.deepEqual(positions, { L1: [1, 2] }, 'the old map is not changed');
  assert.deepEqual(movePlate(null, 'L3', [0, 0], [10, 10], [12, 7]), { L3: [2, -3] });
  assert.deepEqual(movePlate(next, 'L3', [35, -14], [0, 0], [0, 0]), { L1: [1, 2], L3: [35, -14] }, 'no travel: the press offset');
});

test('resetPlate removes a level\'s offset on a new object, and hands back the same map when it had none', () => {
  const positions = Object.freeze({ L1: [1, 2], L3: [5, -4] });
  const next = resetPlate(positions, 'L3');
  assert.deepEqual(next, { L1: [1, 2] });
  assert.notEqual(next, positions);
  assert.deepEqual(positions, { L1: [1, 2], L3: [5, -4] });
  assert.equal(resetPlate(positions, 'L4'), positions, 'nothing to reset: the same reference, so nothing repaints');
  assert.equal(resetPlate(null, 'L3'), null);
});


test('a body with one endplate anchors its plate on that endplate\'s posterior corner and reads its side from the pair', () => {
  assert.deepEqual(labelPlacement('L3', { superior: [[30, 20], [60, 20]], inferior: null }, null), { anchor: [60, 20], side: 1 });
  assert.deepEqual(labelPlacement('L3', { superior: null, inferior: [[90, 50], [60, 50]] }, null), { anchor: [60, 50], side: -1 });
  assert.deepEqual(labelPlacement('L3', { superior: [[40, 20], [40.5, 20]], inferior: null }, 'right'), { anchor: [40.5, 20], side: -1 }, 'under 1 px: the film\'s side');
});

test('C2 without its pair anchors on its centroid with the film\'s side; without its centroid it reads the side from IP against IA', () => {
  assert.deepEqual(labelPlacement('C2', { inferior: null, centroid: [45, 12] }, 'right'), { anchor: [45, 12], side: -1 });
  assert.deepEqual(labelPlacement('C2', { inferior: null, centroid: [45, 12] }, null), { anchor: [45, 12], side: 1 });
  assert.deepEqual(labelPlacement('C2', { inferior: [[40, 20], [50, 20]], centroid: null }, null), { anchor: [50, 20], side: 1 });
  assert.equal(labelPlacement('C2', { inferior: null, centroid: null }, null), null);
});
