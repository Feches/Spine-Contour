import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatConfidence, headerBadge, failedRunNote } from '../renderer/screens/analysis.js';

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
