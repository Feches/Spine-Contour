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
import { displayStatus } from './status.js';
import { studyName, workspaceLabel, folderLabel, subjectLabel } from './labels.js';

const DASH = '\u2014';

export const DEFAULT_FIND_SORT = Object.freeze({ key: 'date', dir: 'desc' });
export const FIND_SORT_KEYS = Object.freeze(['study', 'subject', 'view', 'workspace', 'folder', 'date', 'status']);

// Workflow order: what still needs doing sorts first. (2026-10-01, issue #39; port spec 3) A failure
// needs a person first, then the films running or waiting in the batch, then films nobody has run.
const STATUS_RANK = Object.freeze({ fail: 0, proc: 1, unseg: 2, rev: 3, seg: 4, ok: 5 });

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
// Unsegmented, Processing or Failed, TO REVIEW every film shown as Needs review; Segmented and
// Reviewed films count in the total only. A film showing the Unsupported view pill derives
// Unsegmented or Failed, so it is UNSEGMENTED too. `runningId` is state.running, `batch` state.batch.
export function summaryCounts(studies, runningId = null, batch = null) {
  const list = studies ?? [];
  const counts = { total: list.length, unsegmented: 0, toReview: 0 };
  for (const study of list) {
    const status = displayStatus(study, runningId, batch);
    if (status === 'unseg' || status === 'proc' || status === 'fail') counts.unsegmented += 1;
    else if (status === 'rev') counts.toReview += 1;
  }
  return counts;
}
