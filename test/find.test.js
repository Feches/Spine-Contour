import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FIND_SORT, FIND_SORT_KEYS, statusRank, toggleFindSort, sortFindRows, summaryCounts,
  STATUS_FILTERS, matchesStatus, normaliseStatusFilter,
  findOrder, findVisible, findNeighbour, findPosition,
  DEFAULT_FIND_FILTERS, FILTER_COLUMNS, findFilterOptions, normaliseFindFilters, patchFindFilters, matchesFindFilters, activeColumns,
} from '../renderer/data/find.js';
import { newBatch, withStopping } from '../renderer/data/batch.js';
import { NO_VIEW, HAND_ADDED, workspaceOptions, toggleId } from '../renderer/data/parameters.js';

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

test('the default sort is newest first and the keys are the eight columns', () => {
  assert.deepEqual(DEFAULT_FIND_SORT, { key: 'date', dir: 'desc' });
  assert.ok(Object.isFrozen(DEFAULT_FIND_SORT));
  assert.deepEqual([...FIND_SORT_KEYS], ['study', 'subject', 'region', 'view', 'workspace', 'folder', 'date', 'status']);
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

// (2026-10-19, header filters) the REGION column sorts by its label; Unknown is an absent value, so last both ways.
test('sortFindRows by region puts Unknown last in both directions', () => {
  const rows = [
    study('SP-1000'), // nothing set, nothing detected, no result: Unknown
    study('SP-1001', { ...SEG }), // a result that recorded no region: Lumbar
    study('SP-1002', { geometry: { region: 'cervical' } }), // detected: Cervical
    study('SP-1003', { region: 'full_spine' }), // set by a person: Full spine
    study('SP-1004', { region: 'auto' }), // auto with nothing detected: Unknown
  ];
  assert.deepEqual(ids(sortFindRows(rows, { key: 'region', dir: 'asc' })), ['SP-1002', 'SP-1003', 'SP-1001', 'SP-1000', 'SP-1004']);
  assert.deepEqual(ids(sortFindRows(rows, { key: 'region', dir: 'desc' })), ['SP-1001', 'SP-1003', 'SP-1002', 'SP-1000', 'SP-1004']);
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

// (2026-10-19, reviewer navigation) the STATUS column's vocabulary: every pill in workflow order. (2026-10-19, header
// filters; spec F2) Not reviewed went with the bar's dropdown: the STATUS menu ticks its three pills together.
const OK = { ...SEG, reviewedAt: '2026-10-19T10:00:00.000Z' };
const FAIL = { processingError: 'boom', processingErrorAt: '2026-10-19T10:00:00.000Z' };

test('STATUS_FILTERS: the seven pills in workflow order, labelled as the pills are', () => {
  assert.deepEqual(STATUS_FILTERS.map((option) => option.value), ['unseg', 'proc', 'fail', 'rev', 'hand', 'seg', 'ok']);
  assert.deepEqual(STATUS_FILTERS.map((option) => option.label),
    ['Unsegmented', 'Processing', 'Failed', 'Needs review', 'Hand-placed', 'Segmented', 'Reviewed']);
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

test('matchesStatus: Processing follows state.running and the waiting batch, as the pill does', () => {
  const seg = study('SP-1001', SEG);
  const unseg = study('SP-1000');
  assert.equal(matchesStatus(seg, 'proc'), false);
  assert.equal(matchesStatus(seg, 'proc', 'SP-1001'), true);
  assert.equal(matchesStatus(seg, 'seg', 'SP-1001'), false);
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
  studies: LIB, query: '', findSort: { key: 'date', dir: 'desc' }, findFilters: DEFAULT_FIND_FILTERS, running: null,
  batch: null, ...patch,
});
// The header menus' ticks on one column, over the defaults.
const ticks = (patch) => ({ findFilters: { ...DEFAULT_FIND_FILTERS, ...patch } });

test('findOrder and findVisible: the Find list\'s order, then its search and its header ticks', () => {
  assert.deepEqual(ids(findOrder(snapshot())), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  assert.deepEqual(ids(findVisible(snapshot())), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  assert.deepEqual(ids(findVisible(snapshot({ findSort: { key: 'study', dir: 'asc' } }))), ['SP-1000', 'SP-1001', 'SP-1003', 'SP-1002']);
  assert.deepEqual(ids(findVisible(snapshot(ticks({ status: ['unseg'] })))), ['SP-1001', 'SP-1003']);
  // The search box matches every searchable field, the view included ('ta' is in 'Standing lateral'); 'eta' is beta's alone.
  assert.deepEqual(ids(findVisible(snapshot({ query: 'ta' }))), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  assert.deepEqual(ids(findVisible(snapshot({ query: 'eta' }))), ['SP-1001'], 'the search box: beta');
  assert.deepEqual(ids(findVisible(snapshot({ query: 'a', ...ticks({ status: ['unseg'] }), findSort: { key: 'study', dir: 'asc' } }))), ['SP-1001', 'SP-1003']);
  // The WORKSPACE and FOLDER ticks: every study here sits under one root and in one folder, so ticking it keeps them
  // all; a folder no film sits in is no filter.
  assert.deepEqual(ids(findVisible(snapshot(ticks({ workspace: ['C:\\films\\Cohort'] })))), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  assert.deepEqual(ids(findVisible(snapshot(ticks({ workspace: ['C:\\films\\Cohort'], folder: ['Elsewhere'] })))), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  // Added by hand is offered only while a film with no root is in the library; with none it is no filter either.
  assert.deepEqual(ids(findVisible(snapshot(ticks({ workspace: [HAND_ADDED] })))), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  const hand = study('SP-1004', { addedAt: day(5), name: 'epsilon', workspaceFolder: null, filePath: null });
  assert.deepEqual(ids(findVisible(snapshot({ studies: [...LIB, hand], ...ticks({ workspace: [HAND_ADDED] }) }))), ['SP-1004']);
  assert.deepEqual(ids(findVisible(snapshot({ studies: [...LIB, hand], ...ticks({ workspace: ['C:\\films\\Cohort'] }) }))), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  // (2026-10-19, header filters; spec F6) The Parameters grid's paramFilters no longer narrows the list.
  assert.deepEqual(ids(findVisible(snapshot({ studies: [...LIB, hand], paramFilters: { workspace: HAND_ADDED } }))),
    ['SP-1004', 'SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
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
  const unseg = snapshot(ticks({ status: ['unseg'] }));
  assert.equal(findNeighbour(unseg, 'SP-1001', 1)?.id, 'SP-1003');
  assert.equal(findNeighbour(unseg, 'SP-1003', -1)?.id, 'SP-1001');
  assert.equal(findNeighbour(unseg, 'SP-1001', -1), null);
  // The open study itself is not one of the rows the filter keeps (as a film marked reviewed under the Needs review
  // tick is not): next and previous still step from where it sat, so review-then-arrow goes straight down the list.
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
  assert.deepEqual(findPosition(snapshot(ticks({ status: ['unseg'] })), 'SP-1003'), { index: 2, count: 2 });
  assert.deepEqual(findPosition(snapshot(ticks({ status: ['unseg'] })), 'SP-1000'), { index: null, count: 2 });
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

// ---- The header menus' filters (2026-10-19, header filters; spec F6, F7, section 3) ---------------------------------
// Six films that differ in every column a menu filters, entered out of each menu's own order, so the order a menu
// lists its values in is the rule's and not the library's.
const MIXED = [
  // Unsegmented; Full spine, set by a person; Standing lateral; the Alpha root, in pre-op.
  study('SP-1000', { region: 'full_spine', workspaceFolder: 'C:\\films\\Alpha', filePath: 'C:\\films\\Alpha\\pre-op\\a.png', subjectId: 'S001' }),
  // Segmented; Cervical, detected by the run; no view; the Cohort root.
  study('SP-1001', { ...SEG, geometry: { region: 'cervical' }, view: null, subjectId: 's002' }),
  // Needs review; Lumbar, a result that recorded no region; Flexion lateral.
  study('SP-1002', { ...REV, view: 'Flexion lateral' }),
  // Failed; Unknown region (nothing set, nothing detected, no result); a view stored in lower case.
  study('SP-1003', { ...FAIL, view: 'extension lateral' }),
  // Reviewed; Lumbar; added by hand from a loose folder.
  study('SP-1004', { ...OK, workspaceFolder: null, filePath: 'D:\\loose\\e.png', subjectId: 'T100' }),
  // Hand-placed; Lumbar.
  study('SP-1005', HAND),
];
const option = (value, label = value) => ({ value, label });

// (2026-10-19, final review; ruling R13) REGION and STATUS are fixed vocabularies: their menus offer every value whether
// or not a film shows it, so a tick on them never dissolves when its last film changes.
const ALL_REGIONS = [option(NO_VIEW, 'Unknown'), option('lumbar', 'Lumbar'), option('cervical', 'Cervical'), option('full_spine', 'Full spine')];
const ALL_STATUSES = [option('unseg', 'Unsegmented'), option('proc', 'Processing'), option('fail', 'Failed'), option('rev', 'Needs review'),
  option('hand', 'Hand-placed'), option('seg', 'Segmented'), option('ok', 'Reviewed')];

test('findFilterOptions: REGION and STATUS offer their whole vocabulary whatever the library holds (R13)', () => {
  for (const library of [MIXED, [MIXED[2], MIXED[1]], [MIXED[0]], [], null]) {
    const options = findFilterOptions(library, DEFAULT_FIND_FILTERS);
    assert.deepEqual(options.region, ALL_REGIONS, 'the four regions in REGION_KEYS order, Unknown under the none key');
    assert.deepEqual(options.status, ALL_STATUSES, 'the seven pills in the spec\'s order, Processing among them');
  }
  // The options never depend on a run either: the same seven while a film runs or waits in a batch.
  assert.deepEqual(findFilterOptions([study('SP-1000')], { ...DEFAULT_FIND_FILTERS, status: ['proc'] }).status, ALL_STATUSES);
});

test('findFilterOptions: region in workflow order, view with Unknown first, folder under the workspace ticks, status in pill order', () => {
  const options = findFilterOptions(MIXED, DEFAULT_FIND_FILTERS);
  // REGION: Unknown, Lumbar, Cervical, Full spine; Unknown's value is the one "none" key every menu uses.
  assert.deepEqual(options.region, ALL_REGIONS);
  assert.deepEqual(findFilterOptions([MIXED[2], MIXED[1]]).region, ALL_REGIONS, 'every region, not only those present (R13)');
  // VIEW: Unknown first when a film has none, then the stored views A to Z, case-insensitively.
  assert.deepEqual(options.view, [option(NO_VIEW, 'Unknown'), option('extension lateral'), option('Flexion lateral'), option('Standing lateral')]);
  assert.deepEqual(findFilterOptions([MIXED[0], MIXED[2]]).view, [option('Flexion lateral'), option('Standing lateral')], 'no Unknown when every film has a view');
  // WORKSPACE: the grid's options as they are -- the roots first seen first, then Added by hand.
  assert.deepEqual(options.workspace, workspaceOptions(MIXED));
  assert.deepEqual(options.workspace.map((o) => o.value), ['C:\\films\\Alpha', 'C:\\films\\Cohort', HAND_ADDED]);
  // FOLDER: the folders first seen first among the films the WORKSPACE ticks keep; every film when none is ticked.
  assert.deepEqual(options.folder, [option('pre-op'), option('Cohort'), option('loose')]);
  const folders = (workspace) => findFilterOptions(MIXED, { ...DEFAULT_FIND_FILTERS, workspace }).folder.map((o) => o.value);
  assert.deepEqual(folders(['C:\\films\\Cohort']), ['Cohort']);
  assert.deepEqual(folders([HAND_ADDED]), ['loose']);
  assert.deepEqual(folders([HAND_ADDED, 'C:\\films\\Alpha']), ['pre-op', 'loose'], 'library order, not tick order');
  // A root no film carries any more is not a tick the WORKSPACE menu shows, so it keeps no folder out.
  assert.deepEqual(folders(['C:\\films\\Gone']), ['pre-op', 'Cohort', 'loose']);
  // STATUS: every pill in the pills' order, labelled as the pills are, Processing included (R13 superseded R6, which
  // never offered it): a Processing tick matches the running and queued films, by the pill each row shows.
  assert.deepEqual(options.status, ALL_STATUSES);
  // VIEW, WORKSPACE and FOLDER keep the "present" rule: an empty library offers none of them.
  const empty = { region: ALL_REGIONS, view: [], workspace: [], folder: [], status: ALL_STATUSES };
  assert.deepEqual(findFilterOptions([]), empty);
  assert.deepEqual(findFilterOptions(null, null), empty);
});

test('normaliseFindFilters drops a value no longer offered and a folder outside the ticked workspaces', () => {
  assert.deepEqual(DEFAULT_FIND_FILTERS, { subject: '', region: [], view: [], workspace: [], folder: [], status: [] });
  assert.ok(Object.isFrozen(DEFAULT_FIND_FILTERS));
  // Defaults fill a missing, null or partial value.
  assert.deepEqual(normaliseFindFilters(null, MIXED), DEFAULT_FIND_FILTERS);
  assert.deepEqual(normaliseFindFilters(undefined, []), DEFAULT_FIND_FILTERS);
  assert.deepEqual(normaliseFindFilters({ region: ['lumbar'] }, MIXED), { ...DEFAULT_FIND_FILTERS, region: ['lumbar'] });
  // Review Focus 3. Every film in LIB sits under one root, and none in a folder called Elsewhere.
  assert.deepEqual(normaliseFindFilters({ workspace: ['C:\\films\\Cohort'], folder: ['Elsewhere'] }, LIB),
    { ...DEFAULT_FIND_FILTERS, workspace: ['C:\\films\\Cohort'], folder: [] });
  // A folder the library holds, but outside the ticked workspaces, goes too; the one inside them stays.
  assert.deepEqual(normaliseFindFilters({ workspace: ['C:\\films\\Alpha'], folder: ['Cohort', 'pre-op'] }, MIXED),
    { ...DEFAULT_FIND_FILTERS, workspace: ['C:\\films\\Alpha'], folder: ['pre-op'] });
  // A root no film carries goes first, so the folder ticks are kept against every film.
  assert.deepEqual(normaliseFindFilters({ workspace: ['C:\\films\\Gone'], folder: ['Cohort'] }, MIXED),
    { ...DEFAULT_FIND_FILTERS, folder: ['Cohort'] });
  // Values no film shows any more: no cervical film left, the one Needs review film marked reviewed, every view known.
  // (2026-10-19, final review; R13) The REGION and STATUS ticks stay, since those menus offer their whole vocabulary;
  // the VIEW tick no film carries goes, the normaliseFilters rule VIEW, WORKSPACE and FOLDER keep.
  const left = [{ ...MIXED[2], reviewedAt: '2026-10-19T11:00:00.000Z' }, MIXED[4]];
  assert.deepEqual(normaliseFindFilters({ region: ['cervical', 'lumbar'], status: ['rev', 'ok'], view: [NO_VIEW, 'Flexion lateral'] }, left),
    { ...DEFAULT_FIND_FILTERS, region: ['cervical', 'lumbar'], status: ['rev', 'ok'], view: ['Flexion lateral'] });
  // A value outside the vocabulary is still no tick: a region that is not one of the four, a status that is not a pill.
  assert.deepEqual(normaliseFindFilters({ region: ['thoracic', 'full_spine', 'unknown'], status: ['bogus', 'proc', 'unreviewed'] }, MIXED),
    { ...DEFAULT_FIND_FILTERS, region: ['full_spine'], status: ['proc'] });
  // Each column deduplicated in the order it was ticked; a value that is not a list is no ticks.
  assert.deepEqual(normaliseFindFilters({ region: ['lumbar', NO_VIEW, 'lumbar'], status: 'rev', view: null }, MIXED),
    { ...DEFAULT_FIND_FILTERS, region: ['lumbar', NO_VIEW] });
  // The subject text is a string, kept as typed: the box shows it back, so trimming here would eat the space the user
  // just typed between two words.
  assert.equal(normaliseFindFilters({ subject: 'S0 ' }, MIXED).subject, 'S0 ');
  assert.equal(normaliseFindFilters({ subject: 42 }, MIXED).subject, '');
  // Pure: a stale stored value is not rewritten.
  const stored = Object.freeze({ view: Object.freeze(['Gone']) });
  assert.deepEqual(normaliseFindFilters(stored, LIB).view, []);
  assert.deepEqual(stored.view, ['Gone']);
  // patchFindFilters merges a menu's change over what the menus show, so a stale tick never rides back in with it, and
  // a tick is toggleId over the column's ticks. A REGION tick no film shows is not stale (R13): it rides on.
  assert.deepEqual(patchFindFilters({ region: ['cervical'], view: ['Gone'] }, LIB, { status: ['unseg'] }),
    { ...DEFAULT_FIND_FILTERS, region: ['cervical'], status: ['unseg'] });
  let f = DEFAULT_FIND_FILTERS;
  f = patchFindFilters(f, MIXED, { region: toggleId(f.region, 'cervical') });
  f = patchFindFilters(f, MIXED, { region: toggleId(f.region, NO_VIEW) });
  assert.deepEqual(f, { ...DEFAULT_FIND_FILTERS, region: ['cervical', NO_VIEW] });
  f = patchFindFilters(f, MIXED, { region: toggleId(f.region, 'cervical') });
  assert.deepEqual(f, { ...DEFAULT_FIND_FILTERS, region: [NO_VIEW] });
  assert.deepEqual(DEFAULT_FIND_FILTERS.region, [], 'the default is never written through');
});

test('matchesFindFilters: OR within a column, AND across columns, no ticks passes everything', () => {
  const pass = (filters) => ids(MIXED.filter((s) => matchesFindFilters(s, filters)));
  const only = (patch) => pass({ ...DEFAULT_FIND_FILTERS, ...patch });
  const all = ids(MIXED);
  assert.deepEqual(pass(DEFAULT_FIND_FILTERS), all);
  assert.deepEqual(pass(null), all);
  assert.deepEqual(pass({}), all);
  assert.deepEqual(only({ subject: '   ' }), all, 'subject text of spaces filters nothing');
  // OR within a column: a row passes when its value is any of the ticks.
  assert.deepEqual(only({ region: ['cervical', 'full_spine'] }), ['SP-1000', 'SP-1001']);
  assert.deepEqual(only({ region: [NO_VIEW] }), ['SP-1003'], 'Unknown region');
  assert.deepEqual(only({ region: ['lumbar'] }), ['SP-1002', 'SP-1004', 'SP-1005'], 'a result that recorded no region is Lumbar');
  assert.deepEqual(only({ view: [NO_VIEW] }), ['SP-1001'], 'Unknown view');
  assert.deepEqual(only({ view: ['Flexion lateral', NO_VIEW] }), ['SP-1001', 'SP-1002']);
  assert.deepEqual(only({ workspace: [HAND_ADDED] }), ['SP-1004'], 'Added by hand is the film with no root');
  assert.deepEqual(only({ workspace: ['C:\\films\\Alpha', HAND_ADDED] }), ['SP-1000', 'SP-1004']);
  assert.deepEqual(only({ workspace: ['C:\\films\\Cohort'] }), ['SP-1001', 'SP-1002', 'SP-1003', 'SP-1005']);
  assert.deepEqual(only({ folder: ['loose', 'pre-op'] }), ['SP-1000', 'SP-1004']);
  assert.deepEqual(only({ status: ['rev', 'fail'] }), ['SP-1002', 'SP-1003']);
  // SUBJECT: the grid's contains rule, trimmed and case-insensitive; a film with no subject never matches text.
  assert.deepEqual(only({ subject: ' S00 ' }), ['SP-1000', 'SP-1001']);
  assert.deepEqual(only({ subject: 't1' }), ['SP-1004']);
  // AND across columns: a row passes every column that has ticks.
  assert.deepEqual(only({ region: ['lumbar'], workspace: ['C:\\films\\Cohort'] }), ['SP-1002', 'SP-1005']);
  assert.deepEqual(only({ region: ['lumbar'], workspace: ['C:\\films\\Cohort'], status: ['hand'] }), ['SP-1005']);
  assert.deepEqual(only({ subject: 's00', region: ['cervical'] }), ['SP-1001']);
  assert.deepEqual(only({ region: ['cervical'], status: ['rev'] }), [], 'each column keeps a film; together they keep none');
});

test('matchesFindFilters: status follows the pill the row shows, with the running film and the batch', () => {
  const byStatus = (...status) => ({ ...DEFAULT_FIND_FILTERS, status });
  const rows = {
    unseg: study('SP-1000'), seg: study('SP-1001', SEG), rev: study('SP-1002', REV),
    fail: study('SP-1003', FAIL), ok: study('SP-1004', OK), hand: study('SP-1005', HAND),
  };
  for (const [status, row] of Object.entries(rows)) {
    for (const other of Object.keys(rows)) assert.equal(matchesFindFilters(row, byStatus(other)), other === status, `${status} row under the ${other} tick`);
  }
  // A failed re-run of a measured film reads Failed, as its pill does, so it is not Segmented.
  assert.equal(matchesFindFilters(study('SP-1006', { ...SEG, ...FAIL }), byStatus('fail')), true);
  assert.equal(matchesFindFilters(study('SP-1006', { ...SEG, ...FAIL }), byStatus('seg')), false);
  const seg = study('SP-1001', SEG);
  const unseg = study('SP-1000');
  assert.equal(matchesFindFilters(seg, byStatus('proc')), false);
  assert.equal(matchesFindFilters(seg, byStatus('proc'), 'SP-1001'), true, 'the running film reads Processing');
  assert.equal(matchesFindFilters(seg, byStatus('seg'), 'SP-1001'), false);
  // The three results nobody has marked, ticked together (F2): while it runs, a Segmented film is none of them.
  assert.equal(matchesFindFilters(seg, byStatus('seg', 'rev', 'hand')), true);
  assert.equal(matchesFindFilters(seg, byStatus('seg', 'rev', 'hand'), 'SP-1001'), false);
  const batch = newBatch(['SP-1001', 'SP-1000']);
  assert.equal(matchesFindFilters(unseg, byStatus('proc'), 'SP-1001', batch), true, 'waiting in the batch reads Processing');
  assert.equal(matchesFindFilters(unseg, byStatus('unseg'), 'SP-1001', batch), false);
  assert.equal(matchesFindFilters(unseg, byStatus('proc'), 'SP-1001', withStopping(batch)), false, 'a stopping batch: the film that will not run reads its own status');
  assert.equal(matchesFindFilters(unseg, byStatus('unseg'), 'SP-1001', withStopping(batch)), true);
});

// Review Focus 5: the Analysis screen's previous / next follows the menus exactly as it followed the bar.
test('findVisible, findNeighbour and findPosition read findFilters', () => {
  // Newest first: three Needs review films among others, so two are still left after one is marked.
  const queue = [
    study('SP-1000', { addedAt: day(5), ...REV }),
    study('SP-1001', { addedAt: day(4), ...SEG }),
    study('SP-1002', { addedAt: day(3), ...REV }),
    study('SP-1003', { addedAt: day(2) }),
    study('SP-1004', { addedAt: day(1), ...REV }),
  ];
  const toReview = { ...DEFAULT_FIND_FILTERS, status: ['rev'] };
  const before = snapshot({ studies: queue, findFilters: toReview });
  assert.deepEqual(ids(findVisible(before)), ['SP-1000', 'SP-1002', 'SP-1004']);
  assert.deepEqual(findPosition(before, 'SP-1002'), { index: 2, count: 3 });
  assert.equal(findNeighbour(before, 'SP-1000', 1)?.id, 'SP-1002', 'the keys skip the rows the ticks hide');
  // The open film is marked reviewed: it leaves the list and has no place in it, and it still has a next and a
  // previous, stepped from where it sat.
  const marked = queue.map((s) => (s.id === 'SP-1002' ? { ...s, reviewedAt: '2026-10-19T12:00:00.000Z' } : s));
  const after = snapshot({ studies: marked, findFilters: toReview });
  assert.deepEqual(ids(findVisible(after)), ['SP-1000', 'SP-1004']);
  assert.deepEqual(findPosition(after, 'SP-1002'), { index: null, count: 2 });
  assert.equal(findNeighbour(after, 'SP-1002', 1)?.id, 'SP-1004', 'next: the next Needs review film');
  assert.equal(findNeighbour(after, 'SP-1002', -1)?.id, 'SP-1000', 'previous: the Needs review film before it');
  // The tick matches the pill the row shows: the running film reads Processing and is out of the list while it runs.
  assert.deepEqual(ids(findVisible(snapshot({ studies: queue, findFilters: toReview, running: 'SP-1000' }))), ['SP-1002', 'SP-1004']);
  // The ticks are normalised against the library, as the menus show them: a view no film has is no filter, while a
  // region no film has keeps nothing, since the REGION menu still offers it (2026-10-19, final review; R13).
  assert.deepEqual(ids(findVisible(snapshot({ findFilters: { ...DEFAULT_FIND_FILTERS, view: ['Gone'] } }))), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  assert.deepEqual(ids(findVisible(snapshot({ findFilters: { ...DEFAULT_FIND_FILTERS, region: ['cervical'] } }))), []);
  // The columns AND with the search box and with each other.
  assert.deepEqual(ids(findVisible(snapshot({ findFilters: { ...DEFAULT_FIND_FILTERS, region: [NO_VIEW] } }))), ['SP-1001', 'SP-1003']);
  assert.deepEqual(ids(findVisible(snapshot({ query: 'eta', findFilters: { ...DEFAULT_FIND_FILTERS, region: [NO_VIEW] } }))), ['SP-1001']);
  assert.deepEqual(ids(findVisible(snapshot({ findFilters: { ...DEFAULT_FIND_FILTERS, status: ['unseg'], region: ['lumbar'] } }))), []);
});

// (2026-10-19, final review; ruling R13) The review queue's filter must not dissolve at its last film: with the "present"
// rule, marking the last Needs review film reviewed normalised the tick away, the whole library showed, the arrows left
// the queue, and the stored tick came back unseen with the next Needs review film.
test('a status tick survives normalisation when no film reads that status', () => {
  const noneToReview = [study('SP-1000', SEG), study('SP-1001'), study('SP-1002', OK)];
  assert.deepEqual(normaliseFindFilters({ status: ['rev'] }, noneToReview), { ...DEFAULT_FIND_FILTERS, status: ['rev'] });
  assert.deepEqual(normaliseFindFilters({ region: [NO_VIEW], status: ['rev', 'hand'] }, [study('SP-1000', SEG)]),
    { ...DEFAULT_FIND_FILTERS, region: [NO_VIEW], status: ['rev', 'hand'] }, 'and a REGION tick no film shows');
  assert.deepEqual(normaliseFindFilters({ status: ['rev'] }, []), { ...DEFAULT_FIND_FILTERS, status: ['rev'] }, 'even in an empty library');
});

test('the last Needs review film marked reviewed under the Needs review tick: an empty list, no place, no neighbours', () => {
  const queue = [
    study('SP-1000', { addedAt: day(4), ...SEG }),
    study('SP-1001', { addedAt: day(3), ...REV }),
    study('SP-1002', { addedAt: day(2) }),
    study('SP-1003', { addedAt: day(1), ...OK }),
  ];
  const toReview = { ...DEFAULT_FIND_FILTERS, status: ['rev'] };
  const before = snapshot({ studies: queue, findFilters: toReview });
  assert.deepEqual(ids(findVisible(before)), ['SP-1001'], 'one film left to review');
  assert.deepEqual(findPosition(before, 'SP-1001'), { index: 1, count: 1 });
  const marked = queue.map((s) => (s.id === 'SP-1001' ? { ...s, reviewedAt: '2026-10-19T12:00:00.000Z' } : s));
  const after = snapshot({ studies: marked, findFilters: toReview });
  assert.deepEqual(ids(findVisible(after)), [], 'the tick stays: nothing left to review, not the whole library');
  assert.deepEqual(findPosition(after, 'SP-1001'), { index: null, count: 0 });
  assert.equal(findNeighbour(after, 'SP-1001', 1), null, 'Next goes nowhere, not to a film outside the queue');
  assert.equal(findNeighbour(after, 'SP-1001', -1), null, 'nor does Previous');
  // A later Needs review film joins the list the tick still holds, in plain sight.
  const later = snapshot({ studies: [study('SP-1004', { addedAt: day(5), ...REV }), ...marked], findFilters: toReview });
  assert.deepEqual(ids(findVisible(later)), ['SP-1004']);
});

test('activeColumns names the ticked columns in column order', () => {
  assert.deepEqual([...FILTER_COLUMNS], ['subject', 'region', 'view', 'workspace', 'folder', 'status']);
  assert.ok(Object.isFrozen(FILTER_COLUMNS));
  assert.deepEqual(activeColumns(DEFAULT_FIND_FILTERS), []);
  assert.deepEqual(activeColumns(null), []);
  assert.deepEqual(activeColumns({}), []);
  // Column order, not the order the keys were written in.
  assert.deepEqual(activeColumns({ status: ['rev'], folder: ['Cohort'], region: [NO_VIEW], subject: 's0' }), ['subject', 'region', 'folder', 'status']);
  // Subject text of spaces filters nothing (the contains rule trims it), so its column is not active.
  assert.deepEqual(activeColumns({ ...DEFAULT_FIND_FILTERS, subject: '   ', view: [NO_VIEW] }), ['view']);
  assert.deepEqual(activeColumns({ subject: 'x', region: ['lumbar'], view: [NO_VIEW], workspace: [HAND_ADDED], folder: ['loose'], status: ['ok'] }), [...FILTER_COLUMNS]);
});
