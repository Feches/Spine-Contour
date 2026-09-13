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

// The five-field result inferFromStem returns; every unnamed key is null.
const stem = (overrides) => ({ subjectId: null, timepoint: null, filmDate: null, view: null, note: null, ...overrides });

test('inferFromStem reads underscore-separated fields: the subject, then a timepoint, view or date', () => {
  assert.deepEqual(inferFromStem('S001'), stem({ subjectId: 'S001' }));
  assert.deepEqual(inferFromStem('S001_preop'), stem({ subjectId: 'S001', timepoint: 'Pre-op' }));
  assert.deepEqual(inferFromStem('S001_pre-op'), stem({ subjectId: 'S001', timepoint: 'Pre-op' }));
  assert.deepEqual(inferFromStem('S001_preop_flexion'), stem({ subjectId: 'S001', timepoint: 'Pre-op', view: 'Flexion lateral' }));
  assert.deepEqual(inferFromStem('S001_1yr_ext'), stem({ subjectId: 'S001', timepoint: '1 yr', view: 'Extension lateral' }));
  // Spaces and hyphens INSIDE a field are content, and the timepoint match ignores them.
  assert.deepEqual(inferFromStem('S001_pre op'), stem({ subjectId: 'S001', timepoint: 'Pre-op' }));
  assert.deepEqual(inferFromStem('S001_6 wk'), stem({ subjectId: 'S001', timepoint: '6 wk' }));
  assert.deepEqual(inferFromStem('S001_6-wk'), stem({ subjectId: 'S001', timepoint: '6 wk' }));
  // The fields after the subject come in any order; the last of a kind wins.
  assert.deepEqual(inferFromStem('S001_flexion_preop'), stem({ subjectId: 'S001', timepoint: 'Pre-op', view: 'Flexion lateral' }));
  assert.deepEqual(inferFromStem('S001_pre_post'), stem({ subjectId: 'S001', timepoint: 'Post-op' }));
  // Empty fields (a doubled underscore, padding) are skipped; a field is trimmed.
  assert.deepEqual(inferFromStem('S001__preop'), stem({ subjectId: 'S001', timepoint: 'Pre-op' }));
  assert.deepEqual(inferFromStem(' S001 _ preop '), stem({ subjectId: 'S001', timepoint: 'Pre-op' }));
  assert.deepEqual(inferFromStem(''), stem({}));
  assert.deepEqual(inferFromStem('___'), stem({}));
});

test('inferFromStem reads a film date field written M-D-YYYY or YYYY-MM-DD', () => {
  assert.deepEqual(inferFromStem('sub225_post-op_3-22-2024'), stem({ subjectId: 'sub225', timepoint: 'Post-op', filmDate: '2024-03-22' }));
  assert.deepEqual(inferFromStem('sub225_post-op_03-22-2024'), stem({ subjectId: 'sub225', timepoint: 'Post-op', filmDate: '2024-03-22' }));
  assert.deepEqual(inferFromStem('sub225_post-op_2024-03-22'), stem({ subjectId: 'sub225', timepoint: 'Post-op', filmDate: '2024-03-22' }));
  assert.deepEqual(inferFromStem('sub225_3-22-2024'), stem({ subjectId: 'sub225', filmDate: '2024-03-22' }));
  assert.deepEqual(inferFromStem('sub225_3-22-2024_post-op'), stem({ subjectId: 'sub225', timepoint: 'Post-op', filmDate: '2024-03-22' }));
  assert.deepEqual(inferFromStem('sub225_1-2-2024_10-23-2023'), stem({ subjectId: 'sub225', filmDate: '2023-10-23' }));
});

test('inferFromStem keeps the text before the first recognised field as the subject, underscores and all', () => {
  assert.deepEqual(inferFromStem('IMG_0001'), stem({ subjectId: 'IMG_0001' }));
  assert.deepEqual(inferFromStem('test_lateral x-ray_2'), stem({ subjectId: 'test_lateral x-ray_2' }));
  assert.deepEqual(inferFromStem('lateral'), stem({ subjectId: 'lateral' }));
  assert.deepEqual(inferFromStem('John Doe_pre-op_10-23-2023'), stem({ subjectId: 'John Doe', timepoint: 'Pre-op', filmDate: '2023-10-23' }));
  // Hyphens never separate fields, so a hyphenated name with no underscore is all subject.
  assert.deepEqual(inferFromStem('S001-6-wk'), stem({ subjectId: 'S001-6-wk' }));
  assert.deepEqual(inferFromStem('S001 pre op'), stem({ subjectId: 'S001 pre op' }));
  assert.deepEqual(inferFromStem('Preoperative planning_S001'), stem({ subjectId: 'Preoperative planning_S001' }));
});

test('inferFromStem: a stem of recognised fields alone has no subject unless a plain field follows them', () => {
  assert.deepEqual(inferFromStem('pre-op'), stem({ timepoint: 'Pre-op' }));
  assert.deepEqual(inferFromStem('extension'), stem({ view: 'Extension lateral' }));
  assert.deepEqual(inferFromStem('preop_flexion'), stem({ timepoint: 'Pre-op', view: 'Flexion lateral' }));
  assert.deepEqual(inferFromStem('3-22-2024'), stem({ filmDate: '2024-03-22' }));
  // A timing-first name: the first plain field after the recognised ones is the subject.
  assert.deepEqual(inferFromStem('preop_S001'), stem({ subjectId: 'S001', timepoint: 'Pre-op' }));
  assert.deepEqual(inferFromStem('preop_S001_femoral heads'), stem({ subjectId: 'S001', timepoint: 'Pre-op', note: 'femoral heads' }));
});

test('inferFromStem reads the plain fields after the recognised ones as the note, joined with spaces', () => {
  assert.deepEqual(inferFromStem('sub225_pre-op_10-23-2023_femoral heads'),
    stem({ subjectId: 'sub225', timepoint: 'Pre-op', filmDate: '2023-10-23', note: 'femoral heads' }));
  assert.deepEqual(inferFromStem('sub225_post-op_3-22-2024_femoral heads_left'),
    stem({ subjectId: 'sub225', timepoint: 'Post-op', filmDate: '2024-03-22', note: 'femoral heads left' }));
  assert.deepEqual(inferFromStem('sub225_post-op_femoral heads_3-22-2024'),
    stem({ subjectId: 'sub225', timepoint: 'Post-op', filmDate: '2024-03-22', note: 'femoral heads' }));
  assert.deepEqual(inferFromStem('S001_post_x_pre'), stem({ subjectId: 'S001', timepoint: 'Pre-op', note: 'x' }));
  // A field that only looks like a date is not one, and lands in the note where it can be seen.
  assert.deepEqual(inferFromStem('sub225_post-op_2-30-2024'), stem({ subjectId: 'sub225', timepoint: 'Post-op', note: '2-30-2024' }));
  assert.deepEqual(inferFromStem('sub225_post-op_3-22-24'), stem({ subjectId: 'sub225', timepoint: 'Post-op', note: '3-22-24' }));
  assert.deepEqual(inferFromStem('sub225_post-op_3/22/2024'), stem({ subjectId: 'sub225', timepoint: 'Post-op', note: '3/22/2024' }));
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
    assert.deepEqual(seed(relative), { subjectId, timepoint, filmDate: null, view, note: null }, relative);
  }
});

test('seedFields takes the film date and the note from the stem, behind a stored value or the CSV', () => {
  const D = 'Standing lateral';
  assert.deepEqual(seed('sub225_post-op_3-22-2024.jpg'),
    { subjectId: 'sub225', timepoint: 'Post-op', filmDate: '2024-03-22', view: D, note: null });
  assert.deepEqual(seed('sub225_pre-op_10-23-2023_femoral heads.jpg'),
    { subjectId: 'sub225', timepoint: 'Pre-op', filmDate: '2023-10-23', view: D, note: 'femoral heads' });
  // A folder subject still beats the stem's; the stem's date and note stand.
  assert.deepEqual(seed('P-9/sub225_post-op_3-22-2024_femoral heads.jpg'),
    { subjectId: 'P-9', timepoint: 'Post-op', filmDate: '2024-03-22', view: D, note: 'femoral heads' });
  // The CSV's date beats the stem's; a stored note beats the stem's; a stored '' note is a blank.
  const csv = { subjectId: null, timepoint: null, filmDate: '2025-09-14', view: null, badDate: false };
  assert.equal(seed('sub225_post-op_3-22-2024.jpg', { csv }).filmDate, '2025-09-14');
  assert.equal(seed('sub225_post-op_3-22-2024_femoral heads.jpg', { existing: { note: 'typed' } }).note, 'typed');
  assert.equal(seed('sub225_post-op_3-22-2024_femoral heads.jpg', { existing: { note: '' } }).note, 'femoral heads');
  const { sources } = seedFields({ filePath: film('sub225_post-op_3-22-2024_femoral heads.jpg'), root: ROOT });
  assert.deepEqual(sources, { subjectId: 'stem', timepoint: 'stem', filmDate: 'stem', view: 'row', note: 'stem' });
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
  assert.deepEqual(seed('pre-op/S001.png', { row }), { subjectId: 'S001', timepoint: 'Intra-op', filmDate: null, view: 'Extension lateral', note: null });
  // The film's own stem is more specific than its folder row.
  assert.deepEqual(seed('pre-op/S001_flexion.png', { row }), { subjectId: 'S001', timepoint: 'Intra-op', filmDate: null, view: 'Flexion lateral', note: null });
  assert.deepEqual(seed('pre-op/S001_post.png', { row }), { subjectId: 'S001', timepoint: 'Post-op', filmDate: null, view: 'Extension lateral', note: null });
  // A row set to no timepoint leaves the film with none, even though the folder is called pre-op.
  assert.deepEqual(seed('pre-op/S001.png', { row: { ...row, timepoint: null, view: 'Standing lateral' } }),
    { subjectId: 'S001', timepoint: null, filmDate: null, view: 'Standing lateral', note: null });
  // The CSV beats the stem and the row; a CSV field it does not supply falls through.
  const csv = { subjectId: 'P-77', timepoint: 'Post-op', filmDate: '2025-09-14', view: 'Supine lateral', badDate: false };
  assert.deepEqual(seed('pre-op/S001_flexion.png', { row, csv }), { subjectId: 'P-77', timepoint: 'Post-op', filmDate: '2025-09-14', view: 'Supine lateral', note: null });
  assert.deepEqual(seed('pre-op/S001_flexion.png', { row, csv: { ...csv, view: null, timepoint: null } }),
    { subjectId: 'P-77', timepoint: 'Intra-op', filmDate: '2025-09-14', view: 'Flexion lateral', note: null });
  // A stored value is kept whatever the CSV, stem or row say; a stored '' is a blank.
  const existing = { subjectId: 'KEEP', timepoint: '6 wk', filmDate: '2020-01-01', view: 'Prone lateral', note: 'kept' };
  assert.deepEqual(seed('pre-op/S001_flexion.png', { row, csv, existing }), existing);
  assert.deepEqual(seed('pre-op/S001.png', { row, existing: { subjectId: null, timepoint: '', filmDate: null, view: '', note: '' } }),
    { subjectId: 'S001', timepoint: 'Intra-op', filmDate: null, view: 'Extension lateral', note: null });
  // Subject comes from the first plain folder segment before the stem, and never from the row.
  assert.deepEqual(seed('S001/pre-op/S001_extra.png', { row }).subjectId, 'S001');
  assert.equal(seed('CohortA/S001.png').subjectId, 'CohortA');
});

test('seedFields reports where each value came from', () => {
  const row = { folder: 'pre-op', count: 1, timepoint: 'Pre-op', view: 'Standing lateral' };
  const csv = { subjectId: null, timepoint: null, filmDate: '2025-03-02', view: null, badDate: false };
  const { sources } = seedFields({ filePath: film('pre-op/S001_ext.png'), root: ROOT, row, csv });
  assert.deepEqual(sources, { subjectId: 'stem', timepoint: 'row', filmDate: 'csv', view: 'stem', note: null });
  // With no row given, seedFields derives the row as folderRows does (view defaulting to Standing
  // lateral), so a defaulted view reports 'row' too; 'default' is reachable only for a row object
  // that carries no view (controller ruling, 2026-09-07).
  const fresh = seedFields({ filePath: film('S001.png'), root: ROOT });
  assert.deepEqual(fresh.sources, { subjectId: 'stem', timepoint: null, filmDate: null, view: 'row', note: null });
  const folderSubject = seedFields({ filePath: film('S001/post-op/lateral.dcm'), root: ROOT });
  assert.deepEqual(folderSubject.sources, { subjectId: 'folder', timepoint: 'row', filmDate: null, view: 'row', note: null });
  const stored = seedFields({ filePath: film('S001.png'), root: ROOT, existing: { subjectId: 'X', timepoint: 'Pre-op', filmDate: '2025-01-01', view: 'Standing lateral', note: 'n' } });
  assert.deepEqual(stored.sources, { subjectId: 'stored', timepoint: 'stored', filmDate: 'stored', view: 'stored', note: 'stored' });
});
