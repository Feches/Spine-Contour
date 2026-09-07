/**
 * Pure logic for the Parameters tab of the Studies screen (pre-op/post-op spec, 2026-09-06 §10):
 * which columns the grid shows, each study's value in them, the filter options, the filter and
 * sort over Study[] and how a filter control's change is merged into the stored filters, why the
 * grid is empty, the export filename, and the selection of rows to export. No DOM.
 * screens/parameters.js renders what this module decides; test/parameters.test.js pins it.
 *
 * Values come from the same row helpers the Measurements panel uses, so the grid and the panel
 * can never disagree about a number, and an absent value is null here and an em dash on screen --
 * never 0.
 */
import { sagittalRows, lordosisRows } from './measurements.js';
import { studyName, workspaceLabel, folderLabel, lastSegment } from './labels.js';

const DASH = '\u2014';

// The workspace filter's value for "this film has no workspace root" -- added with the picker or
// dropped on the list. A sentinel, not null, because null means "no workspace filter".
export const HAND_ADDED = '__hand__';

export const DEFAULT_FILTERS = Object.freeze({ workspace: null, folder: null, segmentedOnly: true });
export const DEFAULT_SORT = Object.freeze({ key: 'study', dir: 'asc' });

// Labels are the Measurements panel's names. `LL` is L1–S1; `PILL` is the derived PI − LL.
export const CORE_COLUMNS = Object.freeze([
  { key: 'PI', label: 'PI' },
  { key: 'PT', label: 'PT' },
  { key: 'SS', label: 'SS' },
  { key: 'LL', label: 'LL L1\u2013S1' },
  { key: 'PILL', label: 'PI\u2013LL' },
  { key: 'L1PA', label: 'L1PA' },
]);

export const LEVEL_COLUMNS = Object.freeze([
  { key: 'L2-S1', label: 'LL L2\u2013S1' },
  { key: 'L3-S1', label: 'LL L3\u2013S1' },
  { key: 'L4-S1', label: 'LL L4\u2013S1' },
  { key: 'L5-S1', label: 'LL L5\u2013S1' },
]);

export function measurementColumns(showLevels) {
  return showLevels ? [...CORE_COLUMNS, ...LEVEL_COLUMNS] : [...CORE_COLUMNS];
}

// One study's value in every measurement column: a finite number or null. sagittalRows keys its
// rows LL/PI/PT/SS/PILL/L1PA and lordosisRows keys L2-S1..L5-S1 -- exactly the column keys above.
export function parameterValues(study) {
  const values = {};
  for (const row of sagittalRows(study.measurements)) values[row.key] = row.absent ? null : row.value;
  for (const row of lordosisRows(study.measurements)) values[row.key] = row.absent ? null : row.value;
  return values;
}

// As the Measurements panel formats a row: one decimal and the unit, or an em dash.
export function formatParameter(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}\u00B0` : DASH;
}

export function isSegmented(study) {
  return study.measurements != null;
}

function rootOf(study) {
  return typeof study.workspaceFolder === 'string' && study.workspaceFolder !== '' ? study.workspaceFolder : null;
}

function matchesWorkspace(study, workspace) {
  if (!workspace) return true;
  const root = rootOf(study);
  return workspace === HAND_ADDED ? root === null : root === workspace;
}

// Distinct workspace roots in first-seen order, each labelled by its last path segment -- the
// same label the WORKSPACE column shows. Two roots that share a last segment are labelled by
// their full paths instead, so the dropdown never offers two identical entries. "Added by hand"
// is appended when at least one study has no root.
export function workspaceOptions(studies) {
  const roots = [];
  let hand = false;
  for (const study of studies) {
    const root = rootOf(study);
    if (root === null) { hand = true; continue; }
    if (!roots.includes(root)) roots.push(root);
  }
  const labels = roots.map((root) => lastSegment(root) || root);
  const options = roots.map((root, index) => {
    const label = labels[index];
    const collides = labels.some((other, i) => i !== index && other === label);
    return { value: root, label: collides ? root : label };
  });
  if (hand) options.push({ value: HAND_ADDED, label: 'Added by hand' });
  return options;
}

// Distinct containing-folder labels among the studies the workspace filter keeps, in first-seen
// order. A film with no path has no folder (the column shows an em dash) and is not an option.
export function folderOptions(studies, workspace) {
  const seen = [];
  for (const study of studies) {
    if (!matchesWorkspace(study, workspace)) continue;
    const folder = folderLabel(study);
    if (folder !== DASH && !seen.includes(folder)) seen.push(folder);
  }
  return seen.map((value) => ({ value, label: value }));
}

// A stored filter can name a root or folder that no study carries any more (the studies were
// deleted). Clear it for rendering and filtering rather than applying a filter the dropdown
// cannot show. Pure: the stale store value is harmless and is not rewritten here.
export function normaliseFilters(filters, studies) {
  const f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
  if (f.workspace && !workspaceOptions(studies).some((o) => o.value === f.workspace)) {
    return { ...f, workspace: null, folder: null };
  }
  if (f.folder && !folderOptions(studies, f.workspace).some((o) => o.value === f.folder)) {
    return { ...f, folder: null };
  }
  return f;
}

// How a filter control's change is merged into the stored filters. It exists because the screen
// renders from normaliseFilters(stored) but used to write back over `stored` itself: with a stale
// workspace in the store, a folder pick wrote { workspace: <gone>, folder: X } and normaliseFilters
// then cleared the folder along with the dead workspace, so the pick vanished with no error. The
// patch is merged over what the user is actually looking at, so a control's new value always wins.
export function patchFilters(filters, studies, patch) {
  return { ...normaliseFilters(filters, studies), ...patch };
}

// The selected ids with `id` removed if present, else appended at the end. A null/undefined
// selection is treated as empty. Always a new array; `selected` is never mutated.
export function toggleId(selected, id) {
  const current = selected ?? [];
  return current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id];
}

// `on`: every id in `ids` present exactly once, the missing ones appended in `ids` order (ids
// already selected keep their place, so this is idempotent). `off`: every id in `ids` gone, the
// rest untouched. A null/undefined selection is treated as empty. Always a new array.
export function withIds(selected, ids, on) {
  const current = selected ?? [];
  const list = ids ?? [];
  if (on) return [...current, ...list.filter((id, i) => !current.includes(id) && list.indexOf(id) === i)];
  return current.filter((id) => !list.includes(id));
}

// The visible studies whose id is selected, in VISIBLE order (not selection order) -- so the grid
// and the export never reorder rows to match how they were ticked. An id no visible study carries
// (a stale selection) is silently ignored. A null/undefined selection selects nothing.
export function selectedVisible(visible, selected) {
  const current = selected ?? [];
  return visible.filter((study) => current.includes(study.id));
}

// What Export writes: the ticked visible rows, or -- when nothing visible is ticked -- every
// visible row. Always a new array, even in the fall-through case.
export function rowsToExport(visible, selected) {
  const chosen = selectedVisible(visible, selected);
  return chosen.length > 0 ? chosen : [...visible];
}

export function filterParameters(studies, filters) {
  const f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
  return studies.filter((study) => matchesWorkspace(study, f.workspace)
    && (!f.folder || folderLabel(study) === f.folder)
    && (!f.segmentedOnly || isSegmented(study)));
}

// How many studies the segmented-only filter is hiding from the current workspace and folder.
export function hiddenUnsegmented(studies, filters) {
  const f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
  if (!f.segmentedOnly) return 0;
  return filterParameters(studies, { ...f, segmentedOnly: false }).length - filterParameters(studies, f).length;
}

const TEXT_SORTS = {
  study: (study) => studyName(study).toLowerCase(),
  // Workspace, then folder, then name. The em dash a hand-added film shows sorts after letters.
  workspace: (study) => `${workspaceLabel(study)}\u0000${folderLabel(study)}\u0000${studyName(study)}`.toLowerCase(),
};

// A sorted COPY. Text keys compare case-insensitively. Any other key is a measurement column:
// absent values go last in both directions (an em dash is not a small number), and ties keep
// the input order, so the list never shuffles under a stable sort.
export function sortParameters(studies, sort) {
  const { key, dir } = { ...DEFAULT_SORT, ...(sort ?? {}) };
  const sign = dir === 'desc' ? -1 : 1;
  if (key in TEXT_SORTS) {
    const read = TEXT_SORTS[key];
    const indexed = studies.map((study, index) => ({ study, index, text: read(study) }));
    indexed.sort((a, b) => (a.text < b.text ? -sign : a.text > b.text ? sign : a.index - b.index));
    return indexed.map((entry) => entry.study);
  }
  const indexed = studies.map((study, index) => ({ study, index, value: parameterValues(study)[key] ?? null }));
  indexed.sort((a, b) => {
    if (a.value === null && b.value === null) return a.index - b.index;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return a.value === b.value ? a.index - b.index : (a.value - b.value) * sign;
  });
  return indexed.map((entry) => entry.study);
}

// Why the grid is empty, so the screen never blames a filter the user did not set:
//   null           something is visible
//   'none'         the library is empty
//   'filtered'     a workspace or folder filter, or the search box, removed everything
//   'unsegmented'  studies exist, but none has measurements and segmented-only is on
export function emptyReason({ total, visible, filters, query }) {
  if (visible > 0) return null;
  if (total === 0) return 'none';
  const f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
  if (f.workspace || f.folder || String(query ?? '').trim() !== '') return 'filtered';
  return 'unsegmented';
}

// `<root last segment>-parameters.csv` for a workspace filter, else the whole library. The
// segment is reduced to letters, digits, underscore and hyphen so the suggested name is a valid
// filename on every platform.
export function exportFileName(workspace) {
  if (!workspace || workspace === HAND_ADDED) return 'library-parameters.csv';
  const stem = lastSegment(workspace).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${stem || 'workspace'}-parameters.csv`;
}
