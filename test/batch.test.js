import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planBatch, newBatch, advance, withStopping, isQueued, progressText, sidebarText, batchMessage,
  createBatchDriver, STOPPING_TEXT, WAIT_FOR_RUN, WAIT_FOR_BATCH, UNSAVED_BATCH,
} from '../renderer/data/batch.js';

// A real, unsegmented film. `n` gives each a distinct addedAt, which is the record's identity.
function film(id, overrides = {}) {
  return {
    id, source: 'real', filePath: `C:\\films\\${id}.png`, fileName: `${id}.png`, name: null, workspaceFolder: null,
    subjectId: null, timepoint: null, filmDate: null, addedAt: `2026-09-08T00:00:00.000Z`, view: 'Standing lateral',
    thumbnail: null, measurements: null, geometry: null, qc: null, clinical: {}, ...overrides,
  };
}
const segmented = (id, overrides = {}) => film(id, { measurements: { PI: 50, PT: 12, SS: 38, LL: { 'L1-S1': 49 } }, ...overrides });
const demo = (id) => film(id, { source: 'demo', filePath: null, measurements: { PI: 50, PT: 12, SS: 38, LL: { 'L1-S1': 49 } } });

// ---------------------------------------------------------------------------
// planBatch (spec 7.3)
// ---------------------------------------------------------------------------

test('planBatch with nothing ticked offers every visible real unsegmented film, in table order', () => {
  const visible = [segmented('SP-1'), film('SP-2'), demo('SP-0042'), film('SP-3')];
  const plan = planBatch({ visible, selected: [], running: null });
  assert.deepEqual(plan, { ids: ['SP-2', 'SP-3'], label: 'Segment 2 unsegmented', note: null, enabled: true });
});

test('planBatch with nothing ticked and every visible real film segmented is disabled and says so', () => {
  const plan = planBatch({ visible: [segmented('SP-1'), demo('SP-0042')], selected: [], running: null });
  assert.deepEqual(plan, { ids: [], label: 'Segment 0 unsegmented', note: 'All visible studies are segmented', enabled: false });
});

test('planBatch with no visible real row is disabled with Nothing to segment', () => {
  assert.deepEqual(planBatch({ visible: [demo('SP-0042')], selected: [], running: null }),
    { ids: [], label: 'Segment 0 unsegmented', note: 'Nothing to segment', enabled: false });
  assert.deepEqual(planBatch({ visible: [], selected: null, running: null }),
    { ids: [], label: 'Segment 0 unsegmented', note: 'Nothing to segment', enabled: false });
});

test('planBatch with ticked rows runs the unsegmented ticked ones and notes the segmented ones', () => {
  const visible = [film('SP-1'), segmented('SP-2'), film('SP-3'), segmented('SP-4'), film('SP-5')];
  const plan = planBatch({ visible, selected: ['SP-5', 'SP-2', 'SP-1', 'SP-4'], running: null });
  assert.deepEqual(plan, { ids: ['SP-1', 'SP-5'], label: 'Segment 2 selected', note: '2 already segmented', enabled: true });
});

test('planBatch with only unsegmented rows ticked has no note', () => {
  const plan = planBatch({ visible: [film('SP-1'), film('SP-2')], selected: ['SP-2'], running: null });
  assert.deepEqual(plan, { ids: ['SP-2'], label: 'Segment 1 selected', note: null, enabled: true });
});

test('planBatch with only segmented rows ticked is disabled and says so', () => {
  const plan = planBatch({ visible: [film('SP-1'), segmented('SP-2')], selected: ['SP-2'], running: null });
  assert.deepEqual(plan, { ids: [], label: 'Segment 0 selected', note: 'All selected studies are segmented', enabled: false });
});

test('planBatch ignores a tick that is not visible and a tick on a demo row (decision 38, decision 16)', () => {
  const visible = [film('SP-1'), demo('SP-0042')];
  const plan = planBatch({ visible, selected: ['SP-9', 'SP-0042'], running: null });
  // Nothing VISIBLE and real is ticked, so it is the nothing-ticked case over the visible rows.
  assert.deepEqual(plan, { ids: ['SP-1'], label: 'Segment 1 unsegmented', note: null, enabled: true });
});

test('planBatch is disabled with the wait note while a single run is in flight, whatever the rows say', () => {
  const visible = [film('SP-1'), film('SP-2')];
  assert.deepEqual(planBatch({ visible, selected: [], running: 'SP-1' }),
    { ids: ['SP-1', 'SP-2'], label: 'Segment 2 unsegmented', note: WAIT_FOR_RUN, enabled: false });
  assert.deepEqual(planBatch({ visible, selected: ['SP-2'], running: 'SP-1' }),
    { ids: ['SP-2'], label: 'Segment 1 selected', note: WAIT_FOR_RUN, enabled: false });
  assert.equal(WAIT_FOR_RUN, 'Wait for the current segmentation to finish');
  assert.equal(WAIT_FOR_BATCH, 'Wait for the batch to finish');
});

test('planBatch never mutates its inputs', () => {
  const visible = [film('SP-1')];
  const selected = ['SP-1'];
  planBatch({ visible, selected, running: null });
  assert.deepEqual(visible, [film('SP-1')]);
  assert.deepEqual(selected, ['SP-1']);
});

// ---------------------------------------------------------------------------
// the batch object (spec 8.1)
// ---------------------------------------------------------------------------

test('newBatch copies the ids and starts at zero', () => {
  const ids = ['SP-1', 'SP-2'];
  const batch = newBatch(ids);
  assert.deepEqual(batch, { ids: ['SP-1', 'SP-2'], done: 0, failed: [], warnings: [], skipped: 0, stopping: false });
  assert.notEqual(batch.ids, ids);
});

test('advance counts every kind of outcome in done and files each where it belongs, as a new object', () => {
  const b0 = newBatch(['SP-1', 'SP-2', 'SP-3', 'SP-4']);
  const b1 = advance(b0, { ok: true, id: 'SP-1', name: 'SP-1' });
  const b2 = advance(b1, { ok: false, id: 'SP-2', name: 'S002', reason: 'file not found' });
  const b3 = advance(b2, { skipped: true });
  const b4 = advance(b3, { ok: true, id: 'SP-4', name: 'S004', warning: 'the segmentation images could not be stored: disk full' });
  assert.equal(b0.done, 0);
  assert.equal(b4.done, 4);
  assert.deepEqual(b4.failed, [{ id: 'SP-2', name: 'S002', reason: 'file not found' }]);
  assert.deepEqual(b4.warnings, [{ id: 'SP-4', name: 'S004', reason: 'the segmentation images could not be stored: disk full' }]);
  assert.equal(b4.skipped, 1);
  assert.notEqual(b4, b3);
  assert.notEqual(b4.failed, b3.failed);
  assert.deepEqual(b3.failed, b2.failed, 'an earlier batch is never mutated');
});

test('withStopping sets the flag on a new object', () => {
  const b = newBatch(['SP-1']);
  const stopped = withStopping(b);
  assert.equal(stopped.stopping, true);
  assert.equal(b.stopping, false);
  assert.notEqual(stopped, b);
});

test('isQueued is true from the film whose turn is starting to the last, false before and for a null batch', () => {
  const b = advance(advance(newBatch(['SP-1', 'SP-2', 'SP-3']), { ok: true, id: 'SP-1', name: 'SP-1' }), { skipped: true });
  assert.equal(b.done, 2);
  assert.equal(isQueued(b, 'SP-1'), false);
  assert.equal(isQueued(b, 'SP-2'), false);
  assert.equal(isQueued(b, 'SP-3'), true);
  assert.equal(isQueued(b, 'SP-9'), false);
  assert.equal(isQueued(null, 'SP-3'), false);
  assert.equal(isQueued(newBatch(['SP-3']), 'SP-3'), true);
});

// ---------------------------------------------------------------------------
// texts (spec 7.4, 9)
// ---------------------------------------------------------------------------

test('progressText and sidebarText count attempts, and say STOPPING once Stop is pressed', () => {
  const b = advance(advance(newBatch(new Array(12).fill(0).map((_, i) => `SP-${i}`)), { ok: true, id: 'SP-0', name: 'a' }),
    { ok: false, id: 'SP-1', name: 'b', reason: 'x' });
  assert.equal(progressText(b), '2 of 12 done');
  assert.equal(sidebarText(b), '2 OF 12 DONE');
  assert.equal(progressText(withStopping(b)), STOPPING_TEXT);
  assert.equal(STOPPING_TEXT, 'Stopping after this film\u2026');
  assert.equal(sidebarText(withStopping(b)), 'STOPPING');
  assert.equal(progressText(newBatch(['SP-1'])), '0 of 1 done');
});

test('batchMessage for a clean run, the singular, and a stopped run', () => {
  let b = newBatch(['SP-1', 'SP-2']);
  b = advance(b, { ok: true, id: 'SP-1', name: 'a' });
  b = advance(b, { ok: true, id: 'SP-2', name: 'b' });
  assert.equal(batchMessage(b), 'Segmented 2 of 2 films.');
  assert.equal(batchMessage(advance(newBatch(['SP-1']), { ok: true, id: 'SP-1', name: 'a' })), 'Segmented 1 of 1 film.');
  const stopped = withStopping(advance(newBatch(['SP-1', 'SP-2']), { ok: true, id: 'SP-1', name: 'a' }));
  assert.equal(batchMessage(stopped), 'Segmented 1 of 2 films, then stopped.');
  // Stop pressed during the last film: every film ran, so nothing was stopped.
  assert.equal(batchMessage(withStopping(b)), 'Segmented 2 of 2 films.');
});

test('batchMessage adds one clause per thing left out, only when nonzero, names capped at five then an ellipsis', () => {
  let b = newBatch(['SP-1', 'SP-2', 'SP-3', 'SP-4', 'SP-5', 'SP-6', 'SP-7', 'SP-8', 'SP-9']);
  b = advance(b, { ok: true, id: 'SP-1', name: 'S001' });
  for (const n of [2, 3, 4, 5, 6, 7]) b = advance(b, { ok: false, id: `SP-${n}`, name: `S00${n}`, reason: n === 2 ? 'file not found' : 'Segmentation failed with status 500.' });
  b = advance(b, { ok: true, id: 'SP-8', name: 'S008', warning: 'the segmentation images could not be stored: EACCES' });
  b = advance(b, { skipped: true });
  assert.equal(batchMessage(b),
    'Segmented 2 of 9 films.'
    + ' \u00B7 6 could not be segmented: S002 (file not found), S003 (Segmentation failed with status 500.), S004 (Segmentation failed with status 500.), S005 (Segmentation failed with status 500.), S006 (Segmentation failed with status 500.), \u2026'
    + ' \u00B7 1 segmented without stored images: S008 (the segmentation images could not be stored: EACCES)'
    + ' \u00B7 1 skipped (deleted, or segmented meanwhile)');
});

// ---------------------------------------------------------------------------
// createBatchDriver (spec 8.2)
// ---------------------------------------------------------------------------

// A fake store with the getState/setState contract of renderer/store.js, and a segment() whose
// promises the test resolves or rejects by hand. `inFlight` proves the loop is strictly serial.
function harness({ studies, persistence = null, running = null }) {
  let state = { studies, running, batch: null, deletingStudies: false };
  const calls = [];
  const toasts = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const driver = createBatchDriver({
    segment: (id) => new Promise((resolve, reject) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      calls.push({
        id,
        resolve: (value) => { inFlight -= 1; resolve(value); },
        reject: (error) => { inFlight -= 1; reject(error); },
      });
    }),
    getState: () => state,
    setState: (patchOrFn) => { state = { ...state, ...(typeof patchOrFn === 'function' ? patchOrFn(state) : patchOrFn) }; },
    showToast: (message) => toasts.push(message),
    persistenceDisabledReason: () => persistence,
  });
  return {
    driver, calls, toasts,
    get state() { return state; },
    get maxInFlight() { return maxInFlight; },
    patch: (patch) => { state = { ...state, ...patch }; },
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('startBatch sets state.batch before its first await, runs the ids one at a time in order, folds each outcome, then clears the batch and toasts once', async () => {
  const h = harness({ studies: [film('SP-1'), film('SP-2'), film('SP-3')] });
  const started = h.driver.startBatch(['SP-1', 'SP-2', 'SP-3']);
  assert.deepEqual(h.state.batch, { ids: ['SP-1', 'SP-2', 'SP-3'], done: 0, failed: [], warnings: [], skipped: 0, stopping: false });
  await tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].id, 'SP-1');
  h.calls[0].resolve({ ok: true });
  await tick();
  assert.equal(h.state.batch.done, 1);
  assert.equal(h.calls.length, 2, 'the second film starts only after the first outcome');
  h.calls[1].resolve({ ok: false, reason: 'file not found' });
  await tick();
  assert.deepEqual(h.state.batch.failed, [{ id: 'SP-2', name: 'SP-2', reason: 'file not found' }]);
  h.calls[2].resolve({ ok: true, warning: 'the segmentation images could not be stored: EACCES' });
  await tick();
  assert.equal(await started, true);
  assert.equal(h.state.batch, null);
  assert.equal(h.maxInFlight, 1);
  assert.deepEqual(h.toasts, ['Segmented 2 of 3 films. \u00B7 1 could not be segmented: SP-2 (file not found) \u00B7 1 segmented without stored images: SP-3 (the segmentation images could not be stored: EACCES)']);
});

test('startBatch refuses while a batch or a single run is up, and for an empty list', async () => {
  const h = harness({ studies: [film('SP-1')] });
  assert.equal(await h.driver.startBatch([]), false);
  h.patch({ running: 'SP-1' });
  assert.equal(await h.driver.startBatch(['SP-1']), false);
  h.patch({ running: null });
  const first = h.driver.startBatch(['SP-1']);
  await tick();
  assert.equal(await h.driver.startBatch(['SP-1']), false, 'a second batch is refused while one runs');
  assert.equal(h.calls.length, 1);
  h.calls[0].resolve({ ok: true });
  await first;
  assert.equal(h.state.batch, null);
  assert.deepEqual(h.toasts, ['Segmented 1 of 1 film.']);
});

test('startBatch refuses while a bulk delete is clearing the library', async () => {
  const h = harness({ studies: [film('SP-1'), film('SP-2')] });
  h.patch({ deletingStudies: true });
  assert.equal(await h.driver.startBatch(['SP-1', 'SP-2']), false);
  assert.equal(h.calls.length, 0, 'no film is segmented');
  assert.equal(h.state.batch, null, 'no batch was ever started');
  assert.deepEqual(h.toasts, []);
});

test('stopBatch ends the loop after the film in flight; the toast says so', async () => {
  const h = harness({ studies: [film('SP-1'), film('SP-2'), film('SP-3')] });
  const run = h.driver.startBatch(['SP-1', 'SP-2', 'SP-3']);
  await tick();
  h.driver.stopBatch();
  assert.equal(h.state.batch.stopping, true);
  assert.equal(h.calls.length, 1, 'nothing new starts');
  h.calls[0].resolve({ ok: true });
  await run;
  assert.equal(h.calls.length, 1);
  assert.equal(h.state.batch, null);
  assert.deepEqual(h.toasts, ['Segmented 1 of 3 films, then stopped.']);
  h.driver.stopBatch();
  assert.equal(h.state.batch, null, 'stopBatch with no batch is a no-op');
});

test('a film deleted, reused under its id, or segmented before its turn is skipped and counted', async () => {
  const h = harness({ studies: [film('SP-1'), film('SP-2'), film('SP-3'), film('SP-4')] });
  const run = h.driver.startBatch(['SP-1', 'SP-2', 'SP-3', 'SP-4']);
  await tick();
  // While SP-1 runs: SP-2 deleted; SP-3 deleted and its id reused by a new film; SP-4 segmented.
  h.patch({
    studies: [
      film('SP-1'), film('SP-3', { addedAt: '2026-09-08T00:00:01.000Z' }), segmented('SP-4'),
    ],
  });
  h.calls[0].resolve({ ok: true });
  await run;
  assert.equal(h.calls.length, 1, 'only SP-1 was segmented');
  assert.deepEqual(h.toasts, ['Segmented 1 of 4 films. \u00B7 3 skipped (deleted, or segmented meanwhile)']);
});

test('a rejecting segment() is counted as a failure with its message, and the batch goes on', async () => {
  const h = harness({ studies: [film('SP-1'), film('SP-2')] });
  const run = h.driver.startBatch(['SP-1', 'SP-2']);
  await tick();
  h.calls[0].reject(new Error('backend gone'));
  await tick();
  assert.equal(h.calls.length, 2);
  h.calls[1].resolve({ ok: true });
  await run;
  assert.deepEqual(h.toasts, ['Segmented 1 of 2 films. \u00B7 1 could not be segmented: SP-1 (backend gone)']);
});

test('with persistence disabled the driver toasts the warning once, at the start, and nothing per film', async () => {
  const h = harness({ studies: [film('SP-1'), film('SP-2')], persistence: 'the saved studies could not be read' });
  const run = h.driver.startBatch(['SP-1', 'SP-2']);
  assert.deepEqual(h.toasts, [UNSAVED_BATCH]);
  assert.equal(UNSAVED_BATCH, 'Studies are not being saved this session; batch results will be lost when the app closes.');
  await tick();
  h.calls[0].resolve({ ok: true });
  await tick();
  h.calls[1].resolve({ ok: true });
  await run;
  assert.deepEqual(h.toasts, [UNSAVED_BATCH, 'Segmented 2 of 2 films.']);
});

test('a failure names the study by its display name', async () => {
  const h = harness({ studies: [film('SP-1', { name: 'Smith pre-op' })] });
  const run = h.driver.startBatch(['SP-1']);
  await tick();
  h.calls[0].resolve({ ok: false, reason: 'file not found' });
  await run;
  assert.deepEqual(h.toasts, ['Segmented 0 of 1 film. \u00B7 1 could not be segmented: Smith pre-op (file not found)']);
});
