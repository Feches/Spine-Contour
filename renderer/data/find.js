/**
 * Pure logic for the Find list's sortable headers (studies-table spec 2026-09-10, section 6). No DOM.
 * screens/studies.js sorts the filtered rows through sortFindRows before building the table, so
 * the order on screen is the order the Segment and Delete buttons act in; test/find.test.js pins it.
 *
 * The rules are the grid's (data/parameters.js sortParameters): text compares case-insensitively;
 * an absent value -- an em dash, a blank, an unparseable date -- sorts LAST in both directions,
 * because a dash is not a small string; ties keep the incoming order, so a stable sort never
 * shuffles the list under the user.
 */
import { displayStatus, statusLabel } from './status.js';
import { studyName, workspaceLabel, folderLabel, subjectLabel } from './labels.js';

const DASH = '\u2014';

// (2026-10-19, reviewer navigation) The Find list's status filter. `unreviewed` is a result nobody has marked --
// Segmented, Needs review or Hand-placed, the set a reviewer works through -- and the rest are the pills themselves,
// in STATUS_RANK's workflow order, labelled as the pills are (data/status.js statusLabel) so the dropdown and the
// STATUS column can never disagree. The chosen value is state.findStatus: session-only, replaced wholesale, null for
// no filter; the Parameters grid has its own `segmentedOnly` and never reads it.
export const UNREVIEWED = 'unreviewed';
export const STATUS_FILTERS = Object.freeze([
  Object.freeze({ value: UNREVIEWED, label: 'Not reviewed' }),
  ...['unseg', 'proc', 'fail', 'rev', 'hand', 'seg', 'ok'].map((status) => Object.freeze({ value: status, label: statusLabel(status) })),
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
export const FIND_SORT_KEYS = Object.freeze(['study', 'subject', 'view', 'workspace', 'folder', 'date', 'status']);

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
