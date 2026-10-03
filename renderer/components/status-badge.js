/**
 * The status pill (spec 9.4; studies-table spec 2026-09-10, section 8.2), built in ONE place so the Find
 * list and the Analysis header cannot drift: the same classes (`badge badge-<status>`), the same
 * dot, the same label. `status` is what displayStatus() returned. The Unsupported view pill is the
 * list's other badge, for an unsegmented film whose view no model reads.
 * (2026-10-01, issue #39) `title` is the pill's native tooltip: failureTitle() for a Failed pill,
 * nothing for the others (port spec 6). It is set only when it is a non-empty string -- el() skips
 * only undefined, and HTMLElement.title = null would store the text "null".
 */
import { el } from '../dom.js';
import { statusLabel } from '../data/status.js';
import { unsupportedViewReason } from '../data/inference-view.js';

export function statusBadge(status, title) {
  return el('span', { class: `badge badge-${status}`, ...(title ? { title } : {}) },
    el('span', { class: 'dot' }), statusLabel(status));
}

export function unsupportedViewBadge(view) {
  return el('span', { class: 'badge badge-rev', title: unsupportedViewReason(view) },
    el('span', { class: 'dot' }), 'Unsupported view');
}
