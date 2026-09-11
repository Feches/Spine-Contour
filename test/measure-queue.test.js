import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMeasureQueue } from '../renderer/viewer/measure-queue.js';

function geometryWith(tag) {
  return {
    vertebrae: { L1: { superior: [[tag, 0], [1, 0]], inferior: [[0, 1], [1, 1]], quadrilateral: [[tag, 0], [1, 0], [1, 1], [0, 1]] } },
    s1_superior: [[0, 2], [1, 2]],
    l1_center: [0.5, 0.5],
    hip_midpoint: [0.5, 3],
    femoral_circles: [[0, 3, 1], [1, 3, 1]],
  };
}

// A fake store with the same getState/setState contract as renderer/store.js, and a measure()
// whose promises the test resolves or rejects by hand, in whatever order it wants.
function harness(studies = [{ id: 'A', measurements: null, geometry: null }, { id: 'B', measurements: null, geometry: null }]) {
  let state = { studies };
  const calls = [];
  const toasts = [];
  const queue = createMeasureQueue({
    measure: (request) => new Promise((resolve, reject) => { calls.push({ request, resolve, reject }); }),
    getState: () => state,
    setState: (patchOrFn) => { state = { ...state, ...(typeof patchOrFn === 'function' ? patchOrFn(state) : patchOrFn) }; },
    showToast: (message) => toasts.push(message),
    debounceMs: 10,
  });
  const study = (id) => state.studies.find((s) => s.id === id);
  return { queue, calls, toasts, study, draft: (id) => state.measurementDrafts?.[id] };
}

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('a stale response is orphaned by a later commit on the same study', async () => {
  const h = harness();
  h.queue.commitGeometry('A', geometryWith(1));
  await tick(30);
  assert.equal(h.calls.length, 1);
  h.queue.commitGeometry('A', geometryWith(2));
  await tick(30);
  assert.equal(h.calls.length, 2);
  h.calls[0].resolve({ measurements: { PI: 1 }, geometry: geometryWith(1) });
  await tick(0);
  assert.equal(h.study('A').measurements, null, 'the first response must not land');
  h.calls[1].resolve({ measurements: { PI: 2 }, geometry: geometryWith(2) });
  await tick(0);
  assert.deepEqual(h.study('A').measurements, { PI: 2 });
});

test('replaceMeasured cancels a pending call and orphans one in flight', async () => {
  const h = harness();
  h.queue.commitGeometry('A', geometryWith(1));
  h.queue.replaceMeasured('A', geometryWith(0));
  await tick(30);
  assert.equal(h.calls.length, 0, 'the pending timer was cancelled');
  h.queue.commitGeometry('A', geometryWith(2));
  await tick(30);
  assert.equal(h.calls.length, 1);
  h.queue.replaceMeasured('A', geometryWith(0));
  h.calls[0].resolve({ measurements: { PI: 9 }, geometry: geometryWith(2) });
  await tick(0);
  assert.equal(h.study('A').measurements, null, 'the in-flight response was orphaned');
});

test('committing on another study flushes the pending one immediately', async () => {
  const h = harness();
  h.queue.commitGeometry('A', geometryWith(1));
  h.queue.commitGeometry('B', geometryWith(5));
  assert.equal(h.calls.length, 1, 'A was flushed synchronously');
  assert.deepEqual(h.calls[0].request.vertebrae, geometryWith(1).vertebrae);
  await tick(30);
  assert.equal(h.calls.length, 2, 'B followed after the debounce');
  assert.deepEqual(h.calls[1].request.vertebrae, geometryWith(5).vertebrae);
});

test('a failed current call restores the last measured geometry and toasts once; a stale failure is silent', async () => {
  const h = harness();
  const known = geometryWith(0);
  h.queue.replaceMeasured('A', known);
  h.queue.commitGeometry('A', geometryWith(1));
  await tick(30);
  h.calls[0].reject(new Error('backend gone'));
  await tick(0);
  assert.equal(h.study('A').geometry, null, 'failed edits never overwrite the saved geometry');
  assert.equal(h.draft('A'), undefined, 'the failed preview is discarded');
  assert.equal(h.toasts.length, 1);
  assert.match(h.toasts[0], /not applied/);
  h.queue.commitGeometry('A', geometryWith(2));
  await tick(30);
  h.queue.commitGeometry('A', geometryWith(3));
  await tick(30);
  h.calls[1].reject(new Error('stale'));
  await tick(0);
  assert.equal(h.toasts.length, 1, 'a stale failure does not toast');
});

test('replacing study A leaves study B pending call alone', async () => {
  const h = harness();
  h.queue.commitGeometry('B', geometryWith(5));
  h.queue.replaceMeasured('A', geometryWith(0));
  await tick(30);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].request.vertebrae, geometryWith(5).vertebrae);
});

test('deleting a study cancels its draft and prevents an old response landing on a reused id', async () => {
  const h = harness();
  h.queue.commitGeometry('A', geometryWith(5));
  await tick(30);
  h.queue.replaceMeasured('A', null);
  assert.equal(h.draft('A'), undefined);
  h.calls[0].resolve({ measurements: { PI: 99 }, geometry: geometryWith(5) });
  await tick(0);
  assert.equal(h.study('A').measurements, null);
  assert.equal(h.study('A').geometry, null);
});

test('a response already in flight is superseded by a newer commit, on success and on failure', async () => {
  const h = harness();
  h.queue.replaceMeasured('A', geometryWith(0));
  h.queue.commitGeometry('A', geometryWith(1));
  await tick(30);
  assert.equal(h.calls.length, 1);
  h.queue.commitGeometry('A', geometryWith(2));
  h.calls[0].resolve({ measurements: { PI: 1 }, geometry: geometryWith(1) });
  await tick(0);
  assert.deepEqual(h.draft('A'), geometryWith(2), 'the older success did not overwrite the newer preview');
  assert.equal(h.study('A').geometry, null);
  assert.equal(h.study('A').measurements, null);
  await tick(30);
  assert.equal(h.calls.length, 2, 'the newer edit was measured');
  h.queue.commitGeometry('A', geometryWith(3));
  h.calls[1].reject(new Error('late failure'));
  await tick(0);
  assert.deepEqual(h.draft('A'), geometryWith(3), 'the older failure did not restore over the newer preview');
  assert.equal(h.toasts.length, 0, 'a superseded failure is silent');
});

test('a failure with no known measured geometry toasts without claiming a restore', async () => {
  const h = harness();
  h.queue.commitGeometry('A', geometryWith(1));
  await tick(30);
  h.calls[0].reject(new Error('backend gone'));
  await tick(0);
  assert.equal(h.study('A').geometry, null, 'unmeasured geometry is never committed');
  assert.equal(h.draft('A'), undefined);
  assert.equal(h.toasts.length, 1);
  assert.doesNotMatch(h.toasts[0], /not applied/);
  assert.match(h.toasts[0], /backend gone/);
});

// (2026-09-10, studies-table spec 8.4, site 2) a correction that lands replaces the numbers the
// review was made over, so the mark goes with them. The draft alone -- the preview before /measure
// answers -- touches nothing on the record.
test('a correction that lands clears the review mark; the draft alone does not', async () => {
  const h = harness([{ id: 'A', measurements: { PI: 1 }, geometry: geometryWith(0), reviewedAt: '2026-09-10T12:00:00.000Z' }]);
  h.queue.commitGeometry('A', geometryWith(1));
  await tick(30);
  assert.equal(h.calls.length, 1);
  assert.equal(h.study('A').reviewedAt, '2026-09-10T12:00:00.000Z');
  h.calls[0].resolve({ measurements: { PI: 2 }, geometry: geometryWith(1) });
  await tick(0);
  assert.equal(h.study('A').reviewedAt, null);
  assert.deepEqual(h.study('A').measurements, { PI: 2 });
});

test('circle corrections mark score provenance and replace coverage only after a successful measure', async () => {
  const h = harness();
  const original = geometryWith(0);
  const initialQc = { femoral: { confidence: .91 }, coverage: { partial: false } };
  h.queue.commitGeometry('A', original);
  await tick(30);
  h.calls[0].resolve({ geometry: original, measurements: { PI: 30 }, qc: initialQc });
  await tick(0);
  // Seed a saved prediction's QC, retaining a reference to prove it is not mutated.
  h.study('A').qc = initialQc;
  const partial = structuredClone(original);
  partial.femoral_circles.pop(); partial.hip_midpoint = null;
  h.queue.commitGeometry('A', partial);
  assert.equal(h.study('A').qc, initialQc);
  await tick(30);
  h.calls[1].resolve({ geometry: partial, measurements: { PI: null }, qc: { coverage: { partial: true } } });
  await tick(0);
  assert.deepEqual(h.study('A').qc.manual_edits, { landmarks: true, femoral: true });
  assert.equal(h.study('A').qc.femoral.confidence, .91);
  assert.equal(h.study('A').qc.coverage.partial, true);
  assert.equal(initialQc.coverage.partial, false);
  const saved = h.study('A');
  h.queue.commitGeometry('A', original);
  await tick(30); h.calls[2].reject(new Error('offline')); await tick(0);
  assert.equal(h.study('A'), saved, 'failed restoration cannot clear the deleted-circle warning');
});

