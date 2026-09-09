/**
 * Pure logic for the Parameters tab of the Studies screen (pre-op/post-op spec, 2026-09-06 §10):
 * which columns the grid shows, each study's value in them, the filter options, the timepoint,
 * view and paired-with options, the filter and sort over Study[] and how a filter control's
 * change is merged into the stored filters, why the grid is empty, the export filename, and the
 * selection of rows to export. No DOM.
 * screens/parameters.js renders what this module decides; test/parameters.test.js pins it.
 *
 * Values come from the same row helpers the Measurements panel uses, so the grid and the panel
 * can never disagree about a number, and an absent value is null here and an em dash on screen --
 * never 0.
 */
import { sagittalRows, lordosisRows } from './measurements.js';
import { studyName, workspaceLabel, folderLabel, lastSegment } from './labels.js';
import { compareTimepoints, PRE_OP, POST_OP } from './timepoints.js';

const DASH = '\u2014';

// The workspace filter's value for "this film has no workspace root" -- added with the picker or
// dropped on the list. A sentinel, not null, because null means "no workspace filter".
export const HAND_ADDED = '__hand__';

// The timepoint filter's value for "this film has no timepoint" (spec §10.3) -- the HAND_ADDED
// pattern: a sentinel, because null means "no timepoint filter".
export const NO_TIMEPOINT = '__none__';

// The paired-with filter's value for "any labelled film that is not Pre-op" (user decision at the
// Task 9 gate, 2026-09-07): a follow-up study labels its post films 6 wk, 1 yr, 2 yr as often as
// Post-op, and a pair should not need its label picked first. A film with no timepoint never pairs.
export const ANY_POST = '__any__';

export const DEFAULT_FILTERS = Object.freeze({
  workspace: null, folder: null, segmentedOnly: true,
  timepoint: null, view: null, subject: '', pairedOnly: false, pairedWith: ANY_POST,
});
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

// The workspace and folder halves of filterParameters, as one predicate (batch spec 7.1): the Find
// tab's list filters by these two alone and must agree with the grid about which folder a film is
// in. `filters` may be partial or null; a missing key is no filter.
export function matchesLocation(study, filters) {
  const f = filters ?? {};
  return matchesWorkspace(study, f.workspace ?? null) && (!f.folder || folderLabel(study) === f.folder);
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

// Subjects compare case-insensitively after trimming (spec §7.1), as the stem join does.
export function subjectKey(study) {
  const subject = study?.subjectId;
  if (typeof subject !== 'string') return null;
  const key = subject.trim().toLowerCase();
  return key === '' ? null : key;
}

function timepointOf(study) {
  const label = study?.timepoint;
  return typeof label === 'string' && label.trim() !== '' ? label : null;
}

// Timepoint labels present, in §7.2 order, then `No timepoint` when any study lacks one.
export function timepointOptions(studies) {
  const labels = [];
  let missing = false;
  for (const study of studies) {
    const label = timepointOf(study);
    if (label === null) { missing = true; continue; }
    if (!labels.includes(label)) labels.push(label);
  }
  labels.sort(compareTimepoints);
  const options = labels.map((value) => ({ value, label: value }));
  if (missing) options.push({ value: NO_TIMEPOINT, label: 'No timepoint' });
  return options;
}

// Views present, first seen first. A cleared view ('') is not an option: the column shows a dash.
export function viewOptions(studies) {
  const seen = [];
  for (const study of studies) {
    const view = study?.view;
    if (typeof view === 'string' && view.trim() !== '' && !seen.includes(view)) seen.push(view);
  }
  return seen.map((value) => ({ value, label: value }));
}

// The post side of a pair: `All paired` first (the default), then Post-op (always offered),
// then every other label present other than Pre-op, in §7.2 order.
export function pairedWithOptions(studies) {
  const labels = [POST_OP];
  for (const study of studies) {
    const label = timepointOf(study);
    if (label !== null && label !== PRE_OP && !labels.includes(label)) labels.push(label);
  }
  labels.sort(compareTimepoints);
  return [{ value: ANY_POST, label: 'All paired' }, ...labels.map((value) => ({ value, label: value }))];
}

// Subject keys with at least one Pre-op film and at least one film labelled `post` -- or, for
// ANY_POST, any labelled film that is not Pre-op -- among `studies`. A film with no subject or no
// timepoint pairs with nothing.
export function pairedSubjects(studies, post) {
  const pre = new Set();
  const after = new Set();
  for (const study of studies) {
    const key = subjectKey(study);
    if (key === null) continue;
    const label = timepointOf(study);
    if (label === null) continue;
    if (label === PRE_OP) pre.add(key);
    else if (post === ANY_POST || label === post) after.add(key);
  }
  return new Set([...pre].filter((key) => after.has(key)));
}

function matchesTimepoint(study, timepoint) {
  if (!timepoint) return true;
  const label = timepointOf(study);
  return timepoint === NO_TIMEPOINT ? label === null : label === timepoint;
}

function matchesSubject(study, needle) {
  const query = String(needle ?? '').trim().toLowerCase();
  if (query === '') return true;
  const key = subjectKey(study);
  return key !== null && key.includes(query);
}

// A stored filter can name a root, folder, timepoint or view that no study carries any more
// (the studies were deleted or relabelled). Clear it for rendering and filtering rather than
// applying a filter the dropdown cannot show. Pure: the stale store value is harmless and is
// not rewritten here.
export function normaliseFilters(filters, studies) {
  let f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
  if (f.workspace && !workspaceOptions(studies).some((o) => o.value === f.workspace)) f = { ...f, workspace: null, folder: null };
  if (f.folder && !folderOptions(studies, f.workspace).some((o) => o.value === f.folder)) f = { ...f, folder: null };
  if (f.timepoint && !timepointOptions(studies).some((o) => o.value === f.timepoint)) f = { ...f, timepoint: null };
  if (f.view && !viewOptions(studies).some((o) => o.value === f.view)) f = { ...f, view: null };
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

// Every filter but one composes with AND per study. Paired-only is evaluated over the studies
// the other filters keep -- so a workspace filter pairs within that workspace -- and BEFORE the
// timepoint filter, so `Paired only` with `Pre-op` reads as the pre-op films of paired subjects
// rather than as nothing (planning ruling, 2026-09-07).
export function filterParameters(studies, filters) {
  const f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
  const kept = studies.filter((study) => matchesLocation(study, f)
    && (!f.segmentedOnly || isSegmented(study))
    && (!f.view || study.view === f.view)
    && matchesSubject(study, f.subject));
  const paired = f.pairedOnly ? pairedSubjects(kept, f.pairedWith || ANY_POST) : null;
  return kept.filter((study) => (paired === null || paired.has(subjectKey(study)))
    && matchesTimepoint(study, f.timepoint));
}

// How many rows the paired-only step removes, before the timepoint filter narrows further.
export function hiddenUnpaired(studies, filters) {
  const f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
  if (!f.pairedOnly) return 0;
  return filterParameters(studies, { ...f, pairedOnly: false, timepoint: null }).length
    - filterParameters(studies, { ...f, timepoint: null }).length;
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

// Inside one subject (§7.2): timepoint order, then film date ascending (absent last), then
// addedAt ascending, then input order.
function compareWithinSubject(a, b) {
  const byTimepoint = compareTimepoints(a.study.timepoint, b.study.timepoint);
  if (byTimepoint !== 0) return byTimepoint;
  const da = a.study.filmDate ?? null;
  const db = b.study.filmDate ?? null;
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return da < db ? -1 : 1;
  }
  const aa = a.study.addedAt ?? '';
  const ab = b.study.addedAt ?? '';
  if (aa !== ab) return aa < ab ? -1 : 1;
  return a.index - b.index;
}

// Where a new subject block starts in a list sorted by subject: true at i when the row's subject
// key differs from the previous row's. Every row is false under any other sort, and the first
// row always is -- a rule above the first row would separate it from nothing.
export function subjectBreaks(visible, sort) {
  const { key } = { ...DEFAULT_SORT, ...(sort ?? {}) };
  return visible.map((study, i) => key === 'subject' && i > 0 && subjectKey(study) !== subjectKey(visible[i - 1]));
}

// A sorted COPY. 'subject' groups by subject (below); text keys compare case-insensitively. Any
// other key is a measurement column: absent values go last in both directions (an em dash is not
// a small number), and ties keep the input order, so the list never shuffles under a stable sort.
export function sortParameters(studies, sort) {
  const { key, dir } = { ...DEFAULT_SORT, ...(sort ?? {}) };
  const sign = dir === 'desc' ? -1 : 1;
  if (key === 'subject') {
    const indexed = studies.map((study, index) => ({ study, index }));
    indexed.sort((a, b) => {
      const ka = subjectKey(a.study);
      const kb = subjectKey(b.study);
      // No subject last in BOTH directions; the direction flips the subject order only, so a
      // block always reads Pre-op → Post-op (planning ruling, 2026-09-07).
      if (ka === null && kb === null) return compareWithinSubject(a, b);
      if (ka === null) return 1;
      if (kb === null) return -1;
      if (ka !== kb) return (ka < kb ? -1 : 1) * sign;
      return compareWithinSubject(a, b);
    });
    return indexed.map((entry) => entry.study);
  }
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
//   'filtered'     a workspace, folder, timepoint, view, subject or paired-only filter, or the search box, removed everything
//   'unsegmented'  studies exist, but none has measurements and segmented-only is on
export function emptyReason({ total, visible, filters, query }) {
  if (visible > 0) return null;
  if (total === 0) return 'none';
  const f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
  if (f.workspace || f.folder || f.timepoint || f.view || String(f.subject ?? '').trim() !== '' || f.pairedOnly === true
    || String(query ?? '').trim() !== '') return 'filtered';
  return 'unsegmented';
}

// `<root last segment>-<kind>.csv` for a workspace filter, else the whole library; `kind` is
// 'parameters' (the long export) or 'paired' (spec §10.4). The segment is reduced to letters,
// digits, underscore and hyphen so the suggested name is a valid filename on every platform.
export function exportFileName(workspace, kind = 'parameters') {
  if (!workspace || workspace === HAND_ADDED) return `library-${kind}.csv`;
  const stem = lastSegment(workspace).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${stem || 'workspace'}-${kind}.csv`;
}
