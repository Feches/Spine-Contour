import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FIND_SORT, FIND_SORT_KEYS, statusRank, toggleFindSort, sortFindRows, summaryCounts } from '../renderer/data/find.js';
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
const SEG = { measurements: { PI: 50, PT: 10, SS: 40, LL: { 'L1-S1': 45 } }, qc: { femoral: { confidence: 0.9 } } };
const REV = { measurements: { PI: 50, PT: 10, SS: 40, LL: { 'L1-S1': 45 } }, qc: { femoral: { confidence: 0.2 } } };
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

test('by status: Failed, Processing, Unsegmented, Needs review, Segmented, Reviewed; running reads Processing', () => {
  const rows = [
    study('SP-1000', SEG), study('SP-1001', REV), study('SP-1002'),
    study('SP-1003', { ...SEG, reviewedAt: '2026-09-10T12:00:00.000Z' }),
    study('SP-1004', { processingError: 'Orientation uncertain' }),
  ];
  assert.deepEqual(ids(sortFindRows(rows, { key: 'status', dir: 'asc' })), ['SP-1004', 'SP-1002', 'SP-1001', 'SP-1000', 'SP-1003']);
  assert.deepEqual(ids(sortFindRows(rows, { key: 'status', dir: 'desc' })), ['SP-1003', 'SP-1000', 'SP-1001', 'SP-1002', 'SP-1004']);
  assert.deepEqual(ids(sortFindRows(rows, { key: 'status', dir: 'asc' }, 'SP-1003')), ['SP-1004', 'SP-1003', 'SP-1002', 'SP-1001', 'SP-1000']);
  assert.equal(statusRank('fail'), 0);
  assert.equal(statusRank('proc'), 1);
  assert.equal(statusRank('unseg'), 2);
  assert.equal(statusRank('rev'), 3);
  assert.equal(statusRank('seg'), 4);
  assert.equal(statusRank('ok'), 5);
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

test('an unknown key keeps the input order', () => {
  const rows = [study('SP-1001'), study('SP-1000')];
  assert.deepEqual(ids(sortFindRows(rows, { key: 'lordosis', dir: 'asc' })), ['SP-1001', 'SP-1000']);
});
