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
  workspaceOptions, folderOptions, normaliseFilters, patchFilters, filterParameters,
  hiddenUnsegmented, sortParameters, emptyReason, exportFileName,
  toggleId, withIds, selectedVisible, rowsToExport,
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
// `label: null` builds the bare tick box the grid uses (row select and select-all), which carries
// its name in `ariaLabel` instead: a visible label in the STUDY column would repeat the row's own
// name in every row. The hidden input stays inside the <label> so a click anywhere on the box --
// including a synthetic click at the 1x1 input's own rect, which is how the smoke suite drives it
// -- lands on the label and toggles the control.
function checkbox({ key, label, checked, note, ariaLabel, indeterminate, onChange }) {
  const input = el('input', {
    type: 'checkbox', checked, 'data-param-key': key, onChange,
    ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
  });
  // A property, not an attribute, and it has no markup form: it must be assigned on the node.
  if (indeterminate === true) input.indeterminate = true;
  return el('label', { class: `checkbox-row param-check${label === null ? ' param-pick' : ''}` },
    input,
    el('span', { class: 'checkbox-box', innerHTML: CHECK_SVG }),
    label === null ? null
      : el('span', { class: 'param-check-label' }, label, note ? el('span', { class: 'param-check-note' }, note) : null));
}

export function mountParameters(host, { onOpen }) {
  clear(host);
  const root = el('div', { class: 'param-panel' });
  host.append(root);
  let lastKey = null;

  // Filters are one object replaced wholesale, so the screen's gate sees every change. The patch
  // is merged over the NORMALISED filters -- the ones the controls below are showing -- not over
  // the raw stored object: patching a stale stored workspace back in makes normaliseFilters drop
  // the folder with it, and the pick is swallowed. patchFilters owns that rule and is tested.
  function setFilters(patch) {
    setState((s) => ({ paramFilters: patchFilters(s.paramFilters, s.studies, patch) }));
  }

  function toggleSort(key) {
    setState((s) => {
      const current = { ...DEFAULT_SORT, ...(s.paramSort ?? {}) };
      const dir = current.key === key && current.dir === 'asc' ? 'desc' : 'asc';
      return { paramSort: { key, dir } };
    });
  }

  // Writes the rows it is given, as one long-format file (spec §11.1): the visible rows, or -- when
  // any visible row is ticked -- the visible selected ones (rowsToExport decides which). toCsv
  // drops demo rows itself; the button is disabled when that would leave nothing, so the user is
  // told why instead of being handed a header with no data. A cancelled dialog resolves null and
  // must not toast.
  async function exportVisible(rows, filters) {
    const real = rows.filter((study) => study.source === 'real');
    if (real.length === 0) return;
    const csv = toCsv(rows);
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

    // What Export would write, and how much of it the user picked. A tick on a row the current
    // filter hides counts for neither: `chosen` is the ticked rows that are VISIBLE, so the label,
    // the count and the file all describe the same set. The hidden tick stays in the store and
    // comes back with the filter.
    const chosen = selectedVisible(visible, live.paramSelected);
    const rows = rowsToExport(visible, live.paramSelected);
    const exportable = rows.filter((study) => study.source === 'real').length;
    // Chromium shows no tooltip on a disabled control, so the reason is both the title and a
    // visible note beside the button.
    const reason = visible.length === 0 ? 'Nothing to export' : 'Demo studies are not exported';
    const exportButton = el('button', {
      type: 'button', class: 'btn btn-small param-export', 'data-param-key': 'export',
      disabled: exportable === 0,
      // No tooltip on the enabled button: it would only repeat the label it sits on.
      title: exportable > 0 ? '' : reason,
      onClick: () => exportVisible(rows, filters),
    }, chosen.length > 0 ? `Export ${chosen.length} selected` : 'Export CSV');

    return el('div', { class: 'param-bar' },
      workspaceSelect, folderSelect, segmented, levels,
      el('div', { class: 'param-count', 'data-param-key': 'count' },
        `${visible.length} OF ${live.studies.length} STUDIES SHOWN${chosen.length > 0 ? ` \u00B7 ${chosen.length} SELECTED` : ''}`),
      // Button and note in one group: the bar wraps, and on their own they land on separate lines
      // with the reason at the far left, reading as a stray line rather than as this button's.
      el('div', { class: 'param-export-group' },
        exportButton,
        exportable === 0 ? el('span', { class: 'param-export-note', 'data-param-key': 'export-note' }, reason) : null));
  }

  // `lead` is a node placed before the sort button inside the header cell -- the STUDY column's
  // select-all box. Null for every other column.
  function sortableHeader(key, label, sort, extraClass, lead) {
    const active = sort.key === key;
    return el('th', {
      scope: 'col', class: `param-th${extraClass ? ` ${extraClass}` : ''}`,
      'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none',
    },
      lead ?? null,
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

  function buildRow(study, columns, fields, selected) {
    const values = parameterValues(study);
    const inconsistent = study.measurements != null && !isConsistent(study.measurements);
    // The tick sits inside the sticky STUDY cell, before the name, so it scrolls with the column
    // it belongs to and stays on screen with the row's identity. toggleId returns a new array:
    // the store's selection is replaced, never mutated.
    const nameCell = el('th', { scope: 'row', class: 'param-cell-study' },
      checkbox({
        key: `select-${study.id}`, label: null, checked: selected.includes(study.id),
        ariaLabel: `Select ${studyName(study)}`,
        onChange: () => setState((s) => ({ paramSelected: toggleId(s.paramSelected, study.id) })),
      }),
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
        // Only on a cell that shows a number: a record with measurements but no PI/PT/SS makes the
        // residual NaN, and isConsistent false, which would paint an em dash in the warning colour
        // with a tooltip about numbers that are not there.
        const flag = column.key === 'PI' && inconsistent && values.PI !== null;
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
    const selected = live.paramSelected ?? [];
    // Select-all is about the VISIBLE rows only, so it never ticks a film the filter is hiding.
    // `ids` is this render's own array, captured by the handler exactly as the Export button
    // captures `visible`; withIds leaves ticks outside it alone.
    const ids = visible.map((study) => study.id);
    const picked = ids.filter((id) => selected.includes(id)).length;
    const selectAll = checkbox({
      key: 'select-all', label: null, ariaLabel: 'Select all visible studies',
      checked: ids.length > 0 && picked === ids.length,
      indeterminate: picked > 0 && picked < ids.length,
      onChange: (event) => {
        // Read before setState: the rebuild it triggers replaces this input.
        const on = event.target.checked;
        setState((s) => ({ paramSelected: withIds(s.paramSelected, ids, on) }));
      },
    });
    const head = el('thead', {}, el('tr', {},
      sortableHeader('study', 'STUDY', sort, 'param-col-study', selectAll),
      plainHeader('VIEW'),
      ...columns.map((column) => sortableHeader(column.key, column.label.toUpperCase(), sort, 'param-col-num')),
      ...fields.map((field) => plainHeader(field.toUpperCase())),
      sortableHeader('workspace', 'WORKSPACE', sort),
      plainHeader('FOLDER')));
    const body = el('tbody', {}, ...visible.map((study) => buildRow(study, columns, fields, selected)));
    return el('div', { class: 'param-table-wrap card', 'data-param-key': 'grid' },
      el('table', { class: 'param-table' }, head, body));
  }

  function update(live, queried) {
    // A hidden panel is not rebuilt: typing in the Studies search box notifies on every keystroke
    // and the Find tab is what the user is looking at. Returning BEFORE lastKey is assigned leaves
    // the key stale, so the first notification after the tab is shown rebuilds if anything the
    // grid reads has changed, and skips if nothing has.
    if (live.studiesTab !== 'parameters') return;

    // This array is the tab's single point of failure. Every store key the grid reads must be
    // listed here or the grid silently stops repainting for it -- the same warning router.js
    // carries for SCREEN_KEYS.
    const key = [live.studies, live.query, live.paramFilters, live.paramSort, live.paramLevels, live.fields,
      live.paramSelected];
    if (sameKey(key, lastKey)) return;
    lastKey = key;

    // Focus snapshot, restored by data-param-key after the rebuild (components/measurements.js
    // does the same with data-row-key). Only when focus is inside this panel: a rebuild must
    // never steal focus from the search box or the tab strip.
    const active = document.activeElement;
    const focusKey = root.contains(active) ? active.getAttribute('data-param-key') : null;

    // The scroll container is replaced by the rebuild, so a new node starts at 0. Nothing else
    // restores it -- a keystroke in the search box has focus outside this panel -- and a wide grid
    // scrolled right would jump back to PI on every keystroke. The browser clamps a larger offset
    // than the new table allows, which is the right answer when the columns changed.
    const oldWrap = root.querySelector('.param-table-wrap');
    const scroll = oldWrap ? { left: oldWrap.scrollLeft, top: oldWrap.scrollTop } : null;

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

    if (scroll !== null) {
      const newWrap = root.querySelector('.param-table-wrap');
      if (newWrap) {
        newWrap.scrollLeft = scroll.left;
        newWrap.scrollTop = scroll.top;
      }
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
