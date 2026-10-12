import test from 'node:test';
import assert from 'node:assert/strict';
import { annotationTargets, applyAnnotation } from '../renderer/viewer/annotation.js';

test('missing lumbar body and S1 can be added without mutating existing geometry', () => {
  const source = { vertebrae: {}, s1_superior: null, femoral_circles: [], l1_center: null, hip_midpoint: null };
  const target = annotationTargets(source).find(t => t.id === 'L1');
  const result = applyAnnotation(source, target, [[20, 10], [50, 12], [48, 40], [22, 38]]);
  assert.deepEqual(source.vertebrae, {});
  assert.deepEqual(result.l1_center, [35, 25]);
  assert.ok(!annotationTargets(result).some(t => t.id === 'L1'));
  const s1 = annotationTargets(result).find(t => t.id === 'S1');
  assert.deepEqual(applyAnnotation(result, s1, [[20, 80], [50, 85]]).s1_superior, [[20, 80], [50, 85]]);
});
test('cervical partial endplates preserve predictions and C2 requests inferior points only', () => {
  const source = { region: 'cervical', vertebrae: { C7: { superior: [[20, 10], [50, 12]], inferior: null, quadrilateral: null } }, c2_centroid: null };
  assert.deepEqual(annotationTargets(source).find(t => t.id === 'C2').corners, ['IA', 'IP']);
  const target = annotationTargets(source).find(t => t.id === 'C7');
  const result = applyAnnotation(source, target, [[48, 40], [22, 38]]);
  assert.deepEqual(result.vertebrae.C7.superior, source.vertebrae.C7.superior);
  assert.equal(result.vertebrae.C7.quadrilateral.length, 4);
  assert.ok(!annotationTargets(source).some(t => t.id === 'L1'));
});
test('reject incomplete, crossed, degenerate and stale annotations', () => {
  const source = { vertebrae: {}, s1_superior: null };
  const target = annotationTargets(source)[0];
  assert.throws(() => applyAnnotation(source, target, [[0, 0]]), /every requested/);
  assert.throws(() => applyAnnotation(source, target, [[0, 0], [10, 10], [0, 10], [10, 0]]), /without crossing/);
  assert.throws(() => applyAnnotation(source, target, [[0, 0], [0, 0], [10, 10], [0, 10]]), /distinct/);
  const result = applyAnnotation(source, target, [[0, 0], [10, 0], [10, 10], [0, 10]]);
  assert.throws(() => applyAnnotation(result, target, []), /changed/);
});
test('full spine exposes missing centroids and derives C7 center from added body', () => {
  const source = { region: 'full_spine', vertebrae: {}, s1_superior: null };
  const targets = annotationTargets(source);
  assert.ok(targets.some(t => t.id === 'C7-centroid'));
  const result = applyAnnotation(source, targets.find(t => t.id === 'C7'), [[20, 10], [50, 10], [50, 40], [20, 40]]);
  assert.deepEqual(result.c7_centroid, [35, 25]);
  assert.ok(!annotationTargets(result).some(t => t.id === 'C7-centroid'));
});
test('explicit missing C7 centroid is not replaced by the existing body average', () => {
  const source = { region: 'full_spine', vertebrae: { C7: { superior: [[10, 10], [30, 10]], inferior: [[10, 30], [30, 30]], quadrilateral: [[10, 10], [30, 10], [30, 30], [10, 30]] } } };
  const target = annotationTargets(source).find(t => t.id === 'C7-centroid');
  assert.deepEqual(applyAnnotation(source, target, [[21, 22]]).c7_centroid, [21, 22]);
});
