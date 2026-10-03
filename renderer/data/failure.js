/**
 * The text of a failed segmentation attempt (issue #39;
 * docs/superpowers/specs/2026-10-01-failed-status-port-design.md, "the spec" below). Pure, no DOM.
 * screens/analysis.js stores `processingError: failureReason(message)` with `processingErrorAt`, an
 * ISO time; the Failed pill's tooltip is failureTitle(processingError, processingErrorAt).
 * test/failure.test.js pins it.
 */

// Spec 5: at most this many characters, the ellipsis included.
export const REASON_LIMIT = 500;
const ELLIPSIS = '\u2026';

export const NO_REASON = 'Segmentation failed without a reason.';
export const FILE_NOT_FOUND_REASON = 'The film was not found at its saved location. Run segmentation from its Analysis screen to choose its new location.';
export const CONNECTION_ENDED_REASON = 'Processing connection ended before a result was received.';
export const BACKEND_STOPPED_REASON = 'The processing backend stopped. Restart Spine Contour, then segment again.';
export const UNREADABLE_RESPONSE_REASON = 'The processing backend returned an unreadable response. Restart Spine Contour, then segment again.';

// Raw Node socket text from backend-client.cjs. The error code sits inside the message.
const SOCKET_TEXT = /ECONNREFUSED|ECONNRESET|EPIPE|ETIMEDOUT|socket hang up/;

export function capReason(text) {
  const trimmed = String(text).trim();
  return trimmed.length > REASON_LIMIT ? `${trimmed.slice(0, REASON_LIMIT - 1)}${ELLIPSIS}` : trimmed;
}

// The text stored for a failed attempt (spec 5). Rows in order, first match wins. Backend sentences
// and file-read errors are kept as they are; only transport and parser text, which says nothing to a
// clinician, is rewritten. Toasts and the batch's closing toast keep the raw message.
export function failureReason(message) {
  if (typeof message !== 'string' || message.trim() === '') return NO_REASON;
  const text = message.trim();
  // A file-system error from main's read-file, never from the backend client: a film on a network
  // share can fail with ETIMEDOUT, and "the backend stopped" would be a fabricated cause.
  if (text.startsWith('Could not read ')) return capReason(text);
  if (text === 'file not found') return FILE_NOT_FOUND_REASON;
  // Node's message when /predict-stream closes after the headers and before a result or error line;
  // the ECONNRESET code is on .code, which api.js does not carry across IPC.
  if (text === 'aborted') return CONNECTION_ENDED_REASON;
  if (SOCKET_TEXT.test(text)) return BACKEND_STOPPED_REASON;
  if (text.endsWith('is not valid JSON') || text === 'Unexpected end of JSON input') return UNREADABLE_RESPONSE_REASON;
  return capReason(text);
}

const failedDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// The Failed pill's native tooltip (spec 5): a date line, a newline, the reason. A `title`
// attribute renders the newline as a line break. The date is reviewedLabel's format and is never
// guessed: a failure 1.0.13 recorded has no time, and an unparseable `at` leaves just
// "Segmentation failed".
export function failureTitle(reason, at) {
  const time = Date.parse(typeof at === 'string' ? at : '');
  const head = Number.isNaN(time) ? 'Segmentation failed' : `Segmentation failed \u00B7 ${failedDate.format(new Date(time))}`;
  const text = typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : NO_REASON;
  return `${head}\n${text}`;
}
