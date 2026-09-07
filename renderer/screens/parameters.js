/**
 * Parameters tab of the Studies screen (pre-op/post-op spec, 2026-09-06 §10). One row per film
 * with every measurement, a filter bar, sortable headers and an export of the visible rows.
 * All the deciding is in data/parameters.js; this file renders and writes to the store.
 *
 * Mounted once by screens/studies.js's render(); update(live, queried) is called from that
 * screen's subscription on every store notification the Studies screen sees, with `queried`
 * being the library after the search box. A reference-keyed gate inside decides whether to
 * rebuild. This module never imports screens/studies.js: the screen hands in `onOpen`.
 *
 * Every control carries a data-param-key. A rebuild replaces every node, which drops keyboard
 * focus to <body>; the key is how focus is handed back to the same control afterwards (the
 * data-row-key pattern in components/measurements.js), and it is what the smoke suite selects
 * on, never a visible label.
 */
import { el, clear } from '../dom.js';
import { setState } from '../store.js';
import { saveCsv } from '../api.js';
import { showToast } from '../components/toast.js';
import { toCsv } from '../data/csv.js';
import { isConsistent } from '../data/measurements.js';
import { studyName, workspaceLabel, folderLabel, pathTitle } from '../data/labels.js';
import {
  HAND_ADDED, DEFAULT_SORT, measurementColumns, parameterValues, formatParameter,
  workspaceOptions, folderOptions, normaliseFilters, filterParameters, hiddenUnsegmented,
  sortParameters, emptyReason, exportFileName,
} from '../data/parameters.js';

const EMPTY_COPY = {
  none: 'No studies yet \u2014 choose or drop a radiograph on the Find tab, or load a workspace folder.',
  unsegmented: 'No segmented studies yet \u2014 open a study and run segmentation.',
  filtered: 'No studies match these filters.',
};

// The Measurements panel's own wording for a PI/PT/SS residual over the limit.
const INCONSISTENT_TITLE = 'Parameters inconsistent \u2014 check S1 and femoral landmarks.';

const CHECK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 7"></path></svg>';

function sameKey(a, b) {
  return a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

// Real booleans on purpose: el() assigns `checked` as a property, and the string 'false' is true.
function checkbox({ key, label, checked, note, onChange }) {
  const input = el('input', { type: 'checkbox', checked, 'data-param-key': key, onChange });
  return el('label', { class: 'checkbox-row param-check' },
    input,
    el('span', { class: 'checkbox-box', innerHTML: CHECK_SVG }),
    el('span', { class: 'param-check-label' }, label, note ? el('span', { class: 'param-check-note' }, note) : null));
}

export function mountParameters(host, { onOpen }) {
  clear(host);
  const root = el('div', { class: 'param-panel' });
  host.append(root);
  let lastKey = null;

  // Filters are one object replaced wholesale, so the screen's gate sees every change.
  function setFilters(patch) {
    setState((s) => ({ paramFilters: { ...s.paramFilters, ...patch } }));
  }

  function toggleSort(key) {
    setState((s) => {
      const current = { ...DEFAULT_SORT, ...(s.paramSort ?? {}) };
      const dir = current.key === key && current.dir === 'asc' ? 'desc' : 'asc';
      return { paramSort: { key, dir } };
    });
  }

  // The visible rows, as one long-format file (spec §11.1). toCsv drops demo rows itself; the
  // button is disabled when that would leave nothing, so the user is told why instead of being
  // handed a header with no data. A cancelled dialog resolves null and must not toast.
  async function exportVisible(visible, filters) {
    const real = visible.filter((study) => study.source === 'real');
    if (real.length === 0) return;
    const csv = toCsv(visible, {});
    try {
      const savedTo = await saveCsv({ text: csv, suggestedName: exportFileName(filters.workspace) });
      if (savedTo) showToast(`Exported ${real.length} ${real.length === 1 ? 'row' : 'rows'} to ${savedTo}`);
    } catch (error) {
      showToast(`Could not export: ${error.message}`);
    }
  }

  function buildFilterBar(live, queried, visible, filters) {
    const workspaceSelect = el('select', {
      class: 'param-select param-select-workspace', 'aria-label': 'Filter by workspace', 'data-param-key': 'workspace',
      // Changing the workspace clears the folder: a folder is only meaningful within its root.
      onChange: (event) => setFilters({ workspace: event.target.value === '' ? null : event.target.value, folder: null }),
    });
    workspaceSelect.append(el('option', { value: '' }, 'All workspaces'));
    // Options come from the whole library, not the searched subset, so a workspace does not
    // vanish from the dropdown because the search box happens to exclude its films.
    for (const option of workspaceOptions(live.studies)) {
      workspaceSelect.append(el('option', {
        value: option.value, ...(option.value === HAND_ADDED ? {} : { title: option.value }),
      }, option.label));
    }
    workspaceSelect.value = filters.workspace ?? '';

    const folderSelect = el('select', {
      class: 'param-select param-select-folder', 'aria-label': 'Filter by folder', 'data-param-key': 'folder',
      onChange: (event) => setFilters({ folder: event.target.value === '' ? null : event.target.value }),
    });
    folderSelect.append(el('option', { value: '' }, 'All folders'));
    for (const option of folderOptions(live.studies, filters.workspace)) {
      folderSelect.append(el('option', { value: option.value }, option.label));
    }
    folderSelect.value = filters.folder ?? '';

    const hidden = hiddenUnsegmented(queried, filters);
    const segmented = checkbox({
      key: 'segmented', label: 'Segmented only', checked: filters.segmentedOnly,
      note: filters.segmentedOnly && hidden > 0 ? ` \u00B7 ${hidden} unsegmented hidden` : null,
      onChange: (event) => setFilters({ segmentedOnly: event.target.checked }),
    });
    const levels = checkbox({
      key: 'levels', label: 'Levels', checked: live.paramLevels === true, note: null,
      onChange: (event) => setState({ paramLevels: event.target.checked }),
    });

    const exportable = visible.filter((study) => study.source === 'real').length;
    const exportButton = el('button', {
      type: 'button', class: 'btn btn-small param-export', 'data-param-key': 'export',
      disabled: exportable === 0,
      // No tooltip on the enabled button: it would only repeat the label it sits on.
      title: exportable > 0 ? '' : (visible.length === 0 ? 'Nothing to export' : 'Demo studies are not exported'),
      onClick: () => exportVisible(visible, filters),
    }, 'Export CSV');

    return el('div', { class: 'param-bar' },
      workspaceSelect, folderSelect, segmented, levels,
      el('div', { class: 'param-count', 'data-param-key': 'count' }, `${visible.length} OF ${live.studies.length} STUDIES SHOWN`),
      exportButton);
  }

  function sortableHeader(key, label, sort, extraClass) {
    const active = sort.key === key;
    return el('th', {
      scope: 'col', class: `param-th${extraClass ? ` ${extraClass}` : ''}`,
      'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none',
    },
      el('button', {
        type: 'button', class: `param-sort${active ? ' is-active' : ''}`, 'data-param-key': `sort-${key}`,
        onClick: () => toggleSort(key),
      },
        label,
        el('span', { class: 'param-sort-mark', 'aria-hidden': 'true' }, active ? (sort.dir === 'asc' ? ' \u25B4' : ' \u25BE') : '')));
  }

  function plainHeader(label) {
    return el('th', { scope: 'col', class: 'param-th' }, label);
  }

  function buildRow(study, columns, fields) {
    const values = parameterValues(study);
    const inconsistent = study.measurements != null && !isConsistent(study.measurements);
    const nameCell = el('th', { scope: 'row', class: 'param-cell-study' },
      el('button', {
        type: 'button', class: 'param-open', 'data-param-key': `open-${study.id}`, title: study.id,
        onClick: () => onOpen(study),
      }, studyName(study)),
      study.source === 'demo' ? el('span', { class: 'pill-demo' }, 'DEMO') : null);
    return el('tr', { class: 'param-row', 'data-study-id': study.id },
      nameCell,
      el('td', { class: 'param-cell-text' }, study.view || '\u2014'),
      ...columns.map((column) => {
        // The panel's consistency warning, on the PI cell: the residual |PI − (PT + SS)| is over
        // the limit, so the three pelvic numbers on this row do not agree with each other.
        const flag = column.key === 'PI' && inconsistent;
        return el('td', {
          class: `param-cell-num${flag ? ' is-inconsistent' : ''}`, ...(flag ? { title: INCONSISTENT_TITLE } : {}),
        }, formatParameter(values[column.key]));
      }),
      ...fields.map((field) => el('td', { class: 'param-cell-text' },
        study.clinical && study.clinical[field] != null && study.clinical[field] !== '' ? String(study.clinical[field]) : '')),
      el('td', { class: 'param-cell-text' }, workspaceLabel(study)),
      el('td', { class: 'param-cell-text', ...(pathTitle(study) ? { title: pathTitle(study) } : {}) }, folderLabel(study)));
  }

  function buildGrid(live, visible) {
    const columns = measurementColumns(live.paramLevels === true);
    const fields = live.fields ?? [];
    const sort = { ...DEFAULT_SORT, ...(live.paramSort ?? {}) };
    const head = el('thead', {}, el('tr', {},
      sortableHeader('study', 'STUDY', sort, 'param-col-study'),
      plainHeader('VIEW'),
      ...columns.map((column) => sortableHeader(column.key, column.label.toUpperCase(), sort, 'param-col-num')),
      ...fields.map((field) => plainHeader(field.toUpperCase())),
      sortableHeader('workspace', 'WORKSPACE', sort),
      plainHeader('FOLDER')));
    const body = el('tbody', {}, ...visible.map((study) => buildRow(study, columns, fields)));
    return el('div', { class: 'param-table-wrap card', 'data-param-key': 'grid' },
      el('table', { class: 'param-table' }, head, body));
  }

  function update(live, queried) {
    const key = [live.studies, live.query, live.paramFilters, live.paramSort, live.paramLevels, live.fields];
    if (sameKey(key, lastKey)) return;
    lastKey = key;

    // Focus snapshot, restored by data-param-key after the rebuild (components/measurements.js
    // does the same with data-row-key). Only when focus is inside this panel: a rebuild must
    // never steal focus from the search box or the tab strip.
    const active = document.activeElement;
    const focusKey = root.contains(active) ? active.getAttribute('data-param-key') : null;

    clear(root);
    const filters = normaliseFilters(live.paramFilters, live.studies);
    const visible = sortParameters(filterParameters(queried, filters), live.paramSort);
    root.append(buildFilterBar(live, queried, visible, filters));
    const reason = emptyReason({ total: live.studies.length, visible: visible.length, filters, query: live.query });
    if (reason !== null) {
      root.append(el('div', { class: 'studies-empty card param-empty', 'data-param-key': 'empty' }, EMPTY_COPY[reason]));
    } else {
      root.append(buildGrid(live, visible));
    }

    if (focusKey !== null) {
      for (const candidate of root.querySelectorAll('[data-param-key]')) {
        if (candidate.getAttribute('data-param-key') === focusKey) {
          if (typeof candidate.focus === 'function') candidate.focus();
          break;
        }
      }
    }
  }

  return { update };
}
