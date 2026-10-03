/**
 * segmentStudy stores a failed attempt as a plain sentence with its time (issue #39;
 * docs/superpowers/specs/2026-10-01-failed-status-port-design.md sections 4 and 5). The window-stub
 * harness of test/automatic-detection.test.js: the bridge is stubbed on globalThis.window and the
 * store is put back after every test. Every film is SP-97nn, an id no other test file parks a
 * payload under, and no two tests here share one.
 *
 * Not covered here: the success commit and changeRegion clearing both fields (the harness cannot
 * decode images, and changeRegion lives inside render()); the smoke suites cover both.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { newStudy } from '../renderer/screens/studies.js';
import { segmentStudy, setFilePayload } from '../renderer/screens/analysis.js';
import { BACKEND_STOPPED_REASON, FILE_NOT_FOUND_REASON } from '../renderer/data/failure.js';
import { deriveStatus } from '../renderer/data/status.js';
import { unsupportedViewReason } from '../renderer/data/inference-view.js';
import { regionRunReason } from '../renderer/data/cervical.js';
import { getState, setState, subscribe } from '../renderer/store.js';

const DETECTION = 'Automatic film detection was inconclusive. Choose cervical, lumbar or standing / full spine manually.';
const SOCKET = 'connect ECONNREFUSED 127.0.0.1:53211';
const ADDED_AT = '2026-10-01T08:00:00.000Z';
const OLD_AT = '2026-09-28T10:00:00.000Z';
const OLD_REASON = 'Detected a cervical film. Choose anterior left or right, then segment again.';
const BYTES = new Uint8Array([1]);

// A real, unmeasured film with no path and nothing parked, unless the patch says otherwise.
function film(id, patch = {}) {
  return { ...newStudy({ id, fileName: `${id}.png`, filePath: null }), addedAt: ADDED_AT, ...patch };
}

const record = (id) => getState().studies.find((s) => s.id === id);
const unreachable = async () => assert.fail('this run must not reach the backend');
const isIsoTime = (value) => typeof value === 'string' && new Date(value).toISOString() === value;

// A single run toasts, and showToast arms a dismiss timer of up to 8 s that would hold this file's
// process open; the mocked setTimeout never fires and goes with the test.
async function withBridge(t, bridge, studies, body) {
  const saved = getState(), oldWindow = globalThis.window;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.window = { spineContour: bridge };
  try {
    setState({ studies, running: null, runStage: null, batch: null, deletingStudies: false, toast: '' });
    await body();
  } finally { globalThis.window = oldWindow; setState(saved); }
}

test('a backend sentence is stored verbatim with its time, in a batch and in a single run', async (t) => {
  const batchFilm = film('SP-9700'), singleFilm = film('SP-9701');
  await withBridge(t, { predict: async () => { throw new Error(DETECTION); } }, [batchFilm, singleFilm], async () => {
    setFilePayload(batchFilm.id, BYTES);
    setFilePayload(singleFilm.id, BYTES);
    assert.deepEqual(await segmentStudy(batchFilm.id, { batch: true }), { ok: false, reason: DETECTION });
    assert.deepEqual(await segmentStudy(singleFilm.id), { ok: false, reason: DETECTION });
    assert.equal(getState().toast, `Could not segment: ${DETECTION}`);
    for (const id of [batchFilm.id, singleFilm.id]) {
      assert.equal(record(id).processingError, DETECTION);
      assert.ok(isIsoTime(record(id).processingErrorAt), record(id).processingErrorAt);
      assert.equal(deriveStatus(record(id)), 'fail');
    }
    assert.equal(getState().running, null);
    assert.equal(getState().runStage, null);
  });
});

test('raw socket text is stored as the backend-stopped sentence; the outcome and the toast keep the raw text', async (t) => {
  const batchFilm = film('SP-9702'), singleFilm = film('SP-9703');
  await withBridge(t, { predict: async () => { throw new Error(SOCKET); } }, [batchFilm, singleFilm], async () => {
    setFilePayload(batchFilm.id, BYTES);
    setFilePayload(singleFilm.id, BYTES);
    assert.deepEqual(await segmentStudy(batchFilm.id, { batch: true }), { ok: false, reason: SOCKET });
    assert.deepEqual(await segmentStudy(singleFilm.id), { ok: false, reason: SOCKET });
    assert.equal(getState().toast, `Could not segment: ${SOCKET}`);
    for (const id of [batchFilm.id, singleFilm.id]) assert.equal(record(id).processingError, BACKEND_STOPPED_REASON);
  });
});

test('the failure and its time arrive in the same notification that clears running', async (t) => {
  const s = film('SP-9704');
  const seen = [];
  await withBridge(t, { predict: async () => { throw new Error(DETECTION); } }, [s], async () => {
    setFilePayload(s.id, BYTES);
    const unsubscribe = subscribe((state) => {
      const live = state.studies.find((x) => x.id === s.id);
      seen.push({ running: state.running, error: live?.processingError ?? null, at: live?.processingErrorAt ?? null });
    });
    try { await segmentStudy(s.id, { batch: true }); } finally { unsubscribe(); }
  });
  const started = seen.findIndex((n) => n.running === s.id);
  const finished = seen.findIndex((n, i) => i > started && n.running === null);
  assert.ok(started >= 0 && finished > started);
  // No notification shows the finished film as neither Processing nor Failed.
  assert.equal(seen.findIndex((n) => n.error !== null), finished);
  assert.ok(isIsoTime(seen[finished].at), seen[finished].at);
});

test('a re-run that fails replaces the earlier reason and its time', async (t) => {
  const s = film('SP-9705', { processingError: OLD_REASON, processingErrorAt: OLD_AT });
  await withBridge(t, { predict: async () => { throw new Error(DETECTION); } }, [s], async () => {
    setFilePayload(s.id, BYTES);
    await segmentStudy(s.id, { batch: true });
    assert.equal(record(s.id).processingError, DETECTION);
    assert.ok(isIsoTime(record(s.id).processingErrorAt));
    assert.notEqual(record(s.id).processingErrorAt, OLD_AT);
  });
});

test('a failed re-run over existing results is stored and keeps the results (1.0.13)', async (t) => {
  const measurements = { SS: 30, PI: 50, PT: 20, LL: { 'L1-S1': 45 } };
  const s = film('SP-9706', { measurements, geometry: { region: 'lumbar' } });
  await withBridge(t, { predict: async () => { throw new Error(DETECTION); } }, [s], async () => {
    setFilePayload(s.id, BYTES);
    assert.deepEqual(await segmentStudy(s.id), { ok: false, reason: DETECTION });
    assert.equal(record(s.id).processingError, DETECTION);
    assert.ok(isIsoTime(record(s.id).processingErrorAt));
    assert.equal(record(s.id).measurements, measurements);
    assert.equal(deriveStatus(record(s.id)), 'fail');
  });
});

test('a cancelled run stores nothing and keeps an earlier failure and its time', async (t) => {
  const batchFilm = film('SP-9707'), singleFilm = film('SP-9708', { processingError: OLD_REASON, processingErrorAt: OLD_AT });
  await withBridge(t, { predict: async () => { throw new Error('Processing cancelled.'); } }, [batchFilm, singleFilm], async () => {
    setFilePayload(batchFilm.id, BYTES);
    setFilePayload(singleFilm.id, BYTES);
    assert.deepEqual(await segmentStudy(batchFilm.id, { batch: true }), { skipped: true, cancelled: true });
    assert.deepEqual(await segmentStudy(singleFilm.id), { skipped: true, cancelled: true });
    assert.equal(record(batchFilm.id).processingError, null);
    assert.equal(record(batchFilm.id).processingErrorAt, null);
    assert.equal(record(singleFilm.id).processingError, OLD_REASON);
    assert.equal(record(singleFilm.id).processingErrorAt, OLD_AT);
  });
});

test('a refusal before a run is stored with its time (1.0.13)', async (t) => {
  const ap = film('SP-9709', { view: 'AP' });
  const cervical = film('SP-9710', { region: 'cervical', anteriorSide: null });
  await withBridge(t, { predict: unreachable }, [ap, cervical], async () => {
    assert.deepEqual(await segmentStudy(ap.id, { batch: true }), { ok: false, reason: unsupportedViewReason('AP') });
    assert.deepEqual(await segmentStudy(cervical.id), { ok: false, reason: regionRunReason(cervical) });
    assert.equal(record(ap.id).processingError, unsupportedViewReason('AP'));
    assert.equal(record(cervical.id).processingError, regionRunReason(cervical));
    for (const id of [ap.id, cervical.id]) assert.ok(isIsoTime(record(id).processingErrorAt), id);
  });
});

test('a batch that cannot find the film stores the file-not-found sentence; a single run whose picker is cancelled stores nothing', async (t) => {
  const batchFilm = film('SP-9711'), singleFilm = film('SP-9712');
  await withBridge(t, { selectFile: async () => null, predict: unreachable }, [batchFilm, singleFilm], async () => {
    // The outcome keeps the raw reason; the record keeps the sentence.
    assert.deepEqual(await segmentStudy(batchFilm.id, { batch: true }), { ok: false, reason: 'file not found' });
    assert.equal(record(batchFilm.id).processingError, FILE_NOT_FOUND_REASON);
    assert.ok(isIsoTime(record(batchFilm.id).processingErrorAt));
    assert.deepEqual(await segmentStudy(singleFilm.id), { ok: false, reason: 'file not found' });
    assert.equal(record(singleFilm.id).processingError, null);
    assert.equal(record(singleFilm.id).processingErrorAt, null);
  });
});

test('a film that cannot be read stores the read error verbatim, socket code and all', async (t) => {
  const s = film('SP-9713', { filePath: '/films/SP-9713.png' });
  // A film on a network share: the socket code is the file system's, not the backend's.
  const readFile = async () => { throw new Error('ECONNRESET: connection reset by peer, read'); };
  await withBridge(t, { readFile, predict: unreachable }, [s], async () => {
    const reason = 'Could not read SP-9713.png: ECONNRESET: connection reset by peer, read';
    assert.deepEqual(await segmentStudy(s.id, { batch: true }), { ok: false, reason });
    assert.equal(record(s.id).processingError, reason);
    assert.ok(isIsoTime(record(s.id).processingErrorAt));
  });
});
