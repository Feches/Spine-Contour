/**
 * Studies screen (spec 9.4). Heading, the {n} STUDIES · {m} UNSEGMENTED summary, search, the
 * dropzone (click, drop, Choose radiograph), the Find tab's filter bar with Delete and the segment button
 * (batch spec 7), and the table with row ticks, derived status pills and the DEMO pill.
 * render(state) builds the shell; the summary, the bar and the table update in place from a
 * module-scope subscription, because router.js remounts this host only on screen/ack.
 * (2026-09-10, studies-table spec) Sortable headers, the SUBJECT column with its in-place editor, Delete over the ticked visible rows, and the summary's TO REVIEW count.
 */

import { deleteStudyBatch } from '../data/delete-studies.js';
import { el, mount } from '../dom.js';
import { getState, setState, subscribe } from '../store.js';
import { selectFile, pathForFile, deletePrediction, persistenceDisabledReason } from '../api.js';
import { showToast } from '../components/toast.js';
import { displayStatus } from '../data/status.js';
import { inferenceView } from '../data/inference-view.js';
import { defaultName, studyName, workspaceLabel, folderLabel, pathTitle, subjectLabel } from '../data/labels.js';
import { nextId } from '../data/persistence.js';
import { DEFAULT_VIEW } from '../data/timepoints.js';
import { seedFields } from '../data/seeding.js';
import {
  withIds, toggleId, selectedVisible, workspaceOptions, folderOptions, normaliseFilters, patchFilters, matchesLocation, HAND_ADDED,
} from '../data/parameters.js';
import { planBatch, progressText, WAIT_FOR_BATCH, WAIT_FOR_RUN } from '../data/batch.js';
import { sortFindRows, toggleFindSort } from '../data/find.js';
import { progressTitle, progressDetail } from '../data/processing.js';
import { checkbox } from '../components/checkbox.js';
import { statusBadge, unsupportedViewBadge } from '../components/status-badge.js';
import { startBatch, stopBatch } from '../batch.js';
import { setFilePayload, releaseStudy } from './analysis.js';
import { forgetPrediction } from '../components/viewer.js';
import { mountParameters } from './parameters.js';

const DASH = '\u2014';

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
// on the Parameters grid, which the box also filters; the note is in the drawer, and is what
// tells two same-day films of one subject apart. The FULL file path is still not: only the two
// folder names the cells actually display are matched.
export function matchesQuery(study, query) {
  const needle = (query ?? '').trim().toLowerCase();
  if (!needle) return true;
  return [study.id, studyName(study), study.subjectId, study.timepoint, study.filmDate, study.note, workspaceLabel(study), folderLabel(study), study.pt, study.dx, study.view, ...Object.values(study.clinical ?? {})]
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
    // (2026-09-11) the note: read from the filename by studyFromFile or the workspace load, or
    // typed in the drawer; null until then.
    note: null,
    // (2026-09-10, studies-table spec 8.1) the review mark; set on the Analysis screen, cleared by every write that changes the numbers.
    reviewedAt: null,
    addedAt: new Date().toISOString(), view: DEFAULT_VIEW, thumbnail: null,
    measurements: null, geometry: null, qc: null, clinical: {},
  };
}

// A picked or dropped film's record: newStudy plus the fields its own name supplies (spec §8.1
// rule 3, user decision 2026-09-11). No root and no folder table, so only the stem is read and
// the view falls to Standing lateral; a workspace load builds its records itself, with both.
export function studyFromFile({ id, fileName, filePath }) {
  const { fields } = seedFields({ filePath: filePath ?? fileName, root: null });
  return { ...newStudy({ id, fileName, filePath }), ...fields };
}

// Every path that changes openId resets the per-study view state, so a study never inherits
// the previous one's zoom, pan, selection or edit mode (handoff item 6). Exported only so
// test/demo-visibility.test.js can pin it equal to data/demo-visibility.js's copy: data/ never
// imports from screens/, so the seven keys are written out twice and must not drift.
export const FRESH_VIEW = { selectedLevel: null, zoom: 1, panX: 0, panY: 0, panMode: false, editing: false, selection: null };

function openStudy(study) {
  setState({ screen: 'analysis', openId: study.id, ...FRESH_VIEW });
}

// The one entry point for the picker and a drop. Inserts at the front.
function addStudy({ name, data, path }) {
  const id = nextId(getState().studies);
  setFilePayload(id, data);
  setState((state) => ({
    studies: [studyFromFile({ id, fileName: name, filePath: path ?? null }), ...state.studies],
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
        // Keyed so update()'s focus snapshot can give it back after a rebuild: Tab out of a
        // SUBJECT editor lands here, and the commit's rebuild would otherwise drop focus to
        // <body>. refreshTable() still finds it by its class selector.
        'data-find-key': `row-delete-${study.id}`,
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

// The SUBJECT cell (studies-table spec 2026-09-10, section 7). Demo rows show the demo label and the DEMO
// pill and are not editable (never saved). A real row's cell is a click-to-edit target: a SINGLE
// click, because the row underneath opens the study on the first click of a double-click. The
// click stops at the cell, as the tick's and the trash button's do. While this row is the one
// being edited the cell IS the editor, pre-filled with the draft so a rebuild mid-word (a batch
// finishing, a run ending) loses nothing; update() restores its focus and caret by data-find-key.
function subjectCell(study) {
  const label = subjectLabel(study);
  if (study.source !== 'real') {
    return el('div', { class: 'studies-cell-subject' }, label, el('span', { class: 'pill-demo' }, 'DEMO'));
  }
  const name = studyName(study);
  if (editingSubject && editingSubject.id === study.id) {
    const input = el('input', {
      type: 'text', class: 'studies-subject-input', value: editingSubject.draft, spellcheck: false,
      'data-find-key': `subject-input-${study.id}`, 'aria-label': `Subject for ${name}`,
      onClick: (event) => event.stopPropagation(),
      onInput: (event) => { if (editingSubject && editingSubject.id === study.id) editingSubject = { id: study.id, draft: event.target.value }; },
      onKeydown: (event) => {
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commitSubject(study.id, 'next'); }
        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelSubjectEdit(); }
      },
      // Deferred: Chromium can fire this while the node is being replaced, and setState notifies
      // synchronously -- the name field and the drawer defer their commits for the same reason.
      // relatedTarget is where the browser is sending focus (Tab: this row's trash button). It is
      // read HERE, not from update()'s snapshot, because a blur listener runs mid-transition:
      // document.activeElement is <body> until the browser finishes, so the snapshot sees nothing
      // to restore, and the commit's rebuild then detaches the very node focus was headed for.
      // Focusing its rebuilt twin also makes Chromium abandon that pending move, which is what
      // keeps Tab out of the editor on the keyboard path instead of dropping it to <body>.
      // A rebuild's REMOVAL blur is not a user blur: mount() detaches the focused input and
      // Chromium blurs it, but update() has already re-created the editor with the draft, the
      // focus and the caret. The node is still IN the tree as it blurs, so it is tested in the
      // microtask instead: only a removal leaves it disconnected there -- Tab, a click elsewhere
      // and the window losing focus all leave it connected -- so skipping the commit on that one
      // path is what keeps a batch finishing mid-word from committing half a subject (spec 7.3).
      onBlur: (event) => {
        const key = event.relatedTarget instanceof Element ? event.relatedTarget.getAttribute('data-find-key') : null;
        queueMicrotask(() => {
          if (!input.isConnected && editingSubject && editingSubject.id === study.id) return;
          commitSubject(study.id, 'blur', key);
        });
      },
    });
    return el('div', { class: 'studies-cell-subject studies-subject-editing', onClick: (event) => event.stopPropagation() }, input);
  }
  const empty = label === DASH;
  return el('div', {
    class: `studies-cell-subject studies-subject-editable${empty ? ' studies-subject-empty' : ''}`,
    role: 'button', tabindex: '0', title: 'Click to edit subject', 'data-find-key': `subject-${study.id}`,
    'aria-label': `Subject for ${name}: ${empty ? 'none' : label}. Press Enter to edit`,
    onClick: (event) => { event.stopPropagation(); beginSubjectEdit(study.id); },
    onKeydown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); beginSubjectEdit(study.id); }
    },
  }, label);
}

// `runningId` is state.running. displayStatus (data/status.js) applies spec 13.1's "or currently
// running" rule, so deriveStatus stays a pure function of the record.
function buildRow(study, runningId, selected) {
  const status = displayStatus(study, runningId);
  const unsupported = study.source === 'real' && study.measurements == null
    && runningId !== study.id && !inferenceView(study.view);
  // While this row is confirming a delete, the prompt takes every cell from WORKSPACE rightwards
  // (see .studies-cell-actions-confirming); the study, subject and view cells stay visible.
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
      // Enter/Space on the row itself opens the study. On one of the action buttons, the tick or
      // the subject cell they are that control's own activation and must reach it.
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
      el('span', { class: 'studies-name study-name' }, studyName(study))),
    subjectCell(study),
    el('div', { class: 'studies-cell-view' }, study.view || '—'),
    confirming ? null : el('div', { class: 'studies-cell-workspace' }, workspaceLabel(study)),
    confirming ? null : el('div', { class: 'studies-cell-folder', ...(pathTitle(study) ? { title: pathTitle(study) } : {}) }, folderLabel(study)),
    confirming ? null : el('div', { class: 'studies-cell-date' }, formatDate(study.addedAt)),
    confirming ? null : el('div', {}, unsupported ? unsupportedViewBadge(study.view) : statusBadge(status)),
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

// One header cell (studies-table spec 2026-09-10, section 6.3): the grid's sort control -- a button
// carrying the label and the up/down mark -- keyed for focus restore. `lead` goes before
// the button (the STUDY column's select-all). Clicking the active key flips the direction;
// another key sorts ascending (data/find.js toggleFindSort). The header cells stay plain divs,
// as the list's always were (ROADMAP section 5's accessibility pass owns the table semantics), so the
// state is on the button's title rather than an aria-sort the role would need.
function sortableHeader(key, label, sort, lead) {
  const active = sort.key === key;
  const button = el('button', {
    type: 'button', class: `param-sort${active ? ' is-active' : ''}`, 'data-find-key': `sort-${key}`,
    title: active
      ? (sort.dir === 'asc' ? 'Sorted ascending. Click to reverse' : 'Sorted descending. Click to reverse')
      : `Sort by ${label.toLowerCase()}`,
    onClick: () => setState((s) => ({ findSort: toggleFindSort(s.findSort, key) })),
  }, label, el('span', { class: 'param-sort-mark', 'aria-hidden': 'true' }, active ? (sort.dir === 'asc' ? ' \u25B4' : ' \u25BE') : ''));
  return el('div', { class: key === 'study' ? 'studies-head-study' : 'studies-th' }, lead ?? null, button);
}

// `emptyKind` is null (the library is empty), 'search' or 'filters'. `selected` is paramSelected.
// `sort` is state.findSort; the rows arrive already sorted by it.
function buildTable(studies, runningId, emptyKind, selected, sort) {
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
      sortableHeader('study', 'STUDY', sort, selectAll),
      sortableHeader('subject', 'SUBJECT', sort),
      sortableHeader('view', 'VIEW', sort),
      sortableHeader('workspace', 'WORKSPACE', sort),
      sortableHeader('folder', 'FOLDER', sort),
      sortableHeader('date', 'DATE', sort),
      sortableHeader('status', 'STATUS', sort),
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
// The ids the bar's Delete prompt is confirming (studies-table spec 2026-09-10, section 5.3), or null.
// Captured at the click; update() withdraws it the moment the ticked visible set no longer
// matches them, so the prompt can never delete a set the user cannot see.
let confirmingSelected = null;
// The SUBJECT cell being edited in place (spec 7.2): { id, draft }, or null. `draft` is the text typed
// so far, kept current by the input's own handler, so a rebuild mid-word re-creates the editor
// with it. Replaced, never mutated: it is compared by reference in update()'s key. Named
// `editingSubject`, not `editing`: the store has its own `editing` key (the viewer's edit mode),
// which this file spreads through FRESH_VIEW, and one name for the two would read as the other.
let editingSubject = null;

subscribe((state) => {
  // Navigation withdraws an open prompt and an open editor along with the mount.
  if (state.screen !== 'studies') { mounted = null; confirmingId = null; confirmingSelected = null; editingSubject = null; return; }
  if (mounted) mounted.update(state);
});

// Repaint the bar and the table from the current store after module-scope UI state changes.
// Called from DOM event handlers only, never from inside a subscriber. The repaint replaces the
// nodes, which drops keyboard focus onto the body; `focusSelector` names the node that gets it
// back -- in the table or on the bar. A text input that gets it also gets its text selected:
// that is how a fresh SUBJECT editor opens (spec 7.2).
function refreshTable(focusSelector) {
  if (!mounted) return;
  mounted.update(getState());
  if (focusSelector) {
    const target = mounted.host.querySelector(focusSelector) ?? mounted.bar.querySelector(focusSelector);
    if (target) {
      target.focus();
      if (target instanceof HTMLInputElement && target.type === 'text') target.select();
    }
  }
}

// Focus lands on CANCEL, not Delete. The repaint drops focus to <body>, so something must
// take it; the safe half of a destructive pair is the one that may be triggered by a stray
// Enter or Space. Delete is one Tab (or one click) away, and its own :focus-visible ring
// makes the difference visible before it is pressed.
function askToDelete(id) {
  if (getState().deletingStudies) return;
  confirmingSelected = null;
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

// The bar's Delete (studies-table spec 2026-09-10, section 5): the ticked VISIBLE real rows, captured
// here so the prompt names exactly what the button said. Focus lands on Cancel, as the row
// prompt's does; the open subject editor closes uncommitted only if it was on one of these rows,
// which the rebuild handles by dropping the row.
function askToDeleteSelected(ids) {
  if (getState().deletingStudies || ids.length === 0) return;
  confirmingId = null;
  confirmingSelected = ids;
  refreshTable('[data-find-key="delete-cancel"]');
}

function cancelDeleteSelected() {
  confirmingSelected = null;
  refreshTable('[data-find-key="delete"]');
}

// The old deleteAllStudies with two differences (spec 5.4): the targets are the captured ids, re-read
// from the live store so a study deleted meanwhile is simply absent, and the search is NOT cleared
// (delete-all cleared it because nothing was left to search). Everything else is kept exactly:
// deletingStudies is set before the first await, so run, batch and bulk delete stay mutually
// exclusive (startBatch and segmentStudy both refuse on it); the sidecars go through
// deleteStudyBatch, which never deletes a source film; the caches keyed by each deleted id are
// dropped; ONE setState removes the records, prunes their ticks (nextId reuses a freed id at
// once, so a tick left behind would land on the next film added) and closes a deleted open or
// compared study. The persistence subscriber in renderer/main.js writes the new list.
async function deleteSelectedStudies(ids) {
  // The ids are the prompt's, captured at the click; update() can withdraw confirmingSelected
  // between that click and this call, so the confirm handler can arrive holding null and
  // `new Set(null)` would throw. Withdraw the prompt and hand focus back to Delete, exactly as an
  // empty target set below does.
  if (!Array.isArray(ids) || ids.length === 0) { confirmingSelected = null; refreshTable('[data-find-key="delete"]'); return; }
  const live = getState();
  if (live.running || live.batch || live.deletingStudies || persistenceDisabledReason()) return;
  const wanted = new Set(ids);
  const targets = live.studies.filter((study) => study.source === 'real' && wanted.has(study.id));
  confirmingSelected = null;
  confirmingId = null;
  if (targets.length === 0) { refreshTable('[data-find-key="delete"]'); return; }
  setState({ deletingStudies: true });
  try {
    const { deleted, failed } = await deleteStudyBatch(targets, { deletePrediction });
    const removed = new Set(deleted);
    for (const id of removed) { forgetPrediction(id); releaseStudy(id); }
    setState((current) => ({
      studies: current.studies.filter((study) => !removed.has(study.id)),
      deletingStudies: false,
      paramSelected: withIds(current.paramSelected, [...removed], false),
      ...(removed.has(current.openId) ? { openId: null, screen: 'studies', ...FRESH_VIEW } : {}),
      ...(removed.has(current.compareId) ? { compareId: null } : {}),
    }));
    const count = `${deleted.length} ${deleted.length === 1 ? 'study' : 'studies'}`;
    showToast(failed.length
      ? `Deleted ${count}. ${failed.length} could not be deleted and remain in the library: ${failed[0].message}`
      : `Deleted ${count}. Original image files were kept.`);
  } finally {
    if (getState().deletingStudies) setState({ deletingStudies: false });
  }
}

// ---- SUBJECT in place (studies-table spec 2026-09-10, section 7.2) ----------------------------------

// The stored subject as the editor's starting text. subjectLabel's em dash is a display value,
// not a subject, so the editor opens empty for a study with none.
function subjectDraft(study) {
  return typeof study?.subjectId === 'string' ? study.subjectId : '';
}

function beginSubjectEdit(id) {
  const live = getState();
  const study = live.studies.find((s) => s.id === id);
  if (!study || study.source !== 'real' || live.deletingStudies) return;
  // An editor still open on another row is committed first. Chromium fires that input's blur --
  // and so its deferred commit -- before the click that lands here, so this is belt and braces;
  // but an editor a rebuild destroyed while focused got no blur, and this is what keeps its text.
  if (editingSubject && editingSubject.id !== id) commitSubject(editingSubject.id, 'blur');
  confirmingId = null;
  editingSubject = { id, draft: subjectDraft(study) };
  refreshTable(`[data-find-key="subject-input-${id}"]`);
}

function cancelSubjectEdit() {
  if (!editingSubject) return;
  const { id } = editingSubject;
  editingSubject = null;
  refreshTable(`[data-find-key="subject-${id}"]`);
}

// The next real row below `id` in the table's CURRENT order (sorted, filtered), or null: Enter
// moves down the column the user is looking at.
function realRowBelow(id) {
  if (!mounted) return null;
  const rows = [...mounted.host.querySelectorAll('.studies-row[data-study-id]')];
  const index = rows.findIndex((row) => row.dataset.studyId === id);
  if (index === -1) return null;
  const below = rows.slice(index + 1).find((row) => row.querySelector('.studies-subject-editable, .studies-subject-input'));
  return below ? below.dataset.studyId : null;
}

// Commits the editor for `id`. `mode` is 'next' (Enter: commit, then open the row below) or
// 'blur' (Tab, a click elsewhere: commit and close). Idempotent: a blur that follows an Enter
// finds the editor already moved on and does nothing, so the one write cannot happen twice.
// Trimmed; empty stores null (pp spec 7.1, the drawer's rule); a value that did not change writes
// nothing. The record is replaced, never mutated; the saver writes it. After a write, update()
// has already repainted inside the setState (editingSubject is in its key) but could not restore focus,
// because the node that had it is gone -- refreshTable's own pass lands it where spec 7.2 says.
// `focusKey` is the blur's relatedTarget key, present only on the 'blur' path and only when the
// browser was moving focus to a keyed control inside this screen: the rebuilt twin of that node
// takes the focus the rebuild would otherwise have thrown away. Null on Enter, on a click that
// leaves the panel (the search box, the sidebar: their nodes survive the rebuild), and on a blur
// with nowhere to go.
function commitSubject(id, mode, focusKey = null) {
  if (!editingSubject || editingSubject.id !== id) return;
  const draft = editingSubject.draft.trim();
  const next = draft === '' ? null : draft;
  // `below`, not `nextId`: this module imports nextId from data/persistence.js (the id allocator),
  // and a local of that name would shadow it inside this function.
  const below = mode === 'next' ? realRowBelow(id) : null;
  const live = getState();
  const study = live.studies.find((s) => s.id === id);
  editingSubject = below ? { id: below, draft: subjectDraft(live.studies.find((s) => s.id === below)) } : null;
  if (study && study.source === 'real' && (study.subjectId ?? null) !== next) {
    setState((s) => ({ studies: s.studies.map((x) => (x.id === id ? { ...x, subjectId: next } : x)) }));
  }
  refreshTable(below ? `[data-find-key="subject-input-${below}"]`
    : mode === 'next' ? `[data-find-key="subject-${id}"]`
      : focusKey ? `[data-find-key="${focusKey}"]`
        : null);
}

export function render(state) {
  confirmingId = null;
  confirmingSelected = null;
  editingSubject = null;
  const summary = el('div', { class: 'studies-summary' });
  const search = el('input', {
    type: 'search', class: 'studies-search', value: state.query || '',
    placeholder: 'Search name, subject, workspace, folder, diagnosis…', 'aria-label': 'Search studies',
    // A keystroke here can filter the confirming row out of the table; clearing the prompt
    // first stops it reappearing, primed on Delete, when the search is cleared again.
    // The setState notification repaints through the same gate (confirmingId is in the key),
    // so no extra refreshTable() is needed.
    onInput: (event) => { confirmingId = null; setState({ query: event.target.value }); },
  });
  const tableHost = el('div', { class: 'studies-table-host' });
  const barHost = el('div', { class: 'studies-filters-host' });

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

  // The bar (batch spec 7.1, 7.3, 7.4; studies-table spec 2026-09-10, section 5): the grid's Workspace and
  // Folder selects over the same shared keys, then Delete over the ticked visible rows, a spacer,
  // then the segment button with its note -- or, while a batch runs, the progress group. While the
  // Delete prompt is up it takes the bar's place (spec 5.3). Chromium shows no tooltip on a disabled
  // control, so the segment button's reason is a visible note beside it; Delete's reason is on its
  // title, because its label already says what it would do. Options come from the whole library,
  // not the searched subset, as the grid's do. `visible` is the table's rows, in table order: the
  // id list both buttons run.
  function buildFilterBar(live, filters, visible) {
    const blocked = Boolean(live.running || live.batch || live.deletingStudies || persistenceDisabledReason());
    // The ticked VISIBLE real rows, the segment button's own rule (selectedVisible), so a tick the
    // search or a filter is hiding is never deleted.
    const targets = selectedVisible(visible.filter((study) => study.source === 'real'), live.paramSelected);
    if (confirmingSelected) {
      const n = confirmingSelected.length;
      return el('div', { class: 'studies-filters' },
        el('div', {
          class: 'studies-bulk-prompt', role: 'group', 'aria-label': 'Confirm deleting the selected studies',
          'data-find-key': 'delete-prompt',
          onKeydown: (event) => { if (event.key === 'Escape') { event.preventDefault(); cancelDeleteSelected(); } },
        },
          el('span', {}, `Delete ${n} ${n === 1 ? 'study' : 'studies'}, including ${n === 1 ? 'its' : 'their'} saved results? Original image files will be kept.`),
          el('button', {
            type: 'button', class: 'btn btn-small studies-delete-confirm', 'data-find-key': 'delete-confirm', disabled: blocked,
            onClick: () => deleteSelectedStudies(confirmingSelected),
          }, 'Delete permanently'),
          el('button', {
            type: 'button', class: 'btn btn-small studies-bulk-cancel', 'data-find-key': 'delete-cancel',
            onClick: () => cancelDeleteSelected(),
          }, 'Cancel')));
    }

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

    const deleteTitle = live.batch ? WAIT_FOR_BATCH
      : live.running ? WAIT_FOR_RUN
      : persistenceDisabledReason() ? `Studies are not being saved: ${persistenceDisabledReason()}`
      : targets.length === 0 ? 'Tick studies to delete' : '';
    const deleteButton = el('button', {
      type: 'button', class: 'btn btn-small studies-delete-selected', 'data-find-key': 'delete',
      disabled: blocked || targets.length === 0, title: deleteTitle,
      onClick: () => askToDeleteSelected(targets.map((study) => study.id)),
    }, live.deletingStudies ? 'Deleting studies\u2026' : (targets.length > 0 ? `Delete ${targets.length} selected` : 'Delete'));

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
      workspaceSelect, folderSelect, deleteButton, el('div', { class: 'studies-header-spacer' }), action);
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

    // The store is the source of truth for the query. While the user types, the two are already
    // equal so this never moves the caret.
    if (search.value !== (live.query || '')) search.value = live.query || '';

    const studies = live.studies || [];
    const query = (live.query || '').trim().toLowerCase();
    const queried = studies.filter((study) => matchesQuery(study, query));
    // The grid keeps its own reference-keyed gate; the search result is computed once here and
    // shared with the list below.
    parameters.update(live, queried);
    const progressNode = barHost.querySelector('.study-processing-detail');
    if (progressNode) progressNode.textContent = `${progressTitle(live.runStage)} · ${progressDetail(live.runStage)}`;

    const filters = normaliseFilters(live.paramFilters, studies);
    // Filtered, then sorted (studies-table spec 2026-09-10, section 6): the rows in the order the table
    // shows them, which is the order the Segment and Delete buttons act in.
    const visible = sortFindRows(queried.filter((study) => matchesLocation(study, filters)), live.findSort, live.running);
    const selected = live.paramSelected ?? [];
    const targets = selectedVisible(visible.filter((study) => study.source === 'real'), selected).map((study) => study.id);
    // Module-scope UI state the store cannot see, reconciled BEFORE the key so it never sits on a
    // study that left the table: the Delete prompt is withdrawn the moment the ticked visible set
    // no longer matches what it named -- a tick, a keystroke, a filter -- and the moment the user
    // leaves for the Parameters tab, which only hides the Find panel and would otherwise leave the
    // prompt armed behind it (spec 5.3); an editor on a study deleted meanwhile closes. Plain
    // assignments, not setState: this runs inside a store notification.
    if (confirmingSelected && (live.studiesTab === 'parameters' || confirmingSelected.join(' ') !== targets.join(' '))) confirmingSelected = null;
    if (editingSubject && !studies.some((study) => study.id === editingSubject.id)) editingSubject = null;

    // live.running is in the key so the table repaints when a run starts or ends: the row badge is
    // derived from it. confirmingId, confirmingSelected and editingSubject are module scope, not store
    // state; listing them here is what lets a refreshTable() after a change to them get past the
    // gate, while a notification that changed nothing the table shows (a pan frame, a toast) still
    // returns early. paramFilters, paramSelected, batch and findSort are what the bar, the ticks and
    // the header read; deletingStudies is what Delete reads: every store key this screen reads must
    // be here, or it silently stops repainting for it.
    const key = [live.studies, live.query, live.running, confirmingId, confirmingSelected, editingSubject,
      live.deletingStudies, live.paramFilters, live.paramSelected, live.batch, live.findSort];
    if (sameKey(key, lastKey)) return;
    lastKey = key;
    // The summary always describes the whole library, not the filtered view, and counts with
    // exactly the rule buildRow badges: UNSEGMENTED is every film shown as Processing (the running
    // one included, never "in queue" -- the batch's queue is the bar's business, spec decision 7);
    // TO REVIEW is every film shown as Needs review (studies-table spec 10). The line keeps its
    // existing separator glyph and adds the new one as an escape (HANDOFF's glyph trap).
    const shown = (study) => displayStatus(study, live.running);
    const unsegmented = studies.filter((study) => shown(study) === 'proc').length;
    const toReview = studies.filter((study) => shown(study) === 'rev').length;
    summary.textContent = `${studies.length} STUDIES · ${unsegmented} UNSEGMENTED \u00B7 ${toReview} TO REVIEW`;

    const emptyKind = filters.workspace !== null || filters.folder !== null ? 'filters' : (query !== '' ? 'search' : null);

    // Focus snapshot, restored by data-find-key after the rebuild (screens/parameters.js does the
    // same with data-param-key): a select change, a tick, a sort click or a keystroke's commit
    // rebuilds the bar and the table, which drops keyboard focus to <body>. Only when focus is
    // inside them -- a rebuild must never steal focus from the search box or the tab strip. An
    // open SUBJECT editor keeps its caret too: a batch finishing mid-word must not move it.
    // refreshTable() restores the row's delete controls, which carry no key, by its own selector.
    const active = document.activeElement;
    const focusKey = (barHost.contains(active) || tableHost.contains(active)) ? active.getAttribute('data-find-key') : null;
    const caret = focusKey !== null && focusKey.startsWith('subject-input-') && typeof active.selectionStart === 'number'
      ? [active.selectionStart, active.selectionEnd] : null;
    mount(barHost, buildFilterBar(live, filters, visible));
    mount(tableHost, buildTable(visible, live.running, emptyKind, selected, live.findSort));
    if (focusKey !== null) {
      // The control that was focused may be gone: clicking Segment replaces the button with the
      // progress group, and the batch's end replaces the group with the button. Land on the other.
      const fallback = { segment: 'stop', stop: 'segment' }[focusKey] ?? null;
      const target = barHost.querySelector(`[data-find-key="${focusKey}"]`) ?? tableHost.querySelector(`[data-find-key="${focusKey}"]`)
        ?? (fallback ? barHost.querySelector(`[data-find-key="${fallback}"]`) : null);
      if (target) {
        target.focus();
        if (caret && typeof target.setSelectionRange === 'function') target.setSelectionRange(caret[0], caret[1]);
      }
    }
  }

  const root = el('main', { class: 'studies-page' },
    el('div', { class: 'studies-page-inner' },
      el('div', { class: 'studies-header' },
        el('div', {}, el('h1', { class: 'studies-heading' }, 'Studies'), summary),
        el('div', { class: 'studies-header-spacer' }),
        search),
      tabs,
      findPanel,
      parametersHost));
  mounted = { update, host: tableHost, bar: barHost };
  update(state);
  return root;
}
