import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  folderSegments, folderKey, inferFromFolder, inferFromStem, folderRows, seedFields,
} from '../renderer/data/seeding.js';

const ROOT = 'C:\\ws\\Fusion2025';
const film = (relative) => `${ROOT}\\${relative.replace(/\//g, '\\')}`;
const seed = (relative, extra = {}) => seedFields({ filePath: film(relative), root: ROOT, ...extra }).fields;

test('folderSegments returns the segments strictly below the root, without the file, either separator', () => {
  assert.deepEqual(folderSegments(film('pre-op/S001.png'), ROOT), ['pre-op']);
  assert.deepEqual(folderSegments(film('S001/post-op/lateral.dcm'), ROOT), ['S001', 'post-op']);
  assert.deepEqual(folderSegments(film('S001.png'), ROOT), []);
  assert.deepEqual(folderSegments('C:/ws/Fusion2025/pre-op/S001.png', ROOT), ['pre-op']);
  // The root is matched case-insensitively (Windows paths), and a film outside it has no segments.
  assert.deepEqual(folderSegments('c:\\WS\\fusion2025\\pre-op\\S001.png', ROOT), ['pre-op']);
  assert.deepEqual(folderSegments('D:\\elsewhere\\pre-op\\S001.png', ROOT), []);
  assert.deepEqual(folderSegments(film('pre-op/S001.png'), null), []);
});

test('folderKey joins the segments with / and reads . for the root itself', () => {
  assert.equal(folderKey(film('S001.png'), ROOT), '.');
  assert.equal(folderKey(film('pre-op/S001.png'), ROOT), 'pre-op');
  assert.equal(folderKey(film('CohortA/1yr/S001.png'), ROOT), 'CohortA/1yr');
});

test('inferFromFolder: the last timepoint and view segments win, the first plain segment is the subject', () => {
  assert.deepEqual(inferFromFolder(['pre-op']), { subjectId: null, timepoint: 'Pre-op', view: null });
  assert.deepEqual(inferFromFolder(['S001', 'post-op']), { subjectId: 'S001', timepoint: 'Post-op', view: null });
  assert.deepEqual(inferFromFolder(['flexion']), { subjectId: null, timepoint: null, view: 'Flexion lateral' });
  assert.deepEqual(inferFromFolder(['S001', 'pre-op', 'extension']), { subjectId: 'S001', timepoint: 'Pre-op', view: 'Extension lateral' });
  assert.deepEqual(inferFromFolder(['CohortA', '1yr']), { subjectId: 'CohortA', timepoint: '1 yr', view: null });
  assert.deepEqual(inferFromFolder(['CohortA', 'S001']), { subjectId: 'CohortA', timepoint: null, view: null });
  assert.deepEqual(inferFromFolder(['pre-op', 'post-op']), { subjectId: null, timepoint: 'Post-op', view: null });
  assert.deepEqual(inferFromFolder(['Preoperative planning']), { subjectId: 'Preoperative planning', timepoint: null, view: null });
  assert.deepEqual(inferFromFolder([]), { subjectId: null, timepoint: null, view: null });
});

test('inferFromStem peels trailing timepoint and view tokens and keeps the rest as the subject', () => {
  assert.deepEqual(inferFromStem('S001'), { subjectId: 'S001', timepoint: null, view: null });
  assert.deepEqual(inferFromStem('S001_preop'), { subjectId: 'S001', timepoint: 'Pre-op', view: null });
  assert.deepEqual(inferFromStem('S001_pre-op'), { subjectId: 'S001', timepoint: 'Pre-op', view: null });
  assert.deepEqual(inferFromStem('S001 pre op'), { subjectId: 'S001', timepoint: 'Pre-op', view: null });
  assert.deepEqual(inferFromStem('S001_preop_flexion'), { subjectId: 'S001', timepoint: 'Pre-op', view: 'Flexion lateral' });
  assert.deepEqual(inferFromStem('S001-6-wk'), { subjectId: 'S001', timepoint: '6 wk', view: null });
  assert.deepEqual(inferFromStem('S001_1yr_ext'), { subjectId: 'S001', timepoint: '1 yr', view: 'Extension lateral' });
  // A stem made only of tokens supplies no subject.
  assert.deepEqual(inferFromStem('pre-op'), { subjectId: null, timepoint: 'Pre-op', view: null });
  assert.deepEqual(inferFromStem('extension'), { subjectId: null, timepoint: null, view: 'Extension lateral' });
  assert.deepEqual(inferFromStem('preop_flexion'), { subjectId: null, timepoint: 'Pre-op', view: 'Flexion lateral' });
  // A leading token is not trailing and stays in the subject; IMG_0001 has no tokens at all.
  assert.deepEqual(inferFromStem('preop_S001'), { subjectId: 'preop_S001', timepoint: null, view: null });
  assert.deepEqual(inferFromStem('IMG_0001'), { subjectId: 'IMG_0001', timepoint: null, view: null });
  assert.deepEqual(inferFromStem('lateral'), { subjectId: 'lateral', timepoint: null, view: null });
  // The rightmost token of each kind wins, and peeling stops at the first non-token.
  assert.deepEqual(inferFromStem('S001_pre_post'), { subjectId: 'S001', timepoint: 'Post-op', view: null });
  assert.deepEqual(inferFromStem('S001_post_x_pre'), { subjectId: 'S001_post_x', timepoint: 'Pre-op', view: null });
  assert.deepEqual(inferFromStem(''), { subjectId: null, timepoint: null, view: null });
});

// Every row of the spec's §8.1 table, through seedFields with no CSV, no stored record and no
// user-set folder row -- the values the load assigns to a fresh workspace untouched on the card.
test('seedFields reproduces the §8.1 table for a fresh film', () => {
  const D = 'Standing lateral';
  const rows = [
    ['pre-op/S001.png', 'S001', 'Pre-op', D],
    ['S001/pre-op.png', 'S001', 'Pre-op', D],
    ['S001/post-op/lateral.dcm', 'S001', 'Post-op', D],
    ['S001_preop.png', 'S001', 'Pre-op', D],
    ['flexion/S001.png', 'S001', null, 'Flexion lateral'],
    ['S001/pre-op/extension.png', 'S001', 'Pre-op', 'Extension lateral'],
    ['S001_preop_flexion.png', 'S001', 'Pre-op', 'Flexion lateral'],
    ['intra-op/S001.dcm', 'S001', 'Intra-op', D],
    ['CohortA/1yr/S001.png', 'CohortA', '1 yr', D],
    ['S001.png', 'S001', null, D],
    ['IMG_0001.png', 'IMG_0001', null, D],
  ];
  for (const [relative, subjectId, timepoint, view] of rows) {
    assert.deepEqual(seed(relative), { subjectId, timepoint, filmDate: null, view }, relative);
  }
});

test('folderRows lists each folder directly holding a film, in scan order, with its count and inferred values', () => {
  const files = [
    film('S000.png'), film('pre-op/S001.png'), film('pre-op/S002.png'), film('post-op/S001.png'),
    film('flexion/S003.png'), film('CohortA/1yr/S001.png'),
  ];
  assert.deepEqual(folderRows(files, ROOT), [
    { folder: '.', count: 1, timepoint: null, view: 'Standing lateral' },
    { folder: 'pre-op', count: 2, timepoint: 'Pre-op', view: 'Standing lateral' },
    { folder: 'post-op', count: 1, timepoint: 'Post-op', view: 'Standing lateral' },
    { folder: 'flexion', count: 1, timepoint: null, view: 'Flexion lateral' },
    { folder: 'CohortA/1yr', count: 1, timepoint: '1 yr', view: 'Standing lateral' },
  ]);
  assert.deepEqual(folderRows([], ROOT), []);
  // A root with no subfolders is one row.
  assert.deepEqual(folderRows([film('a.png'), film('b.png')], ROOT), [{ folder: '.', count: 2, timepoint: null, view: 'Standing lateral' }]);
});

test('seedFields applies §8.3: stored beats CSV beats stem beats the folder row beats the default', () => {
  const row = { folder: 'pre-op', count: 2, timepoint: 'Intra-op', view: 'Extension lateral' };
  // A user-set row applies to a film whose own name says nothing.
  assert.deepEqual(seed('pre-op/S001.png', { row }), { subjectId: 'S001', timepoint: 'Intra-op', filmDate: null, view: 'Extension lateral' });
  // The film's own stem is more specific than its folder row.
  assert.deepEqual(seed('pre-op/S001_flexion.png', { row }), { subjectId: 'S001', timepoint: 'Intra-op', filmDate: null, view: 'Flexion lateral' });
  assert.deepEqual(seed('pre-op/S001_post.png', { row }), { subjectId: 'S001', timepoint: 'Post-op', filmDate: null, view: 'Extension lateral' });
  // A row set to no timepoint leaves the film with none, even though the folder is called pre-op.
  assert.deepEqual(seed('pre-op/S001.png', { row: { ...row, timepoint: null, view: 'Standing lateral' } }),
    { subjectId: 'S001', timepoint: null, filmDate: null, view: 'Standing lateral' });
  // The CSV beats the stem and the row; a CSV field it does not supply falls through.
  const csv = { subjectId: 'P-77', timepoint: 'Post-op', filmDate: '2025-09-14', view: 'Supine lateral', badDate: false };
  assert.deepEqual(seed('pre-op/S001_flexion.png', { row, csv }), { subjectId: 'P-77', timepoint: 'Post-op', filmDate: '2025-09-14', view: 'Supine lateral' });
  assert.deepEqual(seed('pre-op/S001_flexion.png', { row, csv: { ...csv, view: null, timepoint: null } }),
    { subjectId: 'P-77', timepoint: 'Intra-op', filmDate: '2025-09-14', view: 'Flexion lateral' });
  // A stored value is kept whatever the CSV, stem or row say; a stored '' is a blank.
  const existing = { subjectId: 'KEEP', timepoint: '6 wk', filmDate: '2020-01-01', view: 'Prone lateral' };
  assert.deepEqual(seed('pre-op/S001_flexion.png', { row, csv, existing }), existing);
  assert.deepEqual(seed('pre-op/S001.png', { row, existing: { subjectId: null, timepoint: '', filmDate: null, view: '' } }),
    { subjectId: 'S001', timepoint: 'Intra-op', filmDate: null, view: 'Extension lateral' });
  // Subject comes from the first plain folder segment before the stem, and never from the row.
  assert.deepEqual(seed('S001/pre-op/S001_extra.png', { row }).subjectId, 'S001');
  assert.equal(seed('CohortA/S001.png').subjectId, 'CohortA');
});

test('seedFields reports where each value came from', () => {
  const row = { folder: 'pre-op', count: 1, timepoint: 'Pre-op', view: 'Standing lateral' };
  const csv = { subjectId: null, timepoint: null, filmDate: '2025-03-02', view: null, badDate: false };
  const { sources } = seedFields({ filePath: film('pre-op/S001_ext.png'), root: ROOT, row, csv });
  assert.deepEqual(sources, { subjectId: 'stem', timepoint: 'row', filmDate: 'csv', view: 'stem' });
  // With no row given, seedFields derives the row as folderRows does (view defaulting to Standing
  // lateral), so a defaulted view reports 'row' too; 'default' is reachable only for a row object
  // that carries no view (controller ruling, 2026-09-07).
  const fresh = seedFields({ filePath: film('S001.png'), root: ROOT });
  assert.deepEqual(fresh.sources, { subjectId: 'stem', timepoint: null, filmDate: null, view: 'row' });
  const folderSubject = seedFields({ filePath: film('S001/post-op/lateral.dcm'), root: ROOT });
  assert.deepEqual(folderSubject.sources, { subjectId: 'folder', timepoint: 'row', filmDate: null, view: 'row' });
  const stored = seedFields({ filePath: film('S001.png'), root: ROOT, existing: { subjectId: 'X', timepoint: 'Pre-op', filmDate: '2025-01-01', view: 'Standing lateral' } });
  assert.deepEqual(stored.sources, { subjectId: 'stored', timepoint: 'stored', filmDate: 'stored', view: 'stored' });
});
