import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FIND_SORT, FIND_SORT_KEYS, statusRank, toggleFindSort, sortFindRows, summaryCounts,
  STATUS_FILTERS, matchesStatus, normaliseStatusFilter,
  findOrder, findVisible, findNeighbour, findPosition,
} from '../renderer/data/find.js';
import { newBatch, withStopping } from '../renderer/data/batch.js';

// A real study under a workspace root. Every override is a record field.
function study(id, overrides = {}) {
  return {
    id, source: 'real', filePath: `C:\\films\\Cohort\\${id}.png`, fileName: `${id}.png`, name: null,
    workspaceFolder: 'C:\\films\\Cohort', subjectId: null, timepoint: null, filmDate: null,
    addedAt: '2026-09-10T10:00:00.000Z', view: 'Standing lateral', thumbnail: null,
    measurements: null, geometry: null, qc: null, reviewedAt: null, clinical: {}, ...overrides,
  };
}
// A model result: `predictionId` is what keeps a real study from reading Hand-placed (data/predictions.js isHandPlaced).
const SEG = { measurements: { PI: 50, PT: 10, SS: 40, LL: { 'L1-S1': 45 } }, qc: { femoral: { confidence: 0.9 } }, predictionId: 'p-1' };
const REV = { measurements: { PI: 50, PT: 10, SS: 40, LL: { 'L1-S1': 45 } }, qc: { femoral: { confidence: 0.2 } }, predictionId: 'p-1' };
// A real study whose levels were placed by hand: measurements, no model run (no predictionId, no qc.models).
const HAND = { measurements: { PI: 50, PT: 10, SS: 40, LL: { 'L1-S1': 45 } }, geometry: {}, qc: null, predictionId: null };
const ids = (rows) => rows.map((s) => s.id);

test('the default sort is newest first and the keys are the seven columns', () => {
  assert.deepEqual(DEFAULT_FIND_SORT, { key: 'date', dir: 'desc' });
  assert.ok(Object.isFrozen(DEFAULT_FIND_SORT));
  assert.deepEqual([...FIND_SORT_KEYS], ['study', 'subject', 'view', 'workspace', 'folder', 'date', 'status']);
});

test('toggleFindSort flips the active key and starts another key ascending', () => {
  assert.deepEqual(toggleFindSort({ key: 'date', dir: 'desc' }, 'date'), { key: 'date', dir: 'asc' });
  assert.deepEqual(toggleFindSort({ key: 'date', dir: 'asc' }, 'date'), { key: 'date', dir: 'desc' });
  assert.deepEqual(toggleFindSort({ key: 'date', dir: 'desc' }, 'study'), { key: 'study', dir: 'asc' });
  assert.deepEqual(toggleFindSort(null, 'status'), { key: 'status', dir: 'asc' });
  assert.deepEqual(toggleFindSort(undefined, 'date'), { key: 'date', dir: 'asc' }, 'the default is date desc, so date flips to asc');
});

test('sortFindRows returns a copy and tolerates no rows', () => {
  const rows = [study('SP-1000'), study('SP-1001')];
  const sorted = sortFindRows(rows, DEFAULT_FIND_SORT);
  assert.notEqual(sorted, rows);
  assert.deepEqual(ids(sorted), ['SP-1000', 'SP-1001']);
  assert.deepEqual(sortFindRows(undefined, null), []);
});

test('by date: newest first by default, oldest first ascending; an unparseable date sorts last both ways', () => {
  const rows = [
    study('SP-1000', { addedAt: '2026-09-01T00:00:00.000Z' }),
    study('SP-1001', { addedAt: 'not a date' }),
    study('SP-1002', { addedAt: '2026-09-03T00:00:00.000Z' }),
  ];
  assert.deepEqual(ids(sortFindRows(rows, DEFAULT_FIND_SORT)), ['SP-1002', 'SP-1000', 'SP-1001']);
  assert.deepEqual(ids(sortFindRows(rows, { key: 'date', dir: 'asc' })), ['SP-1000', 'SP-1002', 'SP-1001']);
});

test('by study: the display name, case-insensitively; ties keep input order in both directions', () => {
  const rows = [study('SP-1000', { name: 'beta' }), study('SP-1001', { name: 'Alpha' }), study('SP-1002', { name: 'alpha' })];
  assert.deepEqual(ids(sortFindRows(rows, { key: 'study', dir: 'asc' })), ['SP-1001', 'SP-1002', 'SP-1000']);
  assert.deepEqual(ids(sortFindRows(rows, { key: 'study', dir: 'desc' })), ['SP-1000', 'SP-1001', 'SP-1002']);
});

test('by subject: the subject id, else the demo label; an em dash last in both directions', () => {
  const demo = { ...study('SP-0042'), source: 'demo', filePath: null, workspaceFolder: null, pt: 'P-8841' };
  const rows = [study('SP-1000'), study('SP-1001', { subjectId: 'S002' }), demo, study('SP-1002', { subjectId: 's001' })];
  assert.deepEqual(ids(sortFindRows(rows, { key: 'subject', dir: 'asc' })), ['SP-0042', 'SP-1002', 'SP-1001', 'SP-1000']);
  assert.deepEqual(ids(sortFindRows(rows, { key: 'subject', dir: 'desc' })), ['SP-1001', 'SP-1002', 'SP-0042', 'SP-1000']);
});

test('by view, workspace and folder: the cell labels, em dash and blank last', () => {
  const hand = study('SP-1000', { workspaceFolder: null, filePath: 'D:\\loose\\a.png' });
  const a = study('SP-1001', { workspaceFolder: 'C:\\films\\Alpha', filePath: 'C:\\films\\Alpha\\pre-op\\a.png', view: 'Flexion lateral' });
  const b = study('SP-1002', { workspaceFolder: 'C:\\films\\Beta', filePath: 'C:\\films\\Beta\\post-op\\b.png', view: '' });
  assert.deepEqual(ids(sortFindRows([hand, a, b], { key: 'workspace', dir: 'asc' })), ['SP-1001', 'SP-1002', 'SP-1000']);
  assert.deepEqual(ids(sortFindRows([hand, a, b], { key: 'workspace', dir: 'desc' })), ['SP-1002', 'SP-1001', 'SP-1000']);
  assert.deepEqual(ids(sortFindRows([hand, a, b], { key: 'folder', dir: 'asc' })), ['SP-1000', 'SP-1002', 'SP-1001']);
  assert.deepEqual(ids(sortFindRows([hand, a, b], { key: 'view', dir: 'asc' })), ['SP-1001', 'SP-1000', 'SP-1002']);
  assert.deepEqual(ids(sortFindRows([hand, a, b], { key: 'view', dir: 'desc' })), ['SP-1000', 'SP-1001', 'SP-1002']);
});

test('by status: Failed, Processing, Unsegmented, Needs review, Hand-placed, Segmented, Reviewed; running reads Processing', () => {
  const rows = [
    study('SP-1000', SEG), study('SP-1001', REV), study('SP-1002'),
    study('SP-1003', { ...SEG, reviewedAt: '2026-09-10T12:00:00.000Z' }),
    study('SP-1004', { processingError: 'Orientation uncertain' }),
    study('SP-1005', HAND),
  ];
  assert.deepEqual(ids(sortFindRows(rows, { key: 'status', dir: 'asc' })), ['SP-1004', 'SP-1002', 'SP-1001', 'SP-1005', 'SP-1000', 'SP-1003']);
  assert.deepEqual(ids(sortFindRows(rows, { key: 'status', dir: 'desc' })), ['SP-1003', 'SP-1000', 'SP-1005', 'SP-1001', 'SP-1002', 'SP-1004']);
  assert.deepEqual(ids(sortFindRows(rows, { key: 'status', dir: 'asc' }, 'SP-1003')), ['SP-1004', 'SP-1003', 'SP-1002', 'SP-1001', 'SP-1005', 'SP-1000']);
  assert.equal(statusRank('fail'), 0);
  assert.equal(statusRank('proc'), 1);
  assert.equal(statusRank('unseg'), 2);
  assert.equal(statusRank('rev'), 3);
  assert.equal(statusRank('hand'), 4);
  assert.equal(statusRank('seg'), 5);
  assert.equal(statusRank('ok'), 6);
  assert.equal(statusRank('nonsense'), null);
});

// (2026-10-01, issue #39; port spec 3) the sort compares the status the row shows, batch included.
test('by status: films waiting in a running batch sort as Processing until the batch is stopping', () => {
  const rows = [study('SP-1000'), study('SP-1001'), study('SP-1002', SEG), study('SP-1003', { processingError: 'boom' })];
  const asc = { key: 'status', dir: 'asc' };
  assert.deepEqual(ids(sortFindRows(rows, asc)), ['SP-1003', 'SP-1000', 'SP-1001', 'SP-1002']);
  const batch = newBatch(['SP-1001', 'SP-1002']);
  assert.deepEqual(ids(sortFindRows(rows, asc, null, batch)), ['SP-1003', 'SP-1001', 'SP-1002', 'SP-1000']);
  assert.deepEqual(ids(sortFindRows(rows, asc, null, withStopping(batch))), ['SP-1003', 'SP-1000', 'SP-1001', 'SP-1002']);
});

// (2026-10-01, issue #39; port spec 3) the summary line counts the pills the rows show.
test('summaryCounts: UNSEGMENTED counts Unsegmented, Processing and Failed; TO REVIEW counts Needs review', () => {
  const rows = [
    study('SP-1000'), study('SP-1001', SEG), study('SP-1002', REV), study('SP-1003', { processingError: 'boom' }),
    study('SP-1004', { ...SEG, reviewedAt: '2026-09-10T12:00:00.000Z' }), study('SP-1005', { ...REV, processingError: 'boom' }),
  ];
  assert.deepEqual(summaryCounts(rows), { total: 6, unsegmented: 3, toReview: 1 });
  // A re-run of the Needs review film: it reads Processing, so it moves to UNSEGMENTED while it runs.
  assert.deepEqual(summaryCounts(rows, 'SP-1002'), { total: 6, unsegmented: 4, toReview: 0 });
  // A batch over the Unsegmented and Failed films: Processing while they wait, counted once, as before.
  assert.deepEqual(summaryCounts(rows, 'SP-1000', newBatch(['SP-1000', 'SP-1003', 'SP-1005'])), { total: 6, unsegmented: 3, toReview: 1 });
  assert.deepEqual(summaryCounts([]), { total: 0, unsegmented: 0, toReview: 0 });
  assert.deepEqual(summaryCounts(null), { total: 0, unsegmented: 0, toReview: 0 });
});

// Annotation editor round 2, spec section 4.2: a Hand-placed film is waiting on a person, so it is TO REVIEW; it is not UNSEGMENTED.
test('summaryCounts: a Hand-placed film counts in TO REVIEW and not in UNSEGMENTED', () => {
  const rows = [study('SP-1000', SEG), study('SP-1001', HAND), study('SP-1002', REV)];
  assert.deepEqual(summaryCounts(rows), { total: 3, unsegmented: 0, toReview: 2 });
  // Marked reviewed, it reads Reviewed and leaves the count.
  assert.deepEqual(summaryCounts([study('SP-1001', { ...HAND, reviewedAt: '2026-10-15T10:00:00.000Z' })]), { total: 1, unsegmented: 0, toReview: 0 });
  // Re-running it reads Processing, so it moves to UNSEGMENTED while it runs.
  assert.deepEqual(summaryCounts(rows, 'SP-1001'), { total: 3, unsegmented: 1, toReview: 1 });
});

test('an unknown key keeps the input order', () => {
  const rows = [study('SP-1001'), study('SP-1000')];
  assert.deepEqual(ids(sortFindRows(rows, { key: 'lordosis', dir: 'asc' })), ['SP-1001', 'SP-1000']);
});

// (2026-10-19, reviewer navigation) the Find list's status filter: Not reviewed, then every pill in workflow order.
const OK = { ...SEG, reviewedAt: '2026-10-19T10:00:00.000Z' };
const FAIL = { processingError: 'boom', processingErrorAt: '2026-10-19T10:00:00.000Z' };

test('STATUS_FILTERS: Not reviewed first, then the seven pills in workflow order, labelled as the pills are', () => {
  assert.deepEqual(STATUS_FILTERS.map((option) => option.value), ['unreviewed', 'unseg', 'proc', 'fail', 'rev', 'hand', 'seg', 'ok']);
  assert.deepEqual(STATUS_FILTERS.map((option) => option.label),
    ['Not reviewed', 'Unsegmented', 'Processing', 'Failed', 'Needs review', 'Hand-placed', 'Segmented', 'Reviewed']);
  assert.ok(Object.isFrozen(STATUS_FILTERS));
});

test('matchesStatus: no filter matches everything; a status matches exactly the pill the row shows', () => {
  const rows = {
    unseg: study('SP-1000'), seg: study('SP-1001', SEG), rev: study('SP-1002', REV),
    fail: study('SP-1003', FAIL), ok: study('SP-1004', OK), hand: study('SP-1005', HAND),
  };
  for (const row of Object.values(rows)) {
    assert.equal(matchesStatus(row, null), true);
    assert.equal(matchesStatus(row, undefined), true);
    assert.equal(matchesStatus(row, ''), true);
  }
  for (const [status, row] of Object.entries(rows)) {
    for (const other of Object.keys(rows)) assert.equal(matchesStatus(row, other), other === status, `${status} row under the ${other} filter`);
  }
  // A failed re-run of a measured film reads Failed, as its pill does, so it is not Segmented.
  assert.equal(matchesStatus(study('SP-1006', { ...SEG, ...FAIL }), 'fail'), true);
  assert.equal(matchesStatus(study('SP-1006', { ...SEG, ...FAIL }), 'seg'), false);
});

test('matchesStatus: Not reviewed is a result nobody has marked -- Segmented, Needs review or Hand-placed', () => {
  assert.equal(matchesStatus(study('SP-1001', SEG), 'unreviewed'), true);
  assert.equal(matchesStatus(study('SP-1002', REV), 'unreviewed'), true);
  assert.equal(matchesStatus(study('SP-1005', HAND), 'unreviewed'), true);
  assert.equal(matchesStatus(study('SP-1004', OK), 'unreviewed'), false);
  assert.equal(matchesStatus(study('SP-1000'), 'unreviewed'), false);
  assert.equal(matchesStatus(study('SP-1003', FAIL), 'unreviewed'), false);
  // Unmarked again, it is back in the set.
  assert.equal(matchesStatus(study('SP-1004', { ...OK, reviewedAt: null }), 'unreviewed'), true);
});

test('matchesStatus: Processing follows state.running and the waiting batch, as the pill does', () => {
  const seg = study('SP-1001', SEG);
  const unseg = study('SP-1000');
  assert.equal(matchesStatus(seg, 'proc'), false);
  assert.equal(matchesStatus(seg, 'proc', 'SP-1001'), true);
  assert.equal(matchesStatus(seg, 'seg', 'SP-1001'), false);
  // While it runs, a Segmented film is not Not reviewed either: the pill says Processing.
  assert.equal(matchesStatus(seg, 'unreviewed', 'SP-1001'), false);
  const batch = newBatch(['SP-1001', 'SP-1000']);
  assert.equal(matchesStatus(unseg, 'proc', 'SP-1001', batch), true, 'waiting in the batch reads Processing');
  assert.equal(matchesStatus(unseg, 'unseg', 'SP-1001', batch), false);
  assert.equal(matchesStatus(unseg, 'proc', 'SP-1001', withStopping(batch)), false, 'a stopping batch: the film that will not run reads its own status');
  assert.equal(matchesStatus(unseg, 'unseg', 'SP-1001', withStopping(batch)), true);
});

// (2026-10-19, reviewer navigation) the list's order and filters as one snapshot, for the Analysis screen's previous /
// next: the keys step through exactly the rows the Find list shows, in the order it shows them.
const day = (n) => `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`;
// Newest first by default, so the order is A, B, C, D.
const LIB = [
  study('SP-1003', { addedAt: day(1), name: 'delta' }),
  study('SP-1000', { addedAt: day(4), name: 'alpha', ...SEG }),
  study('SP-1002', { addedAt: day(2), name: 'gamma', ...REV }),
  study('SP-1001', { addedAt: day(3), name: 'beta' }),
];
const snapshot = (patch = {}) => ({
  studies: LIB, query: '', paramFilters: null, findSort: { key: 'date', dir: 'desc' }, findStatus: null,
  running: null, batch: null, ...patch,
});

test('findOrder and findVisible: the Find list\'s order, then its search, location and status filters', () => {
  assert.deepEqual(ids(findOrder(snapshot())), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  assert.deepEqual(ids(findVisible(snapshot())), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  assert.deepEqual(ids(findVisible(snapshot({ findSort: { key: 'study', dir: 'asc' } }))), ['SP-1000', 'SP-1001', 'SP-1003', 'SP-1002']);
  assert.deepEqual(ids(findVisible(snapshot({ findStatus: 'unseg' }))), ['SP-1001', 'SP-1003']);
  assert.deepEqual(ids(findVisible(snapshot({ findStatus: 'unreviewed' }))), ['SP-1000', 'SP-1002']);
  // The search box matches every searchable field, the view included ('ta' is in 'Standing lateral'); 'eta' is beta's alone.
  assert.deepEqual(ids(findVisible(snapshot({ query: 'ta' }))), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  assert.deepEqual(ids(findVisible(snapshot({ query: 'eta' }))), ['SP-1001'], 'the search box: beta');
  assert.deepEqual(ids(findVisible(snapshot({ query: 'a', findStatus: 'unseg', findSort: { key: 'study', dir: 'asc' } }))), ['SP-1001', 'SP-1003']);
  // The location filter: every study here sits under one root, so another root hides them all; a stale root is no filter.
  assert.deepEqual(ids(findVisible(snapshot({ paramFilters: { workspace: 'C:\\films\\Cohort' } }))), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  assert.deepEqual(ids(findVisible(snapshot({ paramFilters: { workspace: 'C:\\films\\Cohort', folder: 'Elsewhere' } }))), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  // Added by hand is an option only while a film with no root is in the library; with none it is no filter either.
  assert.deepEqual(ids(findVisible(snapshot({ paramFilters: { workspace: '__hand__' } }))), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  const hand = study('SP-1004', { addedAt: day(5), name: 'epsilon', workspaceFolder: null, filePath: null });
  assert.deepEqual(ids(findVisible(snapshot({ studies: [...LIB, hand], paramFilters: { workspace: '__hand__' } }))), ['SP-1004']);
  assert.deepEqual(ids(findVisible(snapshot({ studies: [...LIB, hand], paramFilters: { workspace: 'C:\\films\\Cohort' } }))), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  assert.deepEqual(ids(findVisible({ studies: null })), []);
  assert.deepEqual(ids(findOrder({})), []);
});

test('findNeighbour: the next or previous row the list shows, from the open study\'s own place in the order', () => {
  const s = snapshot();
  assert.equal(findNeighbour(s, 'SP-1001', 1)?.id, 'SP-1002');
  assert.equal(findNeighbour(s, 'SP-1001', -1)?.id, 'SP-1000');
  assert.equal(findNeighbour(s, 'SP-1000', -1), null, 'nothing before the first row');
  assert.equal(findNeighbour(s, 'SP-1003', 1), null, 'nothing after the last row: no wrap');
  assert.equal(findNeighbour(s, 'SP-9999', 1), null, 'a study not in the library has no neighbours');
  assert.equal(findNeighbour(s, null, 1), null);
  // Under a filter the keys skip the hidden rows.
  const unseg = snapshot({ findStatus: 'unseg' });
  assert.equal(findNeighbour(unseg, 'SP-1001', 1)?.id, 'SP-1003');
  assert.equal(findNeighbour(unseg, 'SP-1003', -1)?.id, 'SP-1001');
  assert.equal(findNeighbour(unseg, 'SP-1001', -1), null);
  // The open study itself fell out of the filter (marked reviewed under Not reviewed): next and previous still step
  // from where it sat, so review-then-arrow goes straight down the list.
  assert.equal(findNeighbour(unseg, 'SP-1000', 1)?.id, 'SP-1001');
  assert.equal(findNeighbour(unseg, 'SP-1002', 1)?.id, 'SP-1003');
  assert.equal(findNeighbour(unseg, 'SP-1002', -1)?.id, 'SP-1001');
  assert.equal(findNeighbour(unseg, 'SP-1000', -1), null);
  // The sort decides the direction.
  const asc = snapshot({ findSort: { key: 'date', dir: 'asc' } });
  assert.equal(findNeighbour(asc, 'SP-1003', 1)?.id, 'SP-1002');
  assert.equal(findNeighbour(asc, 'SP-1003', -1), null);
});

test('findPosition: the open study\'s 1-based place among the rows the list shows, or null outside the filter', () => {
  assert.deepEqual(findPosition(snapshot(), 'SP-1000'), { index: 1, count: 4 });
  assert.deepEqual(findPosition(snapshot(), 'SP-1003'), { index: 4, count: 4 });
  assert.deepEqual(findPosition(snapshot({ findStatus: 'unseg' }), 'SP-1003'), { index: 2, count: 2 });
  assert.deepEqual(findPosition(snapshot({ findStatus: 'unseg' }), 'SP-1000'), { index: null, count: 2 });
  assert.deepEqual(findPosition(snapshot(), 'SP-9999'), { index: null, count: 4 });
  assert.deepEqual(findPosition({ studies: [] }, 'SP-1000'), { index: null, count: 0 });
});

test('normaliseStatusFilter: a known value stays, anything else is no filter', () => {
  for (const option of STATUS_FILTERS) assert.equal(normaliseStatusFilter(option.value), option.value);
  assert.equal(normaliseStatusFilter('bogus'), null);
  assert.equal(normaliseStatusFilter(''), null);
  assert.equal(normaliseStatusFilter(undefined), null);
  assert.equal(normaliseStatusFilter(null), null);
  assert.equal(normaliseStatusFilter(42), null);
});
