/**
 * The status pill (spec 9.4; studies-table spec 2026-09-10, section 8.2), built in ONE place so the Find
 * list and the Analysis header cannot drift: the same classes (`badge badge-<status>`), the same
 * dot, the same label. `status` is what displayStatus() returned. The Unsupported view pill is the
 * list's other badge, for an unsegmented film whose view no model reads.
 */
import { el } from '../dom.js';
import { statusLabel } from '../data/status.js';
import { unsupportedViewReason } from '../data/inference-view.js';

export function statusBadge(status) {
  return el('span', { class: `badge badge-${status}` }, el('span', { class: 'dot' }), statusLabel(status));
}

export function unsupportedViewBadge(view) {
  return el('span', { class: 'badge badge-rev', title: unsupportedViewReason(view) },
    el('span', { class: 'dot' }), 'Unsupported view');
}
