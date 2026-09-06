/**
 * Studies screen (spec 9.4). Heading, the {n} STUDIES · {m} IN QUEUE summary, search, the
 * dropzone (click, drop, Choose radiograph), and the table with derived status pills and the DEMO
 * pill. render(state) builds the shell; the summary and table update in place from a
 * module-scope subscription, because router.js remounts this host only on screen/ack.
 */

import { el, mount } from '../dom.js';
import { getState, setState, subscribe } from '../store.js';
import { selectFile, pathForFile, deletePrediction, persistenceDisabledReason } from '../api.js';
import { showToast } from '../components/toast.js';
import { deriveStatus, statusLabel } from '../data/status.js';
import { defaultName, studyName, workspaceLabel, folderLabel, pathTitle } from '../data/labels.js';
import { nextId } from '../data/persistence.js';
import { setFilePayload, releaseStudy } from './analysis.js';
import { forgetPrediction } from '../components/viewer.js';

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
// a visible column you cannot search reads as broken. The FULL file path is still not: only the
// two folder names the cells actually display are matched.
export function matchesQuery(study, query) {
  const needle = (query ?? '').trim().toLowerCase();
  if (!needle) return true;
  return [study.id, studyName(study), workspaceLabel(study), folderLabel(study), study.pt, study.dx, study.view, ...Object.values(study.clinical ?? {})]
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
    addedAt: new Date().toISOString(), view: 'Standing lateral', thumbnail: null,
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
const FILM_EXTENSIONS = /\.(dcm|dicom|png|jpe?g|tiff?|bmp)$/i;

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
function buildRow(study, runningId) {
  const status = runningId === study.id ? 'proc' : deriveStatus(study);
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
    el('div', { class: 'studies-cell-id', title: study.id }, studyName(study)),
    el('div', { class: 'studies-cell-patient' }, ...patientChildren),
    el('div', { class: 'studies-cell-view' }, study.view || '—'),
    confirming ? null : el('div', { class: 'studies-cell-workspace' }, workspaceLabel(study)),
    confirming ? null : el('div', { class: 'studies-cell-folder', ...(pathTitle(study) ? { title: pathTitle(study) } : {}) }, folderLabel(study)),
    confirming ? null : el('div', { class: 'studies-cell-date' }, formatDate(study.addedAt)),
    confirming ? null : el('div', {}, statusBadge(status)),
    actionCell(study, confirming));
  return row;
}

// `filtered` distinguishes the two empty tables, which used to be the same sentence because the
// nine demo studies made a genuinely empty library unreachable. Now that an installed app opens
// with nothing, "No studies match that search." over a library the user has not filled yet would
// blame a search they never made. The filtered wording is pinned by tools/smoke/smoke-studies.mjs
// -- keep it exactly.
function buildTable(studies, runningId, filtered) {
  // An explicit arrow, not `studies.map(buildRow)`: map passes the index as the second
  // argument, so every row would receive its own position as `runningId` and the running
  // study would silently never be badged Processing. The arrow is load-bearing.
  const emptyText = filtered
    ? 'No studies match that search.'
    : 'No studies yet — choose or drop a radiograph above, or load a workspace folder.';
  const body = studies.length > 0
    ? studies.map((study) => buildRow(study, runningId))
    : [el('div', { class: 'studies-empty' }, emptyText)];
  return el('div', { class: 'studies-table card' },
    el('div', { class: 'studies-table-head' },
      el('div', {}, 'STUDY'), el('div', {}, 'PATIENT'), el('div', {}, 'VIEW'),
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

subscribe((state) => {
  // Navigation withdraws an open prompt along with the mount.
  if (state.screen !== 'studies') { mounted = null; confirmingId = null; return; }
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
  forgetPrediction(id);
  releaseStudy(id);
  // The screen is already 'studies'. Naming it again is a no-op for the router (same value,
  // no remount) and covers the one gap the await above opens: the open study deleted from
  // the list must not stay on an Analysis screen that has no record behind it.
  setState((s) => ({
    studies: s.studies.filter((x) => x.id !== id),
    ...(s.openId === id ? { openId: null, screen: 'studies', ...FRESH_VIEW } : {}),
  }));
  showToast(`Deleted ${label}`);
}

export function render(state) {
  confirmingId = null;
  const summary = el('div', { class: 'studies-summary' });
  const search = el('input', {
    type: 'search', class: 'studies-search', value: state.query || '',
    placeholder: 'Search name, workspace, folder, patient…', 'aria-label': 'Search studies',
    // A keystroke here can filter the confirming row out of the table; clearing the prompt
    // first stops it reappearing, primed on Delete, when the search is cleared again.
    // The setState notification repaints through the same gate (confirmingId is in the key),
    // so no extra refreshTable() is needed.
    onInput: (event) => { confirmingId = null; setState({ query: event.target.value }); },
  });
  const tableHost = el('div', { class: 'studies-table-host' });
  let lastKey = null;

  function update(live) {
    // live.running is in the key so the table repaints when a run starts or ends: the row
    // badge is derived from it, and nothing else in the key changes at either moment.
    // confirmingId is module scope, not store state; listing it here is what lets a
    // refreshTable() after a change to it get past the gate, while a notification that
    // changed nothing the table shows (a pan frame, a toast) still returns early.
    const key = [live.studies, live.query, live.running, confirmingId];
    if (sameKey(key, lastKey)) return;
    lastKey = key;
    const studies = live.studies || [];
    // The summary always describes the whole library, not the filtered view, and counts the
    // queue with exactly the rule buildRow badges it with.
    const queued = studies.filter((study) => (live.running === study.id ? 'proc' : deriveStatus(study)) === 'proc').length;
    summary.textContent = `${studies.length} STUDIES · ${queued} IN QUEUE`;
    const query = (live.query || '').trim().toLowerCase();
    mount(tableHost, buildTable(studies.filter((study) => matchesQuery(study, query)), live.running, query !== ''));
  }

  const root = el('main', { class: 'studies-page' },
    el('div', { class: 'studies-page-inner' },
      el('div', { class: 'studies-header' },
        el('div', {}, el('h1', { class: 'studies-heading' }, 'Studies'), summary),
        el('div', { class: 'studies-header-spacer' }),
        search),
      dropzone(),
      tableHost));
  mounted = { update, host: tableHost };
  update(state);
  return root;
}
