/**
 * Parameters tab of the Studies screen (pre-op/post-op spec, 2026-09-06 §10). One row per film
 * with every measurement, a filter bar, sortable headers and an export of the visible rows.
 * All the deciding is in data/parameters.js; this file renders and writes to the store.
 *
 * Mounted once by screens/studies.js's render(); update(live, queried) is called from that
 * screen's subscription on every store notification the Studies screen sees, with `queried`
 * being the library after the search box. A reference-keyed gate inside decides whether to
 * rebuild. This module never imports screens/studies.js: the screen hands in `onOpen`.
 */
import { el, clear } from '../dom.js';
import { DEFAULT_FILTERS, normaliseFilters, filterParameters, sortParameters, emptyReason } from '../data/parameters.js';

const EMPTY_COPY = {
  none: 'No studies yet \u2014 choose or drop a radiograph on the Find tab, or load a workspace folder.',
  unsegmented: 'No segmented studies yet \u2014 open a study and run segmentation.',
  filtered: 'No studies match these filters.',
};

function sameKey(a, b) {
  return a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

export function mountParameters(host, { onOpen }) {
  void onOpen; // used from Task 5 on, when rows exist to open
  clear(host);
  const root = el('div', { class: 'param-panel' });
  host.append(root);
  let lastKey = null;

  function update(live, queried) {
    const key = [live.studies, live.query, live.paramFilters, live.paramSort, live.paramLevels, live.fields];
    if (sameKey(key, lastKey)) return;
    lastKey = key;
    clear(root);
    const filters = normaliseFilters(live.paramFilters, live.studies);
    const visible = sortParameters(filterParameters(queried, filters), live.paramSort);
    root.append(el('div', { class: 'param-bar' },
      el('div', { class: 'param-count', 'data-param-key': 'count' }, `${visible.length} OF ${live.studies.length} STUDIES SHOWN`)));
    // Task 5 puts the grid here. Until then the tab shows the count line, and the empty-state
    // card when nothing is visible -- both real behaviour that Task 5 keeps.
    const reason = emptyReason({ total: live.studies.length, visible: visible.length, filters, query: live.query });
    if (reason !== null) {
      root.append(el('div', { class: 'studies-empty card param-empty', 'data-param-key': 'empty' }, EMPTY_COPY[reason]));
    }
  }

  return { update };
}
