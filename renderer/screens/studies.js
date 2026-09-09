/**
 * Studies screen (spec 9.4). Heading, the {n} STUDIES · {m} UNSEGMENTED summary, search, the
 * dropzone (click, drop, Choose radiograph), the Find tab's filter bar with the segment button
 * (batch spec 7), and the table with row ticks, derived status pills and the DEMO pill.
 * render(state) builds the shell; the summary, the bar and the table update in place from a
 * module-scope subscription, because router.js remounts this host only on screen/ack.
 */

import { deleteStudyBatch } from '../data/delete-studies.js';
import { el, mount } from '../dom.js';
import { getState, setState, subscribe } from '../store.js';
import { selectFile, pathForFile, deletePrediction, hideDemoStudies, persistenceDisabledReason } from '../api.js';
import { showToast } from '../components/toast.js';
import { deriveStatus, statusLabel } from '../data/status.js';
import { inferenceView, unsupportedViewReason } from '../data/inference-view.js';
import { defaultName, studyName, workspaceLabel, folderLabel, pathTitle } from '../data/labels.js';
import { nextId } from '../data/persistence.js';
import { DEFAULT_VIEW } from '../data/timepoints.js';
import {
  withIds, toggleId, workspaceOptions, folderOptions, normaliseFilters, patchFilters, matchesLocation, HAND_ADDED,
} from '../data/parameters.js';
import { planBatch, progressText, WAIT_FOR_BATCH } from '../data/batch.js';
import { progressTitle, progressDetail } from '../data/processing.js';
import { checkbox } from '../components/checkbox.js';
import { startBatch, stopBatch } from '../batch.js';
import { setFilePayload, releaseStudy } from './analysis.js';
import { forgetPrediction } from '../components/viewer.js';
import { mountParameters } from './parameters.js';

const UPLOAD_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16 V4"></path><path d="M7.5 8.5 L12 4 L16.5 8.5"></path><path d="M4.5 19.5 H19.5"></path></svg>';

// Same 24-unit stroke-icon convention as UPLOAD_SVG and components/viewer.js's toolbar.
const TRASH_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7 H20"></path><path d="M9 7 V4 H15 V7"></path><path d="M6 7 L7 20 H17 L18 7"></path><path d="M10 11 V16"></path><path d="M14 11 V16"></path></svg>';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

// Case-insensitive substring match over id, view, the demo set's own patient/diagnosis labels,
// and every CLINICAL VALUE on the record. Normalises the query itself, so the export is safe to
// call with raw input. The clinical values are what makes the search box's promise true on real
// studies: `pt`/`dx` exist only on the nine compiled-in demo records, so without them a
// diagnosis the user imported a minute ago could be typed here and find nothing. Values are
// user text of any shape, so the string filter below still guards the join. The study's name,
// its workspace and its containing folder are searchable because the table shows all three and
// a visible column you cannot search reads as broken. The subject, timepoint and film date are
// on the Parameters grid, which the box also filters. The FULL file path is still not: only the
// two folder names the cells actually display are matched.
export function matchesQuery(study, query) {
  const needle = (query ?? '').trim().toLowerCase();
  if (!needle) return true;
  return [study.id, studyName(study), study.subjectId, study.timepoint, study.filmDate, workspaceLabel(study), folderLabel(study), study.pt, study.dx, study.view, ...Object.values(study.clinical ?? {})]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

// An unsegmented real Study. Bytes are NOT on the record (screens/analysis.js's payload map);
// measurements, geometry, qc and thumbnail arrive when the run completes.
// `name` is what a human reads; `id` stays the record's identity -- it names the sidecar on
// disk, keys the delete and the CSV join, and must keep matching main.js's /^SP-\d{4,}$/.
// `workspaceFolder` is set by the workspace load; a film added with the picker or dropped on
// the list has none, and that em dash in the table is how you tell the two apart.
export function newStudy({ id, fileName, filePath, workspaceFolder = null }) {
  return {
    id, source: 'real', filePath: filePath ?? null, fileName,
    name: defaultName(fileName), workspaceFolder,
    // Pre-op/post-op spec §7.1: set by a workspace load, the CSV or the drawer; null until then.
    subjectId: null, timepoint: null, filmDate: null,
    addedAt: new Date().toISOString(), view: DEFAULT_VIEW, thumbnail: null,
    measurements: null, geometry: null, qc: null, clinical: {},
  };
}

// Every path that changes openId resets the per-study view state, so a study never inherits
// the previous one's zoom, pan, selection or edit mode (handoff item 6).
const FRESH_VIEW = { selectedLevel: null, zoom: 1, panX: 0, panY: 0, panMode: false, editing: false, selection: null };

function openStudy(study) {
  setState({ screen: 'analysis', openId: study.id, ...FRESH_VIEW });
}

// The one entry point for the picker and a drop. Inserts at the front.
function addStudy({ name, data, path }) {
  const id = nextId(getState().studies);
  setFilePayload(id, data);
  setState((state) => ({
    studies: [newStudy({ id, fileName: name, filePath: path ?? null }), ...state.studies],
    openId: id,
    screen: 'analysis',
    ...FRESH_VIEW,
  }));
}

async function handleChoose() {
  try {
    const chosen = await selectFile();
    if (!chosen) return;
    addStudy(chosen);
  } catch (error) {
    showToast(`Could not open file: ${error.message}`);
  }
}

// The same extensions the native picker offers (main.js's select-file filter).
const FILM_EXTENSIONS = /\.(dcm|dicom|png|jpe?g|tiff?|bmp|webp)$/i;

async function handleDrop(files) {
  if (files.length > 1) {
    showToast('Drop one film at a time.');
    return;
  }
  const file = files[0];
  if (!FILM_EXTENSIONS.test(file.name)) {
    showToast(`${file.name} is not a radiograph file type.`);
    return;
  }
  try {
    const path = pathForFile(file);
    const buffer = await file.arrayBuffer();
    addStudy({ name: file.name, data: new Uint8Array(buffer), path });
  } catch (error) {
    showToast(`Could not open file: ${error.message}`);
  }
}

function dropzone() {
  const chooseButton = el('button', {
    type: 'button', class: 'btn btn-primary btn-small',
    onClick: (event) => { event.stopPropagation(); handleChoose(); },
  }, 'Choose radiograph');
  const zone = el('div', {
    class: 'dropzone dropzone-clickable', tabindex: '0', 'aria-label': 'Choose a radiograph, or drop one here',
    onClick: () => handleChoose(),
    onKeydown: (event) => {
      if (event.target !== zone) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleChoose(); }
    },
  },
    el('div', { class: 'dropzone-icon', innerHTML: UPLOAD_SVG }),
    el('div', { class: 'dropzone-text' },
      el('div', { class: 'dropzone-title' }, 'Drop a DICOM series or lateral radiograph'),
      el('div', { class: 'dropzone-subtitle' }, 'De-identified files only. Segmentation runs locally on the workstation.')),
    chooseButton);
  zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('dropzone-active'); });
  // dragleave also fires when the pointer crosses onto a child; the next dragover re-adds the
  // class, so the flicker is one frame and accepted.
  zone.addEventListener('dragleave', () => zone.classList.remove('dropzone-active'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('dropzone-active');
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) handleDrop(files);
  });
  return zone;
}

function statusBadge(status) {
  return el('span', { class: `badge badge-${status}` }, el('span', { class: 'dot' }), statusLabel(status));
}

// The trailing cell of a row: a delete button for a real study, the two-step prompt while
// that study is the one being confirmed, an empty cell for a demo study (compiled in, never
// written -- there is nothing to delete). Every click inside stops at the cell so the row's
// own click cannot open the study underneath the prompt.
function actionCell(study, confirming) {
  if (study.source !== 'real') return el('div', { class: 'studies-cell-actions' });
  if (!confirming) {
    return el('div', { class: 'studies-cell-actions' },
      el('button', {
        type: 'button', class: 'icon-btn studies-delete',
        'aria-label': `Delete ${studyName(study)}`, title: 'Delete study', innerHTML: TRASH_SVG,
        onClick: (event) => { event.stopPropagation(); askToDelete(study.id); },
      }));
  }
  return el('div', {
    class: 'studies-cell-actions studies-cell-actions-confirming',
    onClick: (event) => event.stopPropagation(),
  },
    el('span', { class: 'studies-delete-prompt' }, 'Delete this study?'),
    el('button', {
      type: 'button', class: 'btn btn-small studies-delete-confirm', onClick: () => deleteStudy(study.id),
    }, 'Delete'),
    el('button', {
      type: 'button', class: 'btn btn-small studies-delete-cancel', onClick: () => cancelDelete(),
    }, 'Cancel'));
}

// `runningId` is state.running: the id of the study whose /predict is in flight, or null.
// The "or currently running" half of spec 13.1's Processing rule lives here rather than in
// deriveStatus, which stays a pure function of the record and knows nothing about the store.
function buildRow(study, runningId, selected) {
  const status = runningId === study.id ? 'proc' : deriveStatus(study);
  const unsupported = study.source === 'real' && study.measurements == null
    && runningId !== study.id && !inferenceView(study.view);
  const patientChildren = [study.pt || '—'];
  if (study.source === 'demo') patientChildren.push(el('span', { class: 'pill-demo' }, 'DEMO'));
  // While this row is confirming a delete, the prompt takes every cell from WORKSPACE rightwards
  // (see .studies-cell-actions-confirming); the study, patient and view cells stay visible.
  // Those four are nulled together and the prompt's grid-column start is the 4th track, so the
  // placement cursor is still at 4 when the action cell is laid out. Adding a VISIBLE cell
  // before the prompt without moving that start line would push the cursor past it and wrap the
  // prompt onto a second row.
  const confirming = confirmingId === study.id;
  const row = el('div', {
    class: 'studies-row', role: 'button', tabindex: '0', 'data-study-id': study.id,
    onClick: () => openStudy(study),
    onKeydown: (event) => {
      // Escape anywhere in the row (its prompt buttons included) withdraws the prompt.
      if (event.key === 'Escape' && confirmingId === study.id) { event.preventDefault(); cancelDelete(); return; }
      // Enter/Space on the row itself opens the study. On one of the action buttons they are
      // that button's own activation and must reach it (the dropzone makes the same check).
      if (event.target !== row) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openStudy(study); }
    },
  },
    el('div', { class: 'studies-cell-id', title: study.id },
      // The tick (batch spec 7.2), on real rows only: a demo study has no film to segment, as it
      // has no delete control. The label's click stops at the label, so the row's own click does
      // not open the study; Space on the box is the box's own activation and already bypasses
      // the row's keydown handler (event.target !== row). toggleId returns a new array: the
      // store's selection -- the same paramSelected the Parameters grid ticks -- is replaced,
      // never mutated.
      study.source === 'real'
        ? checkbox({
          key: `row-${study.id}`, keyAttr: 'data-find-key', label: null, checked: selected.includes(study.id),
          ariaLabel: `Select ${studyName(study)}`,
          onClick: (event) => event.stopPropagation(),
          onChange: () => setState((s) => ({ paramSelected: toggleId(s.paramSelected, study.id) })),
        })
        : null,
      el('span', { class: 'studies-name' }, studyName(study))),
    el('div', { class: 'studies-cell-patient' }, ...patientChildren),
    el('div', { class: 'studies-cell-view' }, study.view || '—'),
    confirming ? null : el('div', { class: 'studies-cell-workspace' }, workspaceLabel(study)),
    confirming ? null : el('div', { class: 'studies-cell-folder', ...(pathTitle(study) ? { title: pathTitle(study) } : {}) }, folderLabel(study)),
    confirming ? null : el('div', { class: 'studies-cell-date' }, formatDate(study.addedAt)),
    confirming ? null : el('div', {}, unsupported
      ? el('span', { class: 'badge badge-rev', title: unsupportedViewReason(study.view) },
        el('span', { class: 'dot' }), 'Unsupported view')
      : statusBadge(status)),
    actionCell(study, confirming));
  return row;
}

// Why the table is empty (batch spec 7.5). 'search' and 'none' are what the file carried: they used
// to be one sentence, because the nine demo studies made a genuinely empty library unreachable, and
// now that an installed app opens with nothing, "No studies match that search." over a library the
// user has not filled yet would blame a search they never made. 'filters' is new -- a workspace or
// folder set with nothing left. The search wording is pinned by tools/smoke/smoke-studies.mjs --
// keep it exactly. The 'none' string is byte-identical to the one the file always carried.
const EMPTY_COPY = {
  search: 'No studies match that search.',
  filters: 'No studies match these filters.',
  none: 'No studies yet — choose or drop a radiograph above, or load a workspace folder.',
};

// `emptyKind` is null (the library is empty), 'search' or 'filters'. `selected` is paramSelected.
function buildTable(studies, runningId, emptyKind, selected) {
  // An explicit arrow, not `studies.map(buildRow)`: map passes the index as the second
  // argument, so every row would receive its own position as `runningId` and the running
  // study would silently never be badged Processing. The arrow is load-bearing.
  const body = studies.length > 0
    ? studies.map((study) => buildRow(study, runningId, selected))
    : [el('div', { class: 'studies-empty' }, EMPTY_COPY[emptyKind ?? 'none'])];
  // Select-all (batch spec 7.2) is about the VISIBLE real rows only, so it never ticks a film the
  // filter is hiding, and it is built only when there is one: the fresh dev library of demo
  // studies shows the plain heading. `ids` is this render's own array, captured by the handler;
  // withIds leaves ticks outside it alone. `checked` is read before setState: the rebuild it
  // triggers replaces this input.
  const ids = studies.filter((study) => study.source === 'real').map((study) => study.id);
  const picked = ids.filter((id) => selected.includes(id)).length;
  const selectAll = ids.length > 0
    ? checkbox({
      key: 'select-all', keyAttr: 'data-find-key', label: null, ariaLabel: 'Select all visible studies',
      checked: picked === ids.length, indeterminate: picked > 0 && picked < ids.length,
      onChange: (event) => {
        const on = event.target.checked;
        setState((s) => ({ paramSelected: withIds(s.paramSelected, ids, on) }));
      },
    })
    : null;
  return el('div', { class: 'studies-table card' },
    el('div', { class: 'studies-table-head' },
      el('div', { class: 'studies-head-study' }, selectAll, 'STUDY'), el('div', {}, 'PATIENT'), el('div', {}, 'VIEW'),
      el('div', {}, 'WORKSPACE'), el('div', {}, 'FOLDER'),
      el('div', {}, 'DATE'), el('div', {}, 'STATUS'),
      el('div', {})),
    ...body);
}

function sameKey(a, b) {
  return a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

// The live mount, or null when this screen is not on screen. See screens/analysis.js for why
// the subscription is module-scope and registered once: render() runs on every navigation.
// `host` is the table's container, so the delete helpers can hand focus back after a repaint.
let mounted = null;

// The id of the real study whose row shows the two-step delete prompt, or null. Module scope,
// not the store: it is one screen's transient UI, and a new key would change the contract's
// state shape. The store cannot see it, so update() lists it in its key explicitly and every
// change to it below repaints through refreshTable().
let confirmingId = null;
let confirmingAll = false;

subscribe((state) => {
  // Navigation withdraws an open prompt along with the mount.
  if (state.screen !== 'studies') { mounted = null; confirmingId = null; confirmingAll = false; return; }
  if (mounted) mounted.update(state);
});

// Repaint the table from the current store after confirmingId changes. Called from DOM event
// handlers only, never from inside a subscriber. The repaint replaces the row's nodes, which
// drops keyboard focus onto the body; `focusSelector` names the node that gets it back.
function refreshTable(focusSelector) {
  if (!mounted) return;
  mounted.update(getState());
  if (focusSelector) {
    const target = mounted.host.querySelector(focusSelector);
    if (target) target.focus();
  }
}

// Focus lands on CANCEL, not Delete. The repaint drops focus to <body>, so something must
// take it; the safe half of a destructive pair is the one that may be triggered by a stray
// Enter or Space. Delete is one Tab (or one click) away, and its own :focus-visible ring
// makes the difference visible before it is pressed.
function askToDelete(id) {
  if (getState().deletingStudies) return;
  confirmingAll = false;
  confirmingId = id;
  refreshTable('.studies-delete-cancel');
}

function cancelDelete() {
  const id = confirmingId;
  confirmingId = null;
  refreshTable(id ? `.studies-row[data-study-id="${id}"] .studies-delete` : null);
}

// Confirmed. The order is load-bearing: refuse a study whose run is in flight; the sidecar
// first, so a failure there leaves the record, its film and every cache exactly as they were;
// then the renderer caches keyed by this id (the viewer's snapshot and /measure bookkeeping,
// then bytes and bitmaps); then ONE setState that removes the record -- the persistence
// subscriber in renderer/main.js writes the new list, nothing here calls saveStudies. With
// persistence disabled the sidecar is left alone on purpose: a sidecar under this id may
// belong to the newer library this build cannot read, and the disabled saver writes nothing.
async function deleteStudy(id) {
  if (getState().deletingStudies) return;
  confirmingId = null;
  // Read the name before the record leaves the list -- the toast below fires after the setState
  // that removes it, and the user knows this study by its name, not by SP-nnnn.
  const label = studyName(getState().studies.find((s) => s.id === id) ?? { id });
  if (getState().running === id) {
    showToast('Wait for the segmentation to finish before deleting this study.');
    // The row is still there, so hand focus back to its trash button, as cancelDelete does;
    // a bare refreshTable() would drop the keyboard user onto <body>.
    refreshTable(`.studies-row[data-study-id="${id}"] .studies-delete`);
    return;
  }
  if (!persistenceDisabledReason()) {
    try {
      await deletePrediction(id);
    } catch (error) {
      showToast(`Could not delete the saved segmentation: ${error.message}`);
      refreshTable(`.studies-row[data-study-id="${id}"] .studies-delete`);
      return;
    }
  }
  // The check above is stale: the await opens a window in which a batch can reach this study,
  // pass segmentStudy's own identity check and start its run (batch spec 8.2/11). Tearing the
  // record down now would leave the finished run's sidecar and prediction snapshot behind under
  // an id the next film can reuse. So refuse late, exactly as the early check does: the record
  // stays and the run segments it, and an unsegmented study had no sidecar to lose.
  if (getState().running === id) {
    showToast('Wait for the segmentation to finish before deleting this study.');
    refreshTable(`.studies-row[data-study-id="${id}"] .studies-delete`);
    return;
  }
  forgetPrediction(id);
  releaseStudy(id);
  // The screen is already 'studies'. Naming it again is a no-op for the router (same value,
  // no remount) and covers the one gap the await above opens: the open study deleted from
  // the list must not stay on an Analysis screen that has no record behind it.
  setState((s) => ({
    studies: s.studies.filter((x) => x.id !== id),
    // nextId is max+1 over the surviving records, so deleting the highest-numbered study puts
    // its id straight back in circulation; a tick left behind here would land on the next film
    // added, which would arrive on the Parameters grid already selected. withIds returns a new
    // array -- the selection is replaced, never mutated.
    paramSelected: withIds(s.paramSelected, [id], false),
    ...(s.openId === id ? { openId: null, screen: 'studies', ...FRESH_VIEW } : {}),
  }));
  showToast(`Deleted ${label}`);
}

// live.batch as well as live.running: a batch holds `running` only while a film is in flight,
// so the gap between two films would let this through and clear the library out from under the
// driver's remaining ids.
async function deleteAllStudies() {
  const live = getState();
  if (live.running || live.batch || live.deletingStudies || persistenceDisabledReason()) return;
  const targets = [...live.studies];
  confirmingAll = false;
  confirmingId = null;
  setState({ deletingStudies: true });
  try {
    const { deleted, failed } = await deleteStudyBatch(targets, { deletePrediction, hideDemos: hideDemoStudies });
    const ids = new Set(deleted);
    for (const id of ids) { forgetPrediction(id); releaseStudy(id); }
    setState(current => ({
      studies: current.studies.filter(study => !ids.has(study.id)),
      deletingStudies: false, query: '',
      // Same reasoning as deleteStudy's own setState above: nextId reuses a deleted id
      // immediately, so a tick left on it would land on the next film added.
      paramSelected: withIds(current.paramSelected, [...ids], false),
      ...(ids.has(current.openId) ? { openId: null, screen: 'studies', ...FRESH_VIEW } : {}),
      ...(ids.has(current.compareId) ? { compareId: null } : {}),
    }));
    showToast(failed.length
      ? `Deleted ${deleted.length} studies. ${failed.length} could not be deleted and remain in the library: ${failed[0].message}`
      : `Deleted ${deleted.length} studies. Original image files were kept.`);
  } finally {
    if (getState().deletingStudies) setState({ deletingStudies: false });
  }
}

export function render(state) {
  confirmingId = null;
  confirmingAll = false;
  const summary = el('div', { class: 'studies-summary' });
  const search = el('input', {
    type: 'search', class: 'studies-search', value: state.query || '',
    placeholder: 'Search name, subject, workspace, folder, patient…', 'aria-label': 'Search studies',
    // A keystroke here can filter the confirming row out of the table; clearing the prompt
    // first stops it reappearing, primed on Delete, when the search is cleared again.
    // The setState notification repaints through the same gate (confirmingId is in the key),
    // so no extra refreshTable() is needed.
    onInput: (event) => { confirmingId = null; setState({ query: event.target.value }); },
  });
  const tableHost = el('div', { class: 'studies-table-host' });
  const barHost = el('div', { class: 'studies-filters-host' });
  // Library-level, so it sits above the tab strip: it acts on every study, the ones a search or a
  // filter is hiding included, and it is the same control whichever tab is showing.
  const bulkHost = el('div', { class: 'studies-bulk-actions' });

  // Two tabs. FIND is everything this screen was: the dropzone, the list and the search.
  // PARAMETERS is the grid of every segmented study's numbers (screens/parameters.js). The list
  // is for finding a study and the grid is for reading its numbers -- the split that paid for
  // deleting LORDOSIS from the list. The active tab is store state (studiesTab), so coming back
  // from Analysis lands on the tab the user left. The search box applies to both.
  const tabFind = el('button', {
    type: 'button', class: 'studies-tab', role: 'tab', id: 'studies-tab-find', 'data-param-key': 'tab-find',
    onClick: () => setState({ studiesTab: 'find' }),
  }, 'Find');
  const tabParameters = el('button', {
    type: 'button', class: 'studies-tab', role: 'tab', id: 'studies-tab-parameters', 'data-param-key': 'tab-parameters',
    onClick: () => setState({ studiesTab: 'parameters' }),
  }, 'Parameters');
  const tabs = el('div', { class: 'studies-tabs', role: 'tablist', 'aria-label': 'Studies views' }, tabFind, tabParameters);
  const findPanel = el('div', {
    class: 'studies-tabpanel', role: 'tabpanel', 'aria-labelledby': 'studies-tab-find',
  }, dropzone(), barHost, tableHost);
  const parametersHost = el('div', {
    class: 'studies-tabpanel studies-parameters-host', role: 'tabpanel', 'aria-labelledby': 'studies-tab-parameters',
  });
  const parameters = mountParameters(parametersHost, { onOpen: openStudy });

  // Filters are one object replaced wholesale. The patch is merged over the NORMALISED filters --
  // the ones the selects are showing -- exactly as screens/parameters.js does; patchFilters owns
  // that rule and is tested. These two keys are shared with the grid (batch spec decision 4).
  function setFilters(patch) {
    setState((s) => ({ paramFilters: patchFilters(s.paramFilters, s.studies, patch) }));
  }

  // The bar (batch spec 7.1, 7.3, 7.4): the grid's Workspace and Folder selects over the same
  // shared keys, then the segment button with its note -- or, while a batch runs, the progress
  // group. Chromium shows no tooltip on a disabled control, so the button's reason is a visible
  // note beside it. Options come from the whole library, not the searched subset, as the grid's
  // do. `visible` is the table's rows, in table order: the id list the button runs.
  function buildFilterBar(live, filters, visible) {
    const workspaceSelect = el('select', {
      class: 'param-select', 'aria-label': 'Filter by workspace', 'data-find-key': 'workspace',
      // Changing the workspace clears the folder: a folder is only meaningful within its root.
      onChange: (event) => setFilters({ workspace: event.target.value === '' ? null : event.target.value, folder: null }),
    });
    workspaceSelect.append(el('option', { value: '' }, 'All workspaces'));
    for (const option of workspaceOptions(live.studies)) {
      workspaceSelect.append(el('option', {
        value: option.value, ...(option.value === HAND_ADDED ? {} : { title: option.value }),
      }, option.label));
    }
    workspaceSelect.value = filters.workspace ?? '';

    const folderSelect = el('select', {
      class: 'param-select', 'aria-label': 'Filter by folder', 'data-find-key': 'folder',
      onChange: (event) => setFilters({ folder: event.target.value === '' ? null : event.target.value }),
    });
    folderSelect.append(el('option', { value: '' }, 'All folders'));
    for (const option of folderOptions(live.studies, filters.workspace)) {
      folderSelect.append(el('option', { value: option.value }, option.label));
    }
    folderSelect.value = filters.folder ?? '';

    let action;
    if (live.batch) {
      // Batch count plus live backend stages. Stop finishes the film in flight;
      // the sidebar can also cancel the current image and stop the batch.
      action = el('div', { class: 'studies-progress', 'data-find-key': 'progress' },
        el('span', { class: 'studies-progress-spinner', 'aria-hidden': 'true' }),
        el('span', { class: 'studies-progress-text' }, progressText(live.batch),
          live.running ? el('span', { class: 'processing-note study-processing-detail' },
            `${progressTitle(live.runStage)} · ${progressDetail(live.runStage)}`) : null),
        el('button', {
          type: 'button', class: 'btn btn-small', 'data-find-key': 'stop',
          disabled: live.batch.stopping === true,
          onClick: () => stopBatch(),
        }, 'Stop'));
    } else {
      const plan = planBatch({ visible, selected: live.paramSelected, running: live.running });
      action = el('div', { class: 'param-export-group' },
        el('button', {
          type: 'button', class: 'btn btn-primary btn-small', 'data-find-key': 'segment',
          disabled: !plan.enabled,
          title: plan.enabled ? '' : (plan.note ?? ''),
          onClick: () => startBatch(plan.ids),
        }, plan.label),
        plan.note ? el('span', { class: 'param-export-note', 'data-find-key': 'segment-note' }, plan.note) : null);
    }
    return el('div', { class: 'studies-filters' },
      workspaceSelect, folderSelect, el('div', { class: 'studies-header-spacer' }), action);
  }

  let lastKey = null;

  function update(live) {
    // Tab visibility first, unconditionally: class toggles are idempotent and cheap, and the
    // tab is not in the list's key below.
    const onParameters = live.studiesTab === 'parameters';
    tabFind.classList.toggle('is-active', !onParameters);
    tabFind.setAttribute('aria-selected', String(!onParameters));
    tabParameters.classList.toggle('is-active', onParameters);
    tabParameters.setAttribute('aria-selected', String(onParameters));
    findPanel.classList.toggle('is-hidden', onParameters);
    parametersHost.classList.toggle('is-hidden', !onParameters);

    // The store is the source of truth for the query; deleteAllStudies clears it without
    // touching the input. While the user types, the two are already equal so this never
    // moves the caret.
    if (search.value !== (live.query || '')) search.value = live.query || '';

    const studies = live.studies || [];
    const query = (live.query || '').trim().toLowerCase();
    const queried = studies.filter((study) => matchesQuery(study, query));
    // The grid keeps its own reference-keyed gate; the search result is computed once here and
    // shared with the list below.
    parameters.update(live, queried);
    const progressNode = barHost.querySelector('.study-processing-detail');
    if (progressNode) progressNode.textContent = `${progressTitle(live.runStage)} · ${progressDetail(live.runStage)}`;

    // live.running is in the key so the table repaints when a run starts or ends: the row
    // badge is derived from it, and nothing else in the key changes at either moment.
    // confirmingId is module scope, not store state; listing it here is what lets a
    // refreshTable() after a change to it get past the gate, while a notification that
    // changed nothing the table shows (a pan frame, a toast) still returns early.
    // paramFilters, paramSelected and batch are what the bar and the ticks read (batch spec 7);
    // confirmingAll and deletingStudies are what the bulk row below reads: every store key this
    // screen reads must be here, or it silently stops repainting for it.
    const key = [live.studies, live.query, live.running, confirmingId, confirmingAll,
      live.deletingStudies, live.paramFilters, live.paramSelected, live.batch];
    if (sameKey(key, lastKey)) return;
    lastKey = key;
    // The summary always describes the whole library, not the filtered view, and counts the
    // films without measurements with exactly the rule buildRow badges them: UNSEGMENTED, never
    // "in queue" -- the batch's queue is the bar's business (spec decision 7).
    const unsegmented = studies.filter((study) => (live.running === study.id ? 'proc' : deriveStatus(study)) === 'proc').length;
    summary.textContent = `${studies.length} STUDIES · ${unsegmented} UNSEGMENTED`;
    // live.batch blocks the row for the same reason deleteAllStudies refuses on it, and the
    // title says which of the two is holding it. A packaged build has no demos, so the prompt
    // promises to delete them only when the library actually holds one.
    const blocked = Boolean(live.running || live.batch || live.deletingStudies || persistenceDisabledReason());
    const withDemos = studies.some((study) => study.source === 'demo') ? 'demos and ' : '';
    mount(bulkHost, confirmingAll
      ? el('div', { class: 'studies-bulk-prompt', role: 'group', 'aria-label': 'Confirm deleting all studies' },
        el('span', {}, `Delete all ${studies.length} studies, including ${withDemos}saved results? Original image files will be kept.`),
        el('button', { type: 'button', class: 'btn btn-small', disabled: blocked,
          onClick: deleteAllStudies }, 'Delete all permanently'),
        el('button', { type: 'button', class: 'btn btn-small studies-bulk-cancel',
          onClick: () => { confirmingAll = false; refreshTable(); } }, 'Cancel'))
      : el('button', { type: 'button', class: 'btn btn-small', disabled: blocked || !studies.length,
        title: live.batch
          ? WAIT_FOR_BATCH
          : (live.running ? 'Wait for segmentation to finish' : 'Delete every study, including studies hidden by search'),
        onClick: () => {
          confirmingAll = true; confirmingId = null; refreshTable();
          bulkHost.querySelector('.studies-bulk-cancel')?.focus();
        } }, live.deletingStudies ? 'Deleting studies…' : 'Delete all studies'));

    const filters = normaliseFilters(live.paramFilters, studies);
    const visible = queried.filter((study) => matchesLocation(study, filters));
    const selected = live.paramSelected ?? [];
    const emptyKind = filters.workspace !== null || filters.folder !== null ? 'filters' : (query !== '' ? 'search' : null);

    // Focus snapshot, restored by data-find-key after the rebuild (screens/parameters.js does the
    // same with data-param-key): a select change or a tick rebuilds the bar and the table, which
    // drops keyboard focus to <body>. Only when focus is inside them -- a rebuild must never steal
    // focus from the search box or the tab strip. refreshTable() restores the delete controls,
    // which carry no key, by its own selector afterwards.
    const active = document.activeElement;
    const focusKey = (barHost.contains(active) || tableHost.contains(active)) ? active.getAttribute('data-find-key') : null;
    mount(barHost, buildFilterBar(live, filters, visible));
    mount(tableHost, buildTable(visible, live.running, emptyKind, selected));
    if (focusKey !== null) {
      // The control that was focused may be gone: clicking Segment replaces the button with the
      // progress group, and the batch's end replaces the group with the button. Land on the other.
      const fallback = { segment: 'stop', stop: 'segment' }[focusKey] ?? null;
      const target = barHost.querySelector(`[data-find-key="${focusKey}"]`) ?? tableHost.querySelector(`[data-find-key="${focusKey}"]`)
        ?? (fallback ? barHost.querySelector(`[data-find-key="${fallback}"]`) : null);
      if (target) target.focus();
    }
  }

  const root = el('main', { class: 'studies-page' },
    el('div', { class: 'studies-page-inner' },
      el('div', { class: 'studies-header' },
        el('div', {}, el('h1', { class: 'studies-heading' }, 'Studies'), summary),
        el('div', { class: 'studies-header-spacer' }),
        search),
      bulkHost,
      tabs,
      findPanel,
      parametersHost));
  mounted = { update, host: tableHost };
  update(state);
  return root;
}
