import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUNDLE_SCHEMA, bundleFolderName, studyFolderName, localFilmHash, planExport, exportMessage,
} from '../renderer/data/bundle.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

test('BUNDLE_SCHEMA names the manifest', () => {
  assert.equal(BUNDLE_SCHEMA, 'spinecontour.bundle/1');
});

// ---------- bundleFolderName ----------

test('bundleFolderName is spine-contour-export-<date>-<HHMM> in local time with -2, -3 on a case-insensitive clash', () => {
  const now = new Date(2026, 9, 15, 14, 32);
  assert.equal(bundleFolderName(now, []), 'spine-contour-export-2026-10-15-1432');
  assert.equal(bundleFolderName(now), 'spine-contour-export-2026-10-15-1432', 'taken is optional');
  assert.equal(bundleFolderName(now, ['SPINE-CONTOUR-EXPORT-2026-10-15-1432']), 'spine-contour-export-2026-10-15-1432-2');
  assert.equal(
    bundleFolderName(now, ['SPINE-CONTOUR-EXPORT-2026-10-15-1432', 'spine-contour-export-2026-10-15-1432-2']),
    'spine-contour-export-2026-10-15-1432-3',
  );
  assert.equal(bundleFolderName(now, new Set(['spine-contour-export-2026-10-15-1432'])), 'spine-contour-export-2026-10-15-1432-2', 'any iterable');
  assert.equal(bundleFolderName(now, ['spine-contour-export-2026-10-15-1432-2']), 'spine-contour-export-2026-10-15-1432', 'a gap is not filled out of order');
  assert.equal(bundleFolderName(now, ['other-folder']), 'spine-contour-export-2026-10-15-1432');
});

test('bundleFolderName pads the month, day, hour and minute', () => {
  assert.equal(bundleFolderName(new Date(2026, 0, 5, 3, 7), []), 'spine-contour-export-2026-01-05-0307');
  assert.equal(bundleFolderName(new Date(2026, 11, 31, 23, 59), []), 'spine-contour-export-2026-12-31-2359');
  assert.equal(bundleFolderName(new Date(2026, 5, 1, 0, 0), []), 'spine-contour-export-2026-06-01-0000');
});

// ---------- studyFolderName ----------

test('studyFolderName uses the safe stem and suffixes clashes', () => {
  assert.equal(studyFolderName('film', []), 'film');
  assert.equal(studyFolderName('film'), 'film', 'taken is optional');
  assert.equal(studyFolderName('a:b', []), 'a_b');
  assert.equal(studyFolderName('a:b', ['A_B']), 'a_b-2', 'the clash check runs on the safe stem, ignoring case');
  assert.equal(studyFolderName('a:b', ['A_B', 'a_b-2']), 'a_b-3');
  assert.equal(studyFolderName('Film', ['film']), 'Film-2');
  assert.equal(studyFolderName('con', []), 'con_', 'a Windows device name takes a _');
  assert.equal(studyFolderName('', []), 'film', 'an empty stem is film');
  assert.equal(studyFolderName('film', new Set(['film'])), 'film-2', 'any iterable');
});

// ---------- localFilmHash ----------

test('localFilmHash prefers the calibration digest, then the geometry digest, else null', () => {
  assert.equal(localFilmHash({ calibration: { source_sha256: HASH_A }, geometry: { source_sha256: HASH_B } }), HASH_A);
  assert.equal(localFilmHash({ calibration: null, geometry: { source_sha256: HASH_B } }), HASH_B);
  assert.equal(localFilmHash({ calibration: {}, geometry: { source_sha256: HASH_B } }), HASH_B);
  assert.equal(localFilmHash({ geometry: { source_sha256: HASH_B } }), HASH_B);
  assert.equal(localFilmHash({ calibration: { source_sha256: HASH_A } }), HASH_A);
  assert.equal(localFilmHash({ calibration: null, geometry: null }), null);
  assert.equal(localFilmHash({}), null);
  assert.equal(localFilmHash(null), null);
  assert.equal(localFilmHash(undefined), null);
});

test('localFilmHash returns only a 64-hex string', () => {
  assert.equal(localFilmHash({ calibration: { source_sha256: 'abc' } }), null, 'too short');
  assert.equal(localFilmHash({ calibration: { source_sha256: 'g'.repeat(64) } }), null, 'not hex');
  assert.equal(localFilmHash({ calibration: { source_sha256: HASH_A + 'a' } }), null, 'too long');
  assert.equal(localFilmHash({ calibration: { source_sha256: 12 } }), null, 'not a string');
  assert.equal(localFilmHash({ calibration: { source_sha256: 'A'.repeat(64) } }), null, 'the backend writes lower case');
  assert.equal(
    localFilmHash({ calibration: { source_sha256: 'nope' }, geometry: { source_sha256: HASH_B } }), HASH_B,
    'a malformed calibration digest does not hide a good geometry digest',
  );
});

// ---------- planExport ----------

const real = (over = {}) => ({
  id: 'SP-1001', source: 'real', fileName: 'film.png', filePath: 'C:\\x\\film.png', labelFile: null,
  calibration: null, geometry: null, ...over,
});

test('planExport drops demo studies, clears filePath on the study copy, keeps the source path on the entry, and names folders without clashes', () => {
  const first = real({
    id: 'SP-1001', labelFile: 'film.label.json', calibration: { source_sha256: HASH_A, pixel_spacing_mm: 0.2 },
    geometry: { source_sha256: HASH_B }, subjectId: 'S1', labelComment: 'a comment',
  });
  const demo = { id: 'SP-0001', source: 'demo', fileName: 'demo.png', filePath: null };
  const second = real({ id: 'SP-1002', filePath: 'C:\\y\\film.png' });
  const studies = [first, demo, second];
  const snapshot = structuredClone(studies);

  const plan = planExport(studies, new Date(2026, 9, 15, 14, 32), []);

  assert.equal(plan.name, 'spine-contour-export-2026-10-15-1432');
  assert.equal(plan.entries.length, 2, 'the demo study is dropped');
  assert.deepEqual(plan.entries.map(entry => entry.dir), ['film', 'film-2'], 'same-named films get distinct folders, in the given order');
  assert.deepEqual(plan.entries.map(entry => entry.sourceId), ['SP-1001', 'SP-1002']);
  assert.deepEqual(plan.entries.map(entry => entry.fileName), ['film.png', 'film.png']);

  const [a, b] = plan.entries;
  assert.equal(a.study.filePath, null, 'the study copy carries no path');
  assert.equal(a.filePath, 'C:\\x\\film.png', 'the entry keeps the path to read the film from');
  assert.equal(b.study.filePath, null);
  assert.equal(b.filePath, 'C:\\y\\film.png');
  assert.equal(a.labelFile, 'film.label.json');
  assert.equal(b.labelFile, null);
  assert.equal(a.calibrationDigest, HASH_A);
  assert.equal(b.calibrationDigest, null);
  assert.equal(a.study.subjectId, 'S1', 'every other field is as given');
  assert.equal(a.study.labelComment, 'a comment');
  assert.equal(a.study.id, 'SP-1001');
  assert.notEqual(a.study, first, 'the entry holds a copy');

  assert.deepEqual(studies, snapshot, 'the input records are not mutated');
  assert.equal(first.filePath, 'C:\\x\\film.png');
});

test('planExport names the bundle folder around the names already taken, and an empty library plans nothing', () => {
  const now = new Date(2026, 9, 15, 14, 32);
  assert.equal(planExport([real()], now, ['spine-contour-export-2026-10-15-1432']).name, 'spine-contour-export-2026-10-15-1432-2');
  assert.equal(planExport([real()], now).name, 'spine-contour-export-2026-10-15-1432', 'taken is optional');
  const none = planExport([{ id: 'SP-0001', source: 'demo', fileName: 'd.png' }], now, []);
  assert.deepEqual(none.entries, []);
  assert.deepEqual(planExport([], now, []).entries, []);
  assert.deepEqual(planExport(undefined, now, []).entries, []);
});

test('planExport takes the folder name from the film file name, made safe', () => {
  const plan = planExport([
    real({ id: 'SP-1001', fileName: 'pre:op.v2.png' }),
    real({ id: 'SP-1002', fileName: 'PRE_OP.V2.png' }),
    real({ id: 'SP-1003', fileName: 'CON.png' }),
  ], new Date(2026, 9, 15, 14, 32), []);
  assert.deepEqual(plan.entries.map(entry => entry.dir), ['pre_op.v2', 'PRE_OP.V2-2', 'CON_']);
});

// ---------- exportMessage ----------

test('exportMessage names the count and path, then the missing-film and not-read clauses only when non-zero', () => {
  assert.equal(
    exportMessage({ path: 'P', written: 12, filmsMissing: [], notRead: [] }),
    'Exported 12 studies to P',
  );
  assert.equal(
    exportMessage({ path: 'P', written: 12, filmsMissing: ['a.png', 'b.png'], notRead: ['SP-1003 sidecar'] }),
    'Exported 12 studies to P \u00b7 2 films were not found and were left out (a.png, b.png) \u00b7 1 sidecar could not be read (SP-1003 sidecar)',
  );
});

test('exportMessage uses the singular for one study, one film and one sidecar, and the plural otherwise', () => {
  assert.equal(exportMessage({ path: 'P', written: 1, filmsMissing: [], notRead: [] }), 'Exported 1 study to P');
  assert.equal(exportMessage({ path: 'P', written: 0, filmsMissing: [], notRead: [] }), 'Exported 0 studies to P');
  assert.equal(
    exportMessage({ path: 'P', written: 3, filmsMissing: ['a.png'], notRead: [] }),
    'Exported 3 studies to P \u00b7 1 film was not found and was left out (a.png)',
  );
  assert.equal(
    exportMessage({ path: 'P', written: 3, filmsMissing: [], notRead: ['x', 'y'] }),
    'Exported 3 studies to P \u00b7 2 sidecars could not be read (x, y)',
  );
});

test('exportMessage reads an absent list as empty', () => {
  assert.equal(exportMessage({ path: 'P', written: 2 }), 'Exported 2 studies to P');
});
