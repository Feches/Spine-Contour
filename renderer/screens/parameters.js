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
  HAND_ADDED, ANY_POST, DEFAULT_SORT, measurementColumns, parameterValues, formatParameter,
  workspaceOptions, folderOptions, normaliseFilters, patchFilters, filterParameters,
  hiddenUnsegmented, sortParameters, emptyReason, exportFileName,
  toggleId, withIds, selectedVisible, rowsToExport,
  timepointOptions, viewOptions, pairedWithOptions, hiddenUnpaired, subjectBreaks,
} from '../data/parameters.js';

const EMPTY_COPY = {
  none: 'No studies yet \u2014 choose or drop a radiograph on the Find tab, or load a workspace folder.',
  unsegmented: 'No segmented studies yet \u2014 open a study and run segmentation.',
  filtered: 'No studies match these filters.',
};

// The Measurements panel's own wording for a PI/PT/SS residual over the limit.
const INCONSISTENT_TITLE = 'Parameters inconsistent \u2014 check S1 and femoral landmarks.';

const DASH = '\u2014';

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

    // Timepoint and view: dropdowns of what is present (spec §10.3); each shows its value and
    // clears it with its All… entry. Options come from the whole library, as the workspace ones do.
    const timepointSelect = el('select', {
      class: 'param-select param-select-timepoint', 'aria-label': 'Filter by timepoint', 'data-param-key': 'timepoint',
      onChange: (event) => setFilters({ timepoint: event.target.value === '' ? null : event.target.value }),
    });
    timepointSelect.append(el('option', { value: '' }, 'All timepoints'));
    for (const option of timepointOptions(live.studies)) timepointSelect.append(el('option', { value: option.value }, option.label));
    timepointSelect.value = filters.timepoint ?? '';

    const viewSelect = el('select', {
      class: 'param-select param-select-view', 'aria-label': 'Filter by view', 'data-param-key': 'view',
      onChange: (event) => setFilters({ view: event.target.value === '' ? null : event.target.value }),
    });
    viewSelect.append(el('option', { value: '' }, 'All views'));
    for (const option of viewOptions(live.studies)) viewSelect.append(el('option', { value: option.value }, option.label));
    viewSelect.value = filters.view ?? '';

    // Substring on the subject, committed on every keystroke like the Studies search box. The
    // rebuild replaces this input; update() hands focus and the caret back by data-param-key.
    const subjectInput = el('input', {
      type: 'search', class: 'param-subject', placeholder: 'Subject…', 'aria-label': 'Filter by subject',
      'data-param-key': 'subject', value: filters.subject ?? '',
      onInput: (event) => setFilters({ subject: event.target.value }),
    });

    // Paired only, and which post-side label pairs with Pre-op (§10.3). The `with` select stays
    // disabled until the box is ticked; the note says how many rows the tick hides. A stored
    // label the options do not list (a relabelled library) is still offered so the control never
    // shows a value it does not hold.
    const pairedWithSelect = el('select', {
      class: 'param-select param-select-paired-with', 'aria-label': 'Paired with', 'data-param-key': 'paired-with',
      disabled: filters.pairedOnly !== true,
      onChange: (event) => setFilters({ pairedWith: event.target.value }),
    });
    const withOptions = pairedWithOptions(live.studies);
    const chosenWith = filters.pairedWith || ANY_POST;
    if (!withOptions.some((option) => option.value === chosenWith)) withOptions.push({ value: chosenWith, label: chosenWith });
    for (const option of withOptions) pairedWithSelect.append(el('option', { value: option.value }, option.label));
    pairedWithSelect.value = chosenWith;
    const unpaired = hiddenUnpaired(queried, filters);
    const paired = checkbox({
      key: 'paired', label: 'Paired only', checked: filters.pairedOnly === true,
      note: filters.pairedOnly === true && unpaired > 0 ? ` \u00B7 ${unpaired} unpaired hidden` : null,
      onChange: (event) => setFilters({ pairedOnly: event.target.checked }),
    });
    const pairedGroup = el('div', { class: 'param-paired' }, paired, el('span', { class: 'param-paired-with' }, 'with'), pairedWithSelect);

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
      workspaceSelect, folderSelect, timepointSelect, viewSelect, subjectInput, pairedGroup, segmented, levels,
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
  // `ariaLabel` names the CELL itself. A header cell's accessible name is computed from its
  // contents, so the STUDY cell -- which holds the select-all box as well as the sort button --
  // would otherwise announce as "Select all visible studies STUDY", and a screen reader repeats
  // that name on every data cell in the column. Only the STUDY call passes it; the select-all
  // box and the sort button keep their own labels.
  function sortableHeader(key, label, sort, extraClass, lead, ariaLabel) {
    const active = sort.key === key;
    return el('th', {
      scope: 'col', class: `param-th${extraClass ? ` ${extraClass}` : ''}`,
      'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none',
      ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
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

  function buildRow(study, columns, fields, selected, isBreak) {
    const values = parameterValues(study);
    const inconsistent = study.measurements != null && !isConsistent(study.measurements);
    // The tick sits inside the sticky STUDY cell, before the name, so it scrolls with the column
    // it belongs to and stays on screen with the row's identity. toggleId returns a new array:
    // the store's selection is replaced, never mutated.
    // aria-label names the ROW HEADER itself. Its accessible name is otherwise computed from its
    // contents -- the tick ("Select <name>") and the open button (<name>) -- which announces as
    // "Select <name> <name>", and a row header's name is repeated on every cell in the row.
    // The checkbox and the button keep their own labels.
    const nameCell = el('th', { scope: 'row', class: 'param-cell-study', 'aria-label': studyName(study) },
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
    // A rule above the first row of each subject block under the subject sort (spec §10.3).
    return el('tr', { class: `param-row${isBreak ? ' param-row-break' : ''}`, 'data-study-id': study.id },
      nameCell,
      // Subject, timepoint, view, film date (spec §10.2): text as stored, an em dash when absent;
      // the film date as stored (YYYY-MM-DD), the Find tab's formatted DATE being the date added.
      el('td', { class: 'param-cell-text' }, study.subjectId || DASH),
      el('td', { class: 'param-cell-text' }, study.timepoint || DASH),
      el('td', { class: 'param-cell-text' }, study.view || DASH),
      el('td', { class: 'param-cell-text param-cell-date' }, study.filmDate || DASH),
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
      sortableHeader('study', 'STUDY', sort, 'param-col-study', selectAll, 'STUDY'),
      sortableHeader('subject', 'SUBJECT', sort),
      plainHeader('TIMEPOINT'),
      plainHeader('VIEW'),
      plainHeader('FILM DATE'),
      ...columns.map((column) => sortableHeader(column.key, column.label.toUpperCase(), sort, 'param-col-num')),
      ...fields.map((field) => plainHeader(field.toUpperCase())),
      sortableHeader('workspace', 'WORKSPACE', sort),
      plainHeader('FOLDER')));
    const breaks = subjectBreaks(visible, sort);
    const body = el('tbody', {}, ...visible.map((study, i) => buildRow(study, columns, fields, selected, breaks[i])));
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
    // A text control's caret goes with its focus: the subject box is rebuilt on every keystroke,
    // and focus() alone would park the caret at the end of the text.
    const caret = focusKey !== null && active.tagName === 'INPUT' && active.type === 'search'
      ? { start: active.selectionStart, end: active.selectionEnd } : null;

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
          candidate.focus();
          if (caret !== null && caret.start !== null && typeof candidate.setSelectionRange === 'function') {
            candidate.setSelectionRange(caret.start, caret.end);
          }
          break;
        }
      }
    }
  }

  return { update };
}
