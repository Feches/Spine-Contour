import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, matchesQuery, newStudy, studyFromFile } from '../renderer/screens/studies.js';

test('formatDate renders a short month/day/year', () => {
  // Noon UTC renders as the same calendar day from UTC-12 to UTC+11, so this holds on the
  // developer's machine and on CI alike.
  assert.equal(formatDate('2026-08-21T12:00:00.000Z'), 'Aug 21, 2026');
});

test('formatDate renders an em dash for a missing or invalid date', () => {
  assert.equal(formatDate(null), '\u2014');
  assert.equal(formatDate(undefined), '\u2014');
  assert.equal(formatDate('not a date'), '\u2014');
});

test('matchesQuery matches on id, patient, diagnosis, and view, case-insensitively', () => {
  const study = { id: 'SP-0042', pt: 'P-8841', dx: 'Anterior slip of L4 on L5', view: 'Standing lateral' };
  assert.equal(matchesQuery(study, 'sp-0042'), true);
  assert.equal(matchesQuery(study, 'p-8841'), true);
  assert.equal(matchesQuery(study, 'anterior slip'), true);
  assert.equal(matchesQuery(study, 'standing'), true);
  assert.equal(matchesQuery(study, 'flexion'), false);
});

test('matchesQuery tolerates studies with no patient or diagnosis fields', () => {
  const study = { id: 'SP-1000', view: 'Standing lateral' };
  assert.equal(matchesQuery(study, 'sp-1000'), true);
  assert.equal(matchesQuery(study, 'nonexistent'), false);
});

test('matchesQuery treats an empty query as matching everything', () => {
  assert.equal(matchesQuery({ id: 'SP-1000', view: 'Standing lateral' }, ''), true);
});

// `pt` and `dx` exist only on the nine compiled-in demo records. On a real study the patient
// and the diagnosis arrive as imported clinical values, and the box that offers to search a
// diagnosis has to find one.
test('matchesQuery finds a real study by an imported clinical value', () => {
  const study = {
    id: 'SP-1004', view: 'Standing lateral',
    clinical: { Age: '58', Diagnosis: 'Adult degenerative scoliosis', 'Treatment plan': 'L3-S1 fusion' },
  };
  assert.equal(matchesQuery(study, 'scoliosis'), true);
  assert.equal(matchesQuery(study, 'DEGENERATIVE'), true);
  assert.equal(matchesQuery(study, 'fusion'), true);
  assert.equal(matchesQuery(study, '58'), true);
  assert.equal(matchesQuery(study, 'spondylolisthesis'), false);
});

test('matchesQuery tolerates a record with no clinical object and a non-string clinical value', () => {
  // No clinical object at all (a demo record, or a store written before plan 06).
  assert.equal(matchesQuery({ id: 'SP-1000', view: 'Standing lateral' }, 'sp-1000'), true);
  assert.equal(matchesQuery({ id: 'SP-1000', view: 'Standing lateral' }, 'scoliosis'), false);
  // An empty one, and one holding values that are not strings: the string filter keeps the
  // join from throwing, so a hand-edited store cannot break the search box.
  assert.equal(matchesQuery({ id: 'SP-1001', view: 'Standing lateral', clinical: {} }, 'sp-1001'), true);
  const odd = { id: 'SP-1002', view: 'Standing lateral', clinical: { Age: 58, Notes: null, ODI: { v: 1 } } };
  assert.equal(matchesQuery(odd, 'sp-1002'), true);
  assert.equal(matchesQuery(odd, '58'), false);
});

test('newStudy builds an unsegmented real study with nulls, never zeros', () => {
  const study = newStudy({ id: 'SP-1000', fileName: 'film.dcm', filePath: 'C:/films/film.dcm' });
  assert.equal(study.id, 'SP-1000');
  assert.equal(study.source, 'real');
  assert.equal(study.fileName, 'film.dcm');
  assert.equal(study.filePath, 'C:/films/film.dcm');
  assert.equal(study.view, 'Standing lateral');
  assert.equal(study.thumbnail, null);
  assert.equal(study.measurements, null);
  assert.equal(study.geometry, null);
  assert.equal(study.qc, null);
  assert.deepEqual(study.clinical, {});
  assert.ok(!Number.isNaN(new Date(study.addedAt).getTime()));
});

test('newStudy stores a missing path as null', () => {
  assert.equal(newStudy({ id: 'SP-1001', fileName: 'a.png', filePath: undefined }).filePath, null);
});

test('newStudy carries the three study fields as null', () => {
  const study = newStudy({ id: 'SP-1000', fileName: 'film.dcm', filePath: 'C:/films/film.dcm' });
  assert.equal(study.subjectId, null);
  assert.equal(study.timepoint, null);
  assert.equal(study.filmDate, null);
  assert.ok('subjectId' in study && 'timepoint' in study && 'filmDate' in study);
  assert.equal(study.reviewedAt, null);
  assert.ok('reviewedAt' in study);
  assert.equal(study.note, null);
  assert.ok('note' in study);
});

// The picker and a drop go through this, so a film named to the §8.1 convention reads its fields
// however it enters the library (user decision 2026-09-11).
test('studyFromFile seeds a picked or dropped film from its own name, the way a workspace load does', () => {
  const study = studyFromFile({ id: 'SP-1000', fileName: 'sub225_post-op_3-22-2024_femoral heads.jpg', filePath: 'C:/films/sub225_post-op_3-22-2024_femoral heads.jpg' });
  assert.equal(study.id, 'SP-1000');
  assert.equal(study.filePath, 'C:/films/sub225_post-op_3-22-2024_femoral heads.jpg');
  assert.equal(study.workspaceFolder, null);
  assert.equal(study.name, 'sub225_post-op_3-22-2024_femoral heads');
  assert.equal(study.subjectId, 'sub225');
  assert.equal(study.timepoint, 'Post-op');
  assert.equal(study.filmDate, '2024-03-22');
  assert.equal(study.view, 'Standing lateral');
  assert.equal(study.note, 'femoral heads');
  assert.equal(study.measurements, null);
  // A drop the OS gave no path for reads the name alone.
  const dropped = studyFromFile({ id: 'SP-1001', fileName: 'S001_preop_flexion.png', filePath: null });
  assert.equal(dropped.filePath, null);
  assert.deepEqual([dropped.subjectId, dropped.timepoint, dropped.filmDate, dropped.view, dropped.note], ['S001', 'Pre-op', null, 'Flexion lateral', null]);
  // A name with nothing to read is all subject, as the §8.1 table's last rows say.
  const plain = studyFromFile({ id: 'SP-1002', fileName: 'IMG_0001.png', filePath: null });
  assert.deepEqual([plain.subjectId, plain.timepoint, plain.filmDate, plain.view, plain.note], ['IMG_0001', null, null, 'Standing lateral', null]);
});

test('matchesQuery finds a study by its note', () => {
  const study = { id: 'SP-1000', view: 'Standing lateral', subjectId: 'S001', timepoint: 'Pre-op', filmDate: null, note: 'femoral heads', clinical: {} };
  assert.equal(matchesQuery(study, 'femoral'), true);
  assert.equal(matchesQuery(study, 'hips'), false);
});

// The Parameters grid shows all three, and the search box applies to the grid: a visible column
// you cannot search reads as broken.
test('matchesQuery finds a study by its subject, timepoint or film date', () => {
  const study = { id: 'SP-1000', view: 'Standing lateral', subjectId: 'S001', timepoint: 'Pre-op', filmDate: '2025-03-02', clinical: {} };
  assert.equal(matchesQuery(study, 's001'), true);
  assert.equal(matchesQuery(study, 'pre-op'), true);
  assert.equal(matchesQuery(study, '2025-03'), true);
  assert.equal(matchesQuery(study, 'post-op'), false);
  // Null fields on an older record never throw and never match.
  assert.equal(matchesQuery({ id: 'SP-1001', view: 'Standing lateral', subjectId: null, timepoint: null, filmDate: null }, 'null'), false);
});
