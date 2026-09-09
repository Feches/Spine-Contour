import { el } from '../dom.js';
import { setState } from '../store.js';

// How long a toast stays: 2.2 s for a short message, then 40 ms per character past forty, capped
// at 8 s (pre-op/post-op spec §11.3, 2026-09-08). The paired export's report and the workspace
// load message run to five clauses; a fixed 2.2 s could not be read. Pure, so it is unit-tested.
export const TOAST_MIN_MS = 2200;
export const TOAST_MAX_MS = 8000;
const TOAST_FREE_CHARS = 40;
const TOAST_MS_PER_CHAR = 40;

export function toastDuration(text) {
  const length = String(text ?? '').length;
  return Math.min(TOAST_MAX_MS, TOAST_MIN_MS + Math.max(0, length - TOAST_FREE_CHARS) * TOAST_MS_PER_CHAR);
}

let dismissTimer = null;

export function showToast(message) {
  if (dismissTimer) clearTimeout(dismissTimer);
  setState({ toast: message });
  dismissTimer = setTimeout(() => {
    setState({ toast: '' });
    dismissTimer = null;
  }, toastDuration(message));
}

export function render(state) {
  const visible = Boolean(state.toast);
  return el('div', { class: `toast${visible ? ' toast-visible' : ''}` }, state.toast || '');
}
