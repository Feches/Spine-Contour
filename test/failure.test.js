import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REASON_LIMIT, NO_REASON, FILE_NOT_FOUND_REASON, CONNECTION_ENDED_REASON, BACKEND_STOPPED_REASON,
  UNREADABLE_RESPONSE_REASON, capReason, failureReason, failureTitle,
} from '../renderer/data/failure.js';

// (2026-10-01, issue #39) docs/superpowers/specs/2026-10-01-failed-status-port-design.md section 5.
const AT = '2026-10-01T12:00:00.000Z';

test('failureReason stores backend sentences verbatim, trimmed', () => {
  const detection = 'Automatic film detection was inconclusive. Choose cervical, lumbar or standing / full spine manually.';
  assert.equal(failureReason(detection), detection);
  assert.equal(failureReason(`  ${detection}\n`), detection);
  assert.equal(failureReason('Detected a cervical film. Choose anterior left or right, then segment again.'),
    'Detected a cervical film. Choose anterior left or right, then segment again.');
  assert.equal(failureReason('intentional transport stop'), 'intentional transport stop');
});

test('failureReason: a blank or non-string message has a fixed reason', () => {
  for (const message of ['', '   ', null, undefined, 42, {}]) assert.equal(failureReason(message), NO_REASON, String(message));
  assert.equal(NO_REASON, 'Segmentation failed without a reason.');
});

test('failureReason: a file-read error is never rewritten, even when it carries a socket code', () => {
  const share = 'Could not read x.png: ECONNRESET: connection reset by peer, read';
  assert.equal(failureReason(share), share);
  assert.equal(failureReason('Could not read x.png: ETIMEDOUT: connection timed out, read'),
    'Could not read x.png: ETIMEDOUT: connection timed out, read');
});

test('failureReason rewrites the terse file-not-found outcome', () => {
  assert.equal(failureReason('file not found'), FILE_NOT_FOUND_REASON);
  assert.equal(FILE_NOT_FOUND_REASON,
    'The film was not found at its saved location. Run segmentation from its Analysis screen to choose its new location.');
});

test('failureReason: exactly "aborted" is a connection that ended early; a message merely containing it is not', () => {
  assert.equal(failureReason('aborted'), CONNECTION_ENDED_REASON);
  assert.equal(CONNECTION_ENDED_REASON, 'Processing connection ended before a result was received.');
  assert.equal(failureReason('The run was aborted by the detector'), 'The run was aborted by the detector');
});

test('failureReason rewrites raw socket text to the backend-stopped sentence', () => {
  for (const message of ['connect ECONNREFUSED 127.0.0.1:53211', 'read ECONNRESET', 'write EPIPE', 'connect ETIMEDOUT 127.0.0.1:1', 'socket hang up']) {
    assert.equal(failureReason(message), BACKEND_STOPPED_REASON, message);
  }
  assert.equal(BACKEND_STOPPED_REASON, 'The processing backend stopped. Restart Spine Contour, then segment again.');
});

test('failureReason rewrites a non-JSON reply', () => {
  assert.equal(failureReason('Unexpected token \'I\', "Internal S"... is not valid JSON'), UNREADABLE_RESPONSE_REASON);
  assert.equal(failureReason('Unexpected end of JSON input'), UNREADABLE_RESPONSE_REASON);
  assert.equal(UNREADABLE_RESPONSE_REASON,
    'The processing backend returned an unreadable response. Restart Spine Contour, then segment again.');
});

test('capReason: at most 500 characters, the ellipsis included', () => {
  assert.equal(REASON_LIMIT, 500);
  const capped = failureReason('x'.repeat(600));
  assert.equal(capped.length, 500);
  assert.ok(capped.endsWith('\u2026'));
  assert.equal(capped.slice(0, 499), 'x'.repeat(499));
  assert.equal(capReason('y'.repeat(500)), 'y'.repeat(500));
  assert.equal(capReason('  short  '), 'short');
  assert.equal(failureReason(`Could not read ${'z'.repeat(600)}`).length, 500);
});

test('failureTitle: the date line, a newline, the reason; no guessed date', () => {
  // Noon UTC so the local date is the 1st in every zone the app is tested in.
  assert.equal(failureTitle('boom', AT), 'Segmentation failed \u00B7 Oct 1, 2026\nboom');
  assert.equal(failureTitle('boom', 'not a date'), 'Segmentation failed\nboom');
  // A failure recorded by 1.0.13 has no time.
  assert.equal(failureTitle('boom', null), 'Segmentation failed\nboom');
  assert.equal(failureTitle('boom', undefined), 'Segmentation failed\nboom');
  assert.equal(failureTitle('boom', 12), 'Segmentation failed\nboom');
  assert.equal(failureTitle('', AT), `Segmentation failed \u00B7 Oct 1, 2026\n${NO_REASON}`);
  assert.equal(failureTitle(null, null), `Segmentation failed\n${NO_REASON}`);
});

// A reason that spans lines (a library ValueError, say) keeps its line breaks in the stored text and
// in the tooltip, and the cap still applies to it.
test('a multi-line reason keeps its line breaks in the stored text and the tooltip', () => {
  const message = 'Model output malformed' + '\n' + 'Expected 23 finite cervical landmarks';
  assert.equal(failureReason(message), message);
  assert.equal(failureTitle(message, AT), `Segmentation failed \u00B7 Oct 1, 2026\n${message}`);
  assert.equal(failureReason(`${message}\n${'q'.repeat(600)}`).length, 500);
});
