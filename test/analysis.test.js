import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatConfidence, headerBadge, failedRunNote, positionLabel, NAV_STEP, regionLock } from '../renderer/screens/analysis.js';

// (2026-10-20, issue #68) What locks the region bar's Region and Orientation selects, and the tooltip that says why.
// Before, any run or batch anywhere in the library disabled both with no tooltip, so a region Auto detect got wrong
// could not be corrected while a batch ran over the rest of the library.
const real = (patch = {}) => ({ id: 'SP-1000', source: 'real', view: 'Standing lateral', measurements: {}, geometry: { region: 'lumbar' }, ...patch });
const idle = { editing: false, running: null, batch: null };
const batchOf = (ids, done = 0, stopping = false) => ({ ids, done, failed: [], warnings: [], skipped: 0, stopping });

test('regionLock: an idle real film may change its region and orientation, with no tooltip', () => {
  assert.deepEqual(regionLock(real(), idle), { locked: false, title: '' });
  assert.deepEqual(regionLock(real(), idle, 'orientation'), { locked: false, title: '' });
});

test('regionLock: a demo study, no study, or edit mode locks both', () => {
  assert.deepEqual(regionLock(real({ source: 'demo' }), idle), { locked: true, title: '' });
  assert.deepEqual(regionLock(null, idle), { locked: true, title: '' });
  assert.deepEqual(regionLock(real(), { ...idle, editing: true }), { locked: true, title: 'Finish editing before changing the region' });
  assert.deepEqual(regionLock(real(), { ...idle, editing: true }, 'orientation'), { locked: true, title: 'Finish editing before changing the orientation' });
});

test('regionLock: only THIS film\'s run in flight locks it; a run on another film does not', () => {
  const title = "Wait for this film's segmentation to finish before changing the region";
  assert.deepEqual(regionLock(real(), { ...idle, running: 'SP-1000' }), { locked: true, title });
  assert.deepEqual(regionLock(real(), { ...idle, running: 'SP-1001' }), { locked: false, title: '' });
});

test('regionLock: a batch locks the film whose turn it is, not the films already done, later in the queue, or outside it', () => {
  const title = "Wait for this film's segmentation to finish before changing the region";
  assert.deepEqual(regionLock(real(), { ...idle, batch: batchOf(['SP-1000', 'SP-1001'], 0) }), { locked: true, title });
  assert.deepEqual(regionLock(real(), { ...idle, batch: batchOf(['SP-1000', 'SP-1001'], 1) }), { locked: false, title: '' });
  assert.deepEqual(regionLock(real(), { ...idle, batch: batchOf(['SP-1001', 'SP-1000'], 0) }), { locked: false, title: '' });
  assert.deepEqual(regionLock(real(), { ...idle, batch: batchOf(['SP-1001', 'SP-1002'], 0) }), { locked: false, title: '' });
  // A stopping batch starts no further turn, so the film next up is free; one in flight still is not.
  assert.deepEqual(regionLock(real(), { ...idle, batch: batchOf(['SP-1000'], 0, true) }), { locked: false, title: '' });
  assert.equal(regionLock(real(), { ...idle, running: 'SP-1000', batch: batchOf(['SP-1000'], 0, true) }).locked, true);
});

// (2026-10-19, reviewer navigation) the header's place in the Find list, and which arrow goes where.
test('positionLabel reads "3 / 42", and an en dash for a study the list\'s filters hide', () => {
  assert.equal(positionLabel({ index: 3, count: 42 }), '3 / 42');
  assert.equal(positionLabel({ index: 1, count: 1 }), '1 / 1');
  assert.equal(positionLabel({ index: null, count: 42 }), '– / 42');
  assert.equal(positionLabel({ index: null, count: 0 }), '– / 0');
});

test('NAV_STEP: Left and Up go to the previous row, Right and Down to the next, nothing else navigates', () => {
  assert.deepEqual(NAV_STEP, { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 });
  assert.ok(Object.isFrozen(NAV_STEP));
  assert.equal(NAV_STEP.PageDown, undefined);
});

test('formatConfidence renders rounded percent from qc.femoral.confidence', () => {
  assert.equal(formatConfidence({ femoral: { confidence: 0.873 } }), '87%');
  assert.equal(formatConfidence({ femoral: { confidence: 1 } }), '100%');
});

test('formatConfidence renders em dash when qc is absent or malformed', () => {
  assert.equal(formatConfidence(null), '—');
  assert.equal(formatConfidence({}), '—');
  assert.equal(formatConfidence({ femoral: {} }), '—');
});

// A confidence of exactly 0 is a measured value, not a missing one, so it renders as a
// number. The em dash is reserved for "the backend did not report this", per the
// architecture contract's absent-value rule.
test('formatConfidence renders 0% for a measured zero, not an em dash', () => {
  assert.equal(formatConfidence({ femoral: { confidence: 0 } }), '0%');
});

// (2026-10-01, issue #39; port spec 6) the Analysis header pill and the region note of a Failed film.
const AT = '2026-10-01T12:00:00.000Z';
const REASON = 'Automatic film detection was inconclusive. Choose cervical, lumbar or standing / full spine manually.';
const film = (patch = {}) => ({ id: 'SP-1000', source: 'real', view: 'Standing lateral', measurements: null,
  processingError: null, processingErrorAt: null, ...patch });

test('headerBadge follows the list: Unsupported view, else the shown status, the batch included', () => {
  assert.deepEqual(headerBadge(film()), { unsupported: false, status: 'unseg', badgeKey: 'unseg||' });
  assert.deepEqual(headerBadge(film({ view: 'AP' })), { unsupported: true, status: 'unseg', badgeKey: 'unsupported:AP' });
  // Running wins over Unsupported, as on the list.
  assert.equal(headerBadge(film({ view: 'AP' }), 'SP-1000').unsupported, false);
  assert.equal(headerBadge(film(), 'SP-1000').status, 'proc');
  const batch = { ids: ['SP-1000'], done: 0, failed: [], warnings: [], skipped: 0, stopping: false };
  assert.equal(headerBadge(film(), null, batch).status, 'proc');
  assert.equal(headerBadge(film(), null, { ...batch, stopping: true }).status, 'unseg');
});

test('headerBadge keys a Failed pill on the failure and its time, so a new failure rebuilds it', () => {
  const first = headerBadge(film({ processingError: REASON, processingErrorAt: AT }));
  assert.equal(first.status, 'fail');
  assert.equal(first.badgeKey, `fail|${AT}|${REASON}`);
  const again = headerBadge(film({ processingError: REASON, processingErrorAt: '2026-10-02T12:00:00.000Z' }));
  assert.notEqual(again.badgeKey, first.badgeKey);
  const legacy = headerBadge(film({ processingError: REASON }));
  assert.equal(legacy.badgeKey, `fail||${REASON}`);
});

test('failedRunNote names the reason only when the pill reads Failed, the preview message after it', () => {
  const failed = film({ processingError: REASON, processingErrorAt: AT });
  assert.equal(failedRunNote(failed, { unsupported: false, status: 'fail' }), `Last run failed: ${REASON}`);
  assert.equal(failedRunNote(failed, { unsupported: false, status: 'fail' }, 'Loading original radiograph.'),
    `Last run failed: ${REASON} Loading original radiograph.`);
  assert.equal(failedRunNote(failed, { unsupported: true, status: 'fail' }), null);
  assert.equal(failedRunNote(failed, { unsupported: false, status: 'proc' }), null);
  assert.equal(failedRunNote(film(), { unsupported: false, status: 'unseg' }), null);
});
