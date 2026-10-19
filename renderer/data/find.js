/**
 * Pure logic for the Find list's sortable headers (studies-table spec 2026-09-10, section 6). No DOM.
 * screens/studies.js sorts the filtered rows through sortFindRows before building the table, so
 * the order on screen is the order the Segment and Delete buttons act in; test/find.test.js pins it.
 *
 * The rules are the grid's (data/parameters.js sortParameters): text compares case-insensitively;
 * an absent value -- an em dash, a blank, an unparseable date -- sorts LAST in both directions,
 * because a dash is not a small string; ties keep the incoming order, so a stable sort never
 * shuffles the list under the user.
 *
 * (2026-10-19, header filters) It also holds the header menus' filters: what each column's menu offers, how stored
 * ticks are normalised against the library, and whether a row passes them (spec F6, F7, section 3.3).
 */
import { displayStatus, statusLabel } from './status.js';
import { studyName, workspaceLabel, folderLabel, subjectLabel } from './labels.js';
import { normaliseFilters, matchesLocation, matchesSubject, workspaceOptions, folderOptions, NO_VIEW } from './parameters.js';
import { regionKey, regionLabel, REGION_KEYS } from './cervical.js';

const DASH = '\u2014';

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
// folder names the cells actually display are matched. The label record's comment (`labelComment`,
// annotation round 2) is searchable too, though no column shows it: it is what flags a film for a reader.
// (2026-10-19) Moved here from screens/studies.js, which re-exports it, so the Analysis screen's previous / next can
// apply the search without importing a screen.
export function matchesQuery(study, query) {
  const needle = (query ?? '').trim().toLowerCase();
  if (!needle) return true;
  return [study.id, studyName(study), study.subjectId, study.timepoint, study.filmDate, study.note, study.labelComment, workspaceLabel(study), folderLabel(study), study.pt, study.dx, study.view, ...Object.values(study.clinical ?? {})]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

// (2026-10-19, reviewer navigation) The Find list's status filter. `unreviewed` is a result nobody has marked --
// Segmented, Needs review or Hand-placed, the set a reviewer works through -- and the rest are the pills themselves,
// in PILLS' order, labelled as the pills are (data/status.js statusLabel) so the dropdown and the
// STATUS column can never disagree. The chosen value is state.findStatus: session-only, replaced wholesale, null for
// no filter; the Parameters grid has its own `segmentedOnly` and never reads it.
export const UNREVIEWED = 'unreviewed';
// (2026-10-19, header filters) The seven pills in the order the status dropdown and the STATUS menu list them (spec
// section 3.1), one list so the two cannot drift. It is not STATUS_RANK's sort order, which puts a failure first.
const PILLS = Object.freeze(['unseg', 'proc', 'fail', 'rev', 'hand', 'seg', 'ok']);
export const STATUS_FILTERS = Object.freeze([
  Object.freeze({ value: UNREVIEWED, label: 'Not reviewed' }),
  ...PILLS.map((status) => Object.freeze({ value: status, label: statusLabel(status) })),
]);

// A value the dropdown can show, else null (no filter): the normaliseFilters rule, for a stored or typed value.
export function normaliseStatusFilter(value) {
  return STATUS_FILTERS.some((option) => option.value === value) ? value : null;
}

// Whether a row passes the status filter: by the pill it SHOWS (displayStatus with state.running and state.batch), so
// a film waiting in a batch is Processing here as it is in its cell, and a Segmented film being re-run is not Not
// reviewed until its run ends. No filter passes everything.
export function matchesStatus(study, filter, runningId = null, batch = null) {
  const wanted = normaliseStatusFilter(filter);
  if (wanted === null) return true;
  const status = displayStatus(study, runningId, batch);
  if (wanted === UNREVIEWED) return status === 'seg' || status === 'rev' || status === 'hand';
  return status === wanted;
}

export const DEFAULT_FIND_SORT = Object.freeze({ key: 'date', dir: 'desc' });
export const FIND_SORT_KEYS = Object.freeze(['study', 'subject', 'region', 'view', 'workspace', 'folder', 'date', 'status']);

// Workflow order: what still needs doing sorts first. (2026-10-01, issue #39; port spec 3) A failure
// needs a person first, then the films running or waiting in the batch, then films nobody has run.
// (2026-10-15, annotation editor round 2, section 4.2) A Hand-placed film is a result nobody has checked yet,
// so it sorts after Needs review and before Segmented.
const STATUS_RANK = Object.freeze({ fail: 0, proc: 1, unseg: 2, rev: 3, hand: 4, seg: 5, ok: 6 });

export function statusRank(status) {
  return STATUS_RANK[status] ?? null;
}

// The grid's toggleSort rule as a pure function: clicking the active key flips it; another key
// starts ascending. `sort` may be null or partial; the default fills it.
export function toggleFindSort(sort, key) {
  const current = { ...DEFAULT_FIND_SORT, ...(sort ?? {}) };
  const dir = current.key === key && current.dir === 'asc' ? 'desc' : 'asc';
  return { key, dir };
}

// null for an absent value; otherwise the lower-cased text.
function text(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' || trimmed === DASH ? null : trimmed.toLowerCase();
}

function sortValue(study, key, runningId, batch) {
  switch (key) {
    case 'study': return text(studyName(study));
    case 'subject': return text(subjectLabel(study));
    // (2026-10-19, header filters; spec section 4) by the label the cell shows; Unknown is an absent value, so last.
    case 'region': {
      const key = regionKey(study);
      return key === 'unknown' ? null : regionLabel(key).toLowerCase();
    }
    case 'view': return text(study.view);
    case 'workspace': return text(workspaceLabel(study));
    case 'folder': return text(folderLabel(study));
    case 'date': {
      const time = Date.parse(study.addedAt ?? '');
      return Number.isNaN(time) ? null : time;
    }
    case 'status': return statusRank(displayStatus(study, runningId, batch));
    default: return null;
  }
}

// A sorted COPY. `runningId` is state.running and `batch` is state.batch, so the status compared is
// the one the row shows.
export function sortFindRows(studies, sort, runningId = null, batch = null) {
  const { key, dir } = { ...DEFAULT_FIND_SORT, ...(sort ?? {}) };
  const sign = dir === 'desc' ? -1 : 1;
  const indexed = (studies ?? []).map((study, index) => ({ study, index, value: sortValue(study, key, runningId, batch) }));
  indexed.sort((a, b) => {
    if (a.value === null && b.value === null) return a.index - b.index;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    if (a.value === b.value) return a.index - b.index;
    return (a.value < b.value ? -1 : 1) * sign;
  });
  return indexed.map((entry) => entry.study);
}

// ---- The header menus' filters (2026-10-19, header filters; spec F6, F7, section 3) ------------------------------
// state.findFilters holds one list of ticks per checkbox column and the SUBJECT menu's text. A column with no ticks
// passes everything, ticks within a column OR and columns AND, so an empty list comes only from a combination of
// ticks. Every menu says "none" with one key, NO_VIEW, for a film with no view and a film with no region alike.

export const DEFAULT_FIND_FILTERS = Object.freeze({ subject: '', region: [], view: [], workspace: [], folder: [], status: [] });
export const FILTER_COLUMNS = Object.freeze(['subject', 'region', 'view', 'workspace', 'folder', 'status']);

// A row's value in the REGION and VIEW menus: regionKey's `unknown` and a missing view are both NO_VIEW.
function regionValue(key) {
  return key === 'unknown' ? NO_VIEW : key;
}

function viewValue(study) {
  return study.view ?? NO_VIEW;
}

// A column's ticks, or null when it has none; a value that is not a list is none.
function ticksOf(filters, column) {
  const ticks = filters?.[column];
  return Array.isArray(ticks) && ticks.length > 0 ? ticks : null;
}

// The WORKSPACE rule per ticked value is matchesLocation's own, so HAND_ADDED is the film with no root.
function inWorkspaces(study, workspaces) {
  return workspaces.some((workspace) => matchesLocation(study, { workspace }));
}

// A to Z, case-insensitively; two views that differ only in case keep a fixed order.
function byText(a, b) {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// What each menu offers, from the whole library rather than the searched subset, labelled as the cells are. The
// options never depend on a run, so a menu does not change under a running batch: STATUS reads each film's own status,
// and Processing, which only a run shows, is never offered. FOLDER lists the folders among the films the WORKSPACE
// ticks keep (every film when none is ticked), counting only the ticks the WORKSPACE menu offers, as
// normaliseFindFilters keeps them; folderOptions lists them over those films, so the list and the grid share one rule.
export function findFilterOptions(studies, filters) {
  const list = studies ?? [];
  const regions = new Set(list.map((study) => regionKey(study)));
  const region = REGION_KEYS.filter((key) => regions.has(key)).map((key) => ({ value: regionValue(key), label: regionLabel(key) }));
  const views = new Set(list.map(viewValue));
  const view = [
    ...(views.has(NO_VIEW) ? [{ value: NO_VIEW, label: 'Unknown' }] : []),
    ...[...views].filter((value) => value !== NO_VIEW).sort(byText).map((value) => ({ value, label: value })),
  ];
  const workspace = workspaceOptions(list);
  const ticked = (ticksOf(filters, 'workspace') ?? []).filter((value) => workspace.some((o) => o.value === value));
  const folder = folderOptions(ticked.length > 0 ? list.filter((study) => inWorkspaces(study, ticked)) : list, null);
  const shown = new Set(list.map((study) => displayStatus(study, null, null)));
  const status = PILLS.filter((pill) => shown.has(pill)).map((pill) => ({ value: pill, label: statusLabel(pill) }));
  return { region, view, workspace, folder, status };
}

// The stored ticks reduced to what the menus offer now, each column deduplicated in the order it was ticked, every key
// present: the normaliseFilters rule, so a value that left the library (its last film deleted, relabelled or marked)
// is no filter rather than one no menu can show. FOLDER is reduced after WORKSPACE, because findFilterOptions lists the
// folders under the workspace ticks it offers, so a folder outside the ticked workspaces goes too. The SUBJECT text is
// kept as typed, since the box shows it back. Pure: the stale store value is not rewritten here.
export function normaliseFindFilters(filters, studies) {
  const options = findFilterOptions(studies, filters);
  const offered = (column) => {
    const values = options[column].map((option) => option.value);
    const ticks = ticksOf(filters, column) ?? [];
    return ticks.filter((value, i) => values.includes(value) && ticks.indexOf(value) === i);
  };
  return {
    subject: typeof filters?.subject === 'string' ? filters.subject : '',
    region: offered('region'), view: offered('view'), workspace: offered('workspace'), folder: offered('folder'), status: offered('status'),
  };
}

// How a menu's change is merged into the stored ticks: over what the menus show, so the change always wins and a stale
// tick never rides back in with it (patchFilters' reason). A tick is
// patchFindFilters(f, studies, { [column]: toggleId(f[column], value) }).
export function patchFindFilters(filters, studies, patch) {
  return { ...normaliseFindFilters(filters, studies), ...patch };
}

// Whether a row passes the menus (F7): every column with ticks keeps the rows whose value is one of them, and the
// SUBJECT text keeps the subjects that contain it, by the grid's rule. STATUS reads the pill the row SHOWS, with
// state.running and state.batch, as matchesStatus does. `filters` is normaliseFindFilters' output; a missing column is
// no filter.
export function matchesFindFilters(study, filters, runningId = null, batch = null) {
  if (!matchesSubject(study, filters?.subject)) return false;
  const region = ticksOf(filters, 'region');
  if (region && !region.includes(regionValue(regionKey(study)))) return false;
  const view = ticksOf(filters, 'view');
  if (view && !view.includes(viewValue(study))) return false;
  const workspace = ticksOf(filters, 'workspace');
  if (workspace && !inWorkspaces(study, workspace)) return false;
  const folder = ticksOf(filters, 'folder');
  if (folder && !folder.includes(folderLabel(study))) return false;
  const status = ticksOf(filters, 'status');
  return !status || status.includes(displayStatus(study, runningId, batch));
}

// The columns whose funnel reads active, in column order: any tick, or SUBJECT text the contains rule would apply
// (text of spaces filters nothing, so it is not active).
export function activeColumns(filters) {
  return FILTER_COLUMNS.filter((column) => (column === 'subject'
    ? String(filters?.subject ?? '').trim() !== ''
    : ticksOf(filters, column) !== null));
}

// ---- The list as one snapshot (2026-10-19, reviewer navigation) -------------------------------------------
// The Find list's order and its filters from a store snapshot, shared by the Studies screen (its rows) and the
// Analysis screen (previous / next, the position in the header), so the keys step through exactly the rows the list
// shows, in the order it shows them. `state` needs studies, query, paramFilters, findSort, findStatus, findFilters,
// running, batch. (2026-10-19, header filters) findFilters, the header menus' ticks, joined the bar's filters; Task 6
// removes the bar's two (paramFilters' workspace and folder, and findStatus) when the menus replace its dropdowns.

// Every study in the list's order, filtered or not.
export function findOrder(state) {
  return sortFindRows(state?.studies ?? [], state?.findSort, state?.running ?? null, state?.batch ?? null);
}

// Whether a study is a row the list shows: the search box, then the workspace and folder filters (normalised against
// the library, as the bar shows them), then the status filter, then the header menus' ticks (normalised against the
// library, as the menus show them).
function findPredicate(state) {
  const studies = state?.studies ?? [];
  const query = state?.query ?? '';
  const filters = normaliseFilters(state?.paramFilters, studies);
  const status = normaliseStatusFilter(state?.findStatus);
  const columns = normaliseFindFilters(state?.findFilters, studies);
  const running = state?.running ?? null;
  const batch = state?.batch ?? null;
  return (study) => matchesQuery(study, query) && matchesLocation(study, filters)
    && matchesStatus(study, status, running, batch) && matchesFindFilters(study, columns, running, batch);
}

// The rows the list shows, in table order.
export function findVisible(state) {
  return findOrder(state).filter(findPredicate(state));
}

// The row the list shows after (`step` 1) or before (`step` -1) the study `id`, or null at either end -- no wrap.
// It steps from the study's OWN place in the full order, whether or not the study still passes the filters: a film
// marked reviewed under Not reviewed has left the list, and its next is still the row after where it sat, so
// review-then-arrow goes straight down the list. A study not in the library has no neighbours.
export function findNeighbour(state, id, step) {
  const order = findOrder(state);
  const start = order.findIndex((study) => study.id === id);
  if (start === -1) return null;
  const shows = findPredicate(state);
  for (let i = start + step; i >= 0 && i < order.length; i += step) {
    if (shows(order[i])) return order[i];
  }
  return null;
}

// The study's 1-based place among the rows the list shows, `index` null when it is not one of them, and how many
// rows there are.
export function findPosition(state, id) {
  const visible = findVisible(state);
  const at = visible.findIndex((study) => study.id === id);
  return { index: at === -1 ? null : at + 1, count: visible.length };
}

// The Studies summary line's counts (2026-10-01, issue #39; port spec 3), over the list given, which
// is the whole library. They follow the pills the rows show: UNSEGMENTED is every film shown as
// Unsegmented, Processing or Failed, TO REVIEW every film shown as Needs review or Hand-placed; Segmented and
// Reviewed films count in the total only. A film showing the Unsupported view pill derives
// Unsegmented or Failed, so it is UNSEGMENTED too. `runningId` is state.running, `batch` state.batch.
export function summaryCounts(studies, runningId = null, batch = null) {
  const list = studies ?? [];
  const counts = { total: list.length, unsegmented: 0, toReview: 0 };
  for (const study of list) {
    const status = displayStatus(study, runningId, batch);
    if (status === 'unseg' || status === 'proc' || status === 'fail') counts.unsegmented += 1;
    else if (status === 'rev' || status === 'hand') counts.toReview += 1;
  }
  return counts;
}
