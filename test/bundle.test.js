import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import {
  BUNDLE_SCHEMA, bundleFolderName, studyFolderName, localFilmHash, planExport, exportMessage,
  planImport, applyImport, importPromptText, importMessage, nothingToImportMessage,
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

test('studyFolderName drops trailing dots and spaces, which Windows cannot keep, and falls back to film (S10)', () => {
  assert.equal(studyFolderName('film.', []), 'film');
  assert.equal(studyFolderName('film. .', []), 'film');
  assert.equal(studyFolderName('film  ', []), 'film');
  assert.equal(studyFolderName('a b.v2. ', []), 'a b.v2', 'inner dots and spaces stay');
  assert.equal(studyFolderName('. ', []), 'film', 'nothing left after the trim');
  assert.equal(studyFolderName('...', []), 'film');
  assert.equal(studyFolderName('   ', []), 'film');
  assert.equal(studyFolderName('film.', ['film']), 'film-2', 'the clash check runs on the trimmed name');
  assert.equal(studyFolderName('con.', []), 'con_', 'a device name is still made safe');
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

test('planExport never names a study folder manifest.json or its temp file, ignoring case (ruling S10, Task 2 review)', () => {
  const plan = planExport([
    real({ id: 'SP-1001', fileName: 'manifest.json.png' }),
    real({ id: 'SP-1002', fileName: 'MANIFEST.JSON.png' }),
    real({ id: 'SP-1003', fileName: 'manifest.json.tmp.png' }),
    real({ id: 'SP-1004', fileName: 'Manifest.Json.Tmp.png' }),
    real({ id: 'SP-1005', fileName: 'manifest.png' }),
  ], new Date(2026, 9, 15, 14, 32), []);
  assert.deepEqual(plan.entries.map(entry => entry.dir),
    ['manifest.json-2', 'MANIFEST.JSON-3', 'manifest.json.tmp-2', 'Manifest.Json.Tmp-3', 'manifest']);
});

test('planExport settles clashes against every earlier folder, case-insensitively, without filling gaps out of order', () => {
  const plan = planExport([
    real({ id: 'SP-1001', fileName: 'film-2.png' }),
    real({ id: 'SP-1002', fileName: 'film.png' }),
    real({ id: 'SP-1003', fileName: 'FILM.png' }),
    real({ id: 'SP-1004', fileName: 'film.dcm' }),
    real({ id: 'SP-1005', fileName: 'Film-3.png' }),
  ], new Date(2026, 9, 15, 14, 32), []);
  assert.deepEqual(plan.entries.map(entry => entry.dir), ['film-2', 'film', 'FILM-3', 'film-4', 'Film-3-2']);
});

test('planExport writes a study with an empty label name as no label and one with no file name under the folder film', () => {
  const plan = planExport([
    real({ id: 'SP-1001', fileName: 'other.png', labelFile: '' }),
    real({ id: 'SP-1002', fileName: undefined }),
    real({ id: 'SP-1003', fileName: '' }),
  ], new Date(2026, 9, 15, 14, 32), []);
  assert.equal(plan.entries[0].labelFile, null, 'an empty name is no name');
  assert.deepEqual(plan.entries.map(entry => entry.dir), ['other', 'film', 'film-2']);
  assert.equal(plan.entries[1].fileName, undefined, 'the entry still says what the study said');
});

test('planExport passes a calibration digest only when it is 64 lower-case hex, so one damaged digest never blocks an export (S13)', () => {
  const digestOf = source_sha256 => planExport([real({ calibration: { source_sha256 } })], new Date(2026, 9, 15, 14, 32), [])
    .entries[0].calibrationDigest;
  assert.equal(digestOf(HASH_A), HASH_A);
  assert.equal(digestOf('abc'), null, 'too short');
  assert.equal(digestOf('A'.repeat(64)), null, 'upper case');
  assert.equal(digestOf('g'.repeat(64)), null, 'not hex');
  assert.equal(digestOf(HASH_A + 'a'), null, 'too long');
  assert.equal(digestOf(12), null, 'not a string');
  assert.equal(digestOf(undefined), null, 'absent');
  assert.equal(planExport([real({ calibration: null })], new Date(2026, 9, 15, 14, 32), []).entries[0].calibrationDigest, null);
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

// ---------- planImport ----------

const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);
const HASH_E = 'e'.repeat(64);
const IMAGE_1 = '1'.repeat(64);
const IMAGE_2 = '2'.repeat(64);
const IMAGE_3 = '3'.repeat(64);
const NOW = new Date(2026, 9, 15, 14, 32);
const ALREADY = 'already in the library';
const day = (d, hour = 10) => `2026-10-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;

// A study.json as readBundle parses it: the minimum validate accepts, so the rest takes its defaults.
const bundledStudy = (over = {}) => ({
  id: 'SP-2000', source: 'real', filePath: null, fileName: 'film.png', addedAt: day(1), view: 'Standing lateral', ...over,
});
const labelRecord = (saved_at, sha256 = IMAGE_1, comment = null) => ({ saved_at, image: { sha256 }, comment });

// One readBundle entry, shaped as bundle-io.js builds it. `rawStudy` replaces the whole study.json (null, text, ...).
function entryFor(dir, opts = {}) {
  const {
    fileName = `${dir}.png`, film = true, hash = film ? HASH_A : null, record = null, prediction = false,
    calibration = false, study = {}, problems = [],
  } = opts;
  return {
    dir,
    manifest: {
      dir, source_id: 'SP-2000', file_name: fileName, film: film ? `film/${fileName}` : null, film_sha256: hash,
      prediction: prediction ? 'prediction.json' : null, label: record ? `${dir}.label.json` : null,
      calibration: calibration ? 'calibration.json' : null,
    },
    study: 'rawStudy' in opts ? opts.rawStudy : bundledStudy({ fileName, labelFile: record ? 'original.label.json' : null, ...study }),
    record,
    has: { prediction, calibration, film },
    filmPath: film ? `C:\\bundle\\${dir}\\film\\${fileName}` : null,
    problems,
  };
}
const bundleOf = (...entries) => ({
  manifest: { schema: BUNDLE_SCHEMA, app_version: '1.2.0', exported_at: day(15), studies: entries.map(entry => entry.manifest) },
  entries,
});

// A normalized local study (every field validate would give it), so a patch shows exactly which fields it touched.
const local = (id, over = {}) => ({
  id, source: 'real', fileName: `${id}.png`, filePath: `C:\\films\\${id}.png`, addedAt: day(1), view: 'Standing lateral',
  region: 'lumbar', anteriorSide: null, predictionId: null, processingError: null, processingErrorAt: null,
  name: null, workspaceFolder: null, subjectId: null, timepoint: null, filmDate: null, note: null, labelComment: null,
  labelFile: null, reviewedAt: null, thumbnail: null, measurements: null, geometry: null, qc: null, calibration: null,
  clinical: {}, ...over,
});

function planOf(entries, over = {}) {
  return planImport({
    bundle: bundleOf(...entries), studies: [], localHashes: {}, localRecords: {}, editing: new Set(), now: NOW, ...over,
  });
}

// One local study with its film hash and (maybe) its label record, as the screen would read them.
const withLocal = (id, hash, record, over = {}) => ({
  studies: [local(id, over)], localHashes: { [id]: hash }, localRecords: { [id]: record },
});
const localRecord = (saved_at, image_sha256 = IMAGE_1) => ({ saved_at, image_sha256 });
// A calibration reference made on the film with this digest (the smallest one normalizeCalibration keeps).
const calibrationOf = source_sha256 => ({
  version: 1, coordinate_space: 'original_image', source_sha256, width: 100, height: 100,
  status: 'not_found', candidates: [], selected_index: null,
});

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

test('planImport: an entry whose film matches no local study is added with the next id, a fresh label name and its film path', () => {
  const entry = entryFor('a', { hash: HASH_A, record: labelRecord(day(10)) });
  const plan = planOf([entry], { studies: [local('SP-1004')] });

  assert.deepEqual(Object.keys(plan).sort(), ['actions', 'add', 'skip', 'update']);
  assert.equal(plan.add.length, 1);
  assert.deepEqual(plan.update, []);
  assert.deepEqual(plan.skip, []);
  const [item] = plan.add;
  assert.equal(item.id, 'SP-1005');
  assert.equal(item.labelFile, 'a.label.json', 'the stem of the study\'s file name, made into a label name');
  assert.equal(item.entry.dir, 'a');
  assert.equal(item.entry.filmPath, 'C:\\bundle\\a\\film\\a.png');
  assert.equal(item.entry.record, entry.record);
  assert.equal(item.entry.study.region, 'lumbar', 'the entry\'s study is the normalized one (S7): validate filled its defaults');
  assert.equal(item.entry.study.labelComment, null);
  assert.notEqual(item.entry.study, entry.study);
  assert.equal(entry.study.region, undefined, 'the entry in the bundle keeps its raw study');
  assert.equal(plan.actions.length, 1);
});

test('planImport: an added entry with no record has no label file and no label action', () => {
  const plan = planOf([entryFor('bare', { hash: HASH_A, study: { labelFile: 'was-there.label.json' } })]);
  assert.equal(plan.add[0].labelFile, null);
  assert.equal(plan.actions[0].label, null);
});

test('a malformed study.json is skipped and the others import (Review Focus 2)', () => {
  const entries = [
    entryFor('a', { hash: HASH_A }),
    entryFor('gone', { fileName: 'gone.png', rawStudy: null, problems: ['study.json unreadable'] }),
    entryFor('b', { hash: HASH_B }),
    entryFor('demo', { rawStudy: bundledStudy({ fileName: 'demo.png', source: 'demo' }) }),
    entryFor('noid', { rawStudy: bundledStudy({ fileName: 'noid.png', id: undefined }) }),
    entryFor('noname', { fileName: 'row-name.png', rawStudy: bundledStudy({ fileName: undefined }) }),
    entryFor('text', { fileName: 'text.png', rawStudy: 'not an object' }),
    entryFor('flagged', { fileName: 'flagged.png', problems: ['label record unreadable'] }),
    { ...entryFor('rowdir', { rawStudy: null, problems: ['unsafe path'] }), manifest: { dir: 'rowdir' } },
    { ...entryFor('nothing', { rawStudy: null, problems: ['unsafe path'] }), manifest: null, dir: null },
  ];
  const plan = planOf(entries);

  assert.deepEqual(plan.add.map(item => [item.id, item.entry.dir]), [['SP-1000', 'a'], ['SP-1001', 'b']]);
  assert.deepEqual(plan.update, []);
  assert.deepEqual(plan.skip, [
    { fileName: 'gone.png', reason: 'malformed' },
    { fileName: 'demo.png', reason: 'malformed' },
    { fileName: 'noid.png', reason: 'malformed' },
    { fileName: 'row-name.png', reason: 'malformed' },
    { fileName: 'text.png', reason: 'malformed' },
    { fileName: 'flagged.png', reason: 'malformed' },
    { fileName: 'rowdir', reason: 'malformed' },
    { fileName: '9', reason: 'malformed' },
  ], 'named by the study, else the row\'s file name, else its folder, else its place in the manifest');
  assert.equal(plan.actions.length, 2);
});

test('an entry with problems is never trusted, even when its study.json would validate', () => {
  const trusted = entryFor('ok', { hash: HASH_A });
  const flagged = { ...entryFor('ok', { hash: HASH_A }), problems: ['label record unreadable'] };
  assert.equal(planOf([trusted]).add.length, 1);
  const plan = planOf([flagged]);
  assert.equal(plan.add.length, 0);
  assert.deepEqual(plan.skip, [{ fileName: 'ok.png', reason: 'malformed' }]);
});

test('matching is by film hash, never by file name alone', () => {
  const entry = entryFor('film', { fileName: 'film.png', hash: HASH_A });
  const library = [local('SP-1000', { fileName: 'film.png' })];
  const added = over => planOf([entry], { studies: library, ...over });

  assert.equal(added({ localHashes: { 'SP-1000': HASH_B } }).add.length, 1, 'same name, different hash');
  assert.equal(added({ localHashes: { 'SP-1000': null } }).add.length, 1, 'same name, no local hash: null never equals the bundle\'s');
  assert.equal(added({ localHashes: {} }).add.length, 1, 'same name, hash not read');
  assert.equal(added({ localHashes: { 'SP-1000': HASH_A.toUpperCase() } }).add.length, 1, 'only lower-case hex is a digest');

  const renamed = planOf([entry], { studies: [local('SP-1000', { fileName: 'other.png' })], localHashes: { 'SP-1000': HASH_A } });
  assert.equal(renamed.add.length, 0, 'a different name with the same hash is the same film');
  assert.deepEqual(renamed.skip, [{ fileName: 'film.png', reason: ALREADY }]);

  const second = planOf([entry], {
    studies: [local('SP-1000'), local('SP-1001')], localHashes: { 'SP-1000': HASH_B, 'SP-1001': HASH_A },
    localRecords: { 'SP-1001': localRecord(day(10)) },
  });
  assert.equal(second.add.length, 0);
  assert.deepEqual(second.skip.map(skip => skip.reason), [ALREADY], 'the library is searched, not only its first study');
});

test('a hash that is not 64 lower-case hex matches nothing, on either side', () => {
  const library = [local('SP-1000')];
  assert.equal(planOf([entryFor('x', { hash: 'abc' })], { studies: library, localHashes: { 'SP-1000': 'abc' } }).add.length, 1);
  assert.equal(planOf([entryFor('x', { hash: undefined })], { studies: library, localHashes: { 'SP-1000': undefined } }).add.length, 1);
  assert.equal(planOf([entryFor('x', { hash: 12 })], { studies: library, localHashes: { 'SP-1000': 12 } }).add.length, 1);
});

test('a demo study is never matched, and junk in the local list is ignored', () => {
  const demo = { id: 'SP-0030', source: 'demo', fileName: 'film.png' };
  const entry = entryFor('film', { hash: HASH_A });
  const plan = planOf([entry], { studies: [demo], localHashes: { 'SP-0030': HASH_A } });
  assert.equal(plan.add.length, 1);
  assert.equal(plan.add[0].id, 'SP-1000', 'a demo id does not move nextId');
  assert.equal(planOf([entry], { studies: [null, undefined], localHashes: {} }).add.length, 1);
});

test('the no-film fallback matches by the records\' image.sha256 among same-named local studies', () => {
  const entry = entryFor('film', { fileName: 'film.png', film: false, record: labelRecord(day(12), IMAGE_1) });
  const studies = [
    local('SP-1000', { fileName: 'film.png' }),
    local('SP-1001', { fileName: 'film.png' }),
    local('SP-1002', { fileName: 'other.png' }),
  ];
  const localRecords = {
    'SP-1000': localRecord(day(10), IMAGE_2), 'SP-1001': localRecord(day(10), IMAGE_1), 'SP-1002': localRecord(day(10), IMAGE_1),
  };
  const plan = planOf([entry], { studies, localRecords });
  assert.deepEqual(plan.update.map(item => item.id), ['SP-1001'], 'same name AND same image hash; the others are not it');
  assert.equal(plan.add.length, 0);

  const noName = planOf([entry], { studies: [studies[2]], localRecords });
  assert.equal(noName.add.length, 1, 'the same image hash under another file name is not enough');
  const noHash = planOf([entry], { studies: [studies[0]], localRecords });
  assert.equal(noHash.add.length, 1, 'the same name with another image hash is not enough');
  const noRead = planOf([entry], { studies: [studies[1]], localRecords: {} });
  assert.equal(noRead.add.length, 1, 'a local study whose record was not read matches nothing');
  const noRecord = planOf([{ ...entry, record: null }], { studies: [studies[1]], localRecords });
  assert.equal(noRecord.add.length, 1, 'an entry with no film, no result, no calibration and no record has nothing to match on (file name alone never does)');
  const noImage = planOf([{ ...entry, record: { saved_at: day(12) } }], { studies: [studies[1]], localRecords });
  assert.equal(noImage.add.length, 1, 'a record without an image hash matches nothing');
  const badImage = planOf([{ ...entry, record: labelRecord(day(12), 'abc') }], {
    studies: [studies[1]], localRecords: { 'SP-1001': localRecord(day(10), 'abc') },
  });
  assert.equal(badImage.add.length, 1, 'neither side\'s image hash counts unless it is 64 hex');
});

test('the record fallback is only for an entry with no film hash', () => {
  const entry = entryFor('film', { fileName: 'film.png', hash: HASH_A, record: labelRecord(day(12), IMAGE_1) });
  const plan = planOf([entry], {
    studies: [local('SP-1000', { fileName: 'film.png' })], localHashes: { 'SP-1000': HASH_B },
    localRecords: { 'SP-1000': localRecord(day(10), IMAGE_1) },
  });
  assert.equal(plan.add.length, 1, 'a bundle film that hashes differently is a different film, whatever its record says');
});

test('an entry with no film hash matches by the digest its result or calibration was made on (S20)', () => {
  const library = (fileName, hash) => ({ studies: [local('SP-1000', { fileName })], localHashes: { 'SP-1000': hash } });
  const calibrated = entryFor('film', { fileName: 'film.png', film: false, study: { calibration: calibrationOf(HASH_D) } });

  const found = planOf([calibrated], library('renamed.png', HASH_D));
  assert.equal(found.add.length, 0, 'matched with no film hash and a different file name: the study\'s own digest is the film\'s');
  assert.deepEqual(found.skip, [{ fileName: 'film.png', reason: ALREADY }]);

  const newer = planOf([{ ...calibrated, record: labelRecord(day(12)) }], library('film.png', HASH_D));
  assert.deepEqual(newer.update.map(item => item.id), ['SP-1000'], 'and then the table applies as for any match');

  // The geometry's digest stands in the same way (a result with its measurements; the smallest valid one).
  const placed = entryFor('film', {
    fileName: 'film.png', film: false,
    study: {
      measurements: { PI: null, PT: null, SS: null, LL: { 'L1-S1': null } },
      geometry: {
        vertebrae: {}, s1_superior: null, l1_center: null, hip_midpoint: null, femoral_circles: [],
        manually_cleared: true, source_sha256: HASH_E,
      },
    },
  });
  assert.equal(planOf([placed], library('film.png', HASH_E)).add.length, 0, 'a geometry digest matches too');

  assert.equal(planOf([calibrated], library('film.png', HASH_E)).add.length, 1, 'another film\'s digest is not it');
  assert.equal(planOf([calibrated], library('film.png', null)).add.length, 1, 'a local study with no digest is not it');
  assert.equal(planOf([calibrated], { studies: [local('SP-1000')], localHashes: {} }).add.length, 1, 'nor one whose film was not hashed');

  const withFilm = entryFor('film', { fileName: 'film.png', hash: HASH_B, study: { calibration: calibrationOf(HASH_D) } });
  assert.equal(planOf([withFilm], library('film.png', HASH_D)).add.length, 1, 'with a film hash in the manifest, only that hash counts');

  const viaRecord = entryFor('film', {
    fileName: 'film.png', film: false, record: labelRecord(day(12), IMAGE_1), study: { calibration: calibrationOf(HASH_D) },
  });
  const fallback = planOf([viaRecord], {
    studies: [local('SP-1000', { fileName: 'film.png' })], localHashes: { 'SP-1000': null },
    localRecords: { 'SP-1000': localRecord(day(10), IMAGE_1) },
  });
  assert.deepEqual(fallback.update.map(item => item.id), ['SP-1000'], 'the record\'s image hash is still tried when the result\'s digest finds nothing');
});

test('a match with a bundle record and no local record updates', () => {
  const entry = entryFor('film', { hash: HASH_A, record: labelRecord(day(10)) });
  for (const none of [null, undefined]) {
    const plan = planOf([entry], withLocal('SP-1000', HASH_A, none));
    assert.deepEqual(plan.update.map(item => item.id), ['SP-1000']);
    assert.deepEqual(plan.add, []);
    assert.deepEqual(plan.skip, []);
  }
  const unparseable = planOf([entryFor('film', { hash: HASH_A, record: labelRecord('garbage') })], withLocal('SP-1000', HASH_A, null));
  assert.equal(unparseable.update.length, 1, 'with no local record the bundle\'s time is not compared (PB8)');
});

test('newer saved_at updates; equal, older or unparseable skips; no record on either side skips (PB8)', () => {
  const cases = [
    ['newer', day(12), day(10), true],
    ['one second newer', '2026-10-10T10:00:01Z', '2026-10-10T10:00:00Z', true],
    ['equal', day(10), day(10), false],
    ['equal in another notation', '2026-10-10T10:00:00Z', '2026-10-10T10:00:00.000Z', false],
    ['older', day(9), day(10), false],
    ['bundle unparseable', 'garbage', day(10), false],
    ['local unparseable', day(12), 'garbage', false],
    ['both unparseable', 'x', 'y', false],
    ['bundle time missing', undefined, day(10), false],
    ['bundle time not a string', 12, day(10), false],
    ['local time missing', day(12), undefined, false],
  ];
  for (const [label, bundleAt, localAt, updates] of cases) {
    const plan = planOf([entryFor('film', { hash: HASH_A, record: labelRecord(bundleAt) })], withLocal('SP-1000', HASH_A, localRecord(localAt)));
    assert.equal(plan.update.length, updates ? 1 : 0, label);
    assert.deepEqual(plan.skip.map(skip => skip.reason), updates ? [] : [ALREADY], label);
    assert.equal(plan.add.length, 0, label);
  }

  const neither = planOf([entryFor('film', { hash: HASH_A })], withLocal('SP-1000', HASH_A, null));
  assert.deepEqual(neither.skip, [{ fileName: 'film.png', reason: ALREADY }], 'neither side has a record');
  assert.deepEqual(neither.update, []);
  const localOnly = planOf([entryFor('film', { hash: HASH_A })], withLocal('SP-1000', HASH_A, localRecord(day(10))));
  assert.deepEqual(localOnly.skip, [{ fileName: 'film.png', reason: ALREADY }], 'only the local study has a record: the bundle cannot improve it');
  assert.deepEqual(localOnly.update, []);
});

test('an update carries the local id, the local label name and the entry', () => {
  const entry = entryFor('film', { hash: HASH_A, record: labelRecord(day(12)) });
  const own = planOf([entry], withLocal('SP-1000', HASH_A, localRecord(day(10)), { labelFile: 'mine.label.json' }));
  assert.equal(own.update[0].id, 'SP-1000');
  assert.equal(own.update[0].labelFile, 'mine.label.json', 'the bundle\'s record is written over the local one (PB9)');
  assert.equal(own.update[0].entry.dir, 'film');
  assert.equal(own.update[0].entry.record, entry.record);
  assert.equal(own.update[0].entry.study.region, 'lumbar', 'the normalized study (S7)');

  const fresh = planOf([entry], withLocal('SP-1000', HASH_A, null, { fileName: 'scan.v2.png' }));
  assert.equal(fresh.update[0].labelFile, 'scan.v2.label.json', 'a local study with no label file takes a fresh name from its own film');
});

test('a matched study in edit mode or stashed is skipped as being edited (Review Focus 5)', () => {
  const newer = entryFor('film', { hash: HASH_A, record: labelRecord(day(12)) });
  const inEdit = planOf([newer], { ...withLocal('SP-1000', HASH_A, localRecord(day(10))), editing: new Set(['SP-1000']) });
  assert.deepEqual(inEdit.skip, [{ fileName: 'film.png', reason: 'being edited' }]);
  assert.deepEqual(inEdit.update, []);
  assert.deepEqual(inEdit.actions, []);

  const noRecord = planOf([newer], { ...withLocal('SP-1000', HASH_A, null), editing: new Set(['SP-1000']) });
  assert.deepEqual(noRecord.skip.map(skip => skip.reason), ['being edited'], 'the update the table would otherwise give');
  const older = planOf([entryFor('film', { hash: HASH_A })], { ...withLocal('SP-1000', HASH_A, null), editing: new Set(['SP-1000']) });
  assert.deepEqual(older.skip.map(skip => skip.reason), ['being edited'], 'edit mode outranks already in the library');

  const other = planOf([newer], { ...withLocal('SP-1000', HASH_A, localRecord(day(10))), editing: new Set(['SP-1001']) });
  assert.equal(other.update.length, 1, 'another study being edited changes nothing');
  const unset = planOf([newer], { ...withLocal('SP-1000', HASH_A, localRecord(day(10))), editing: undefined });
  assert.equal(unset.update.length, 1, 'no editing set is no study being edited');

  const adds = planOf([entryFor('fresh', { hash: HASH_B })], { editing: new Set(['SP-1000']) });
  assert.equal(adds.add.length, 1, 'an add has no local study to be editing');
});

test('two entries matching one local study: the later-saved wins, the other is skipped as already in the library (S18)', () => {
  const facts = record => withLocal('SP-1000', HASH_A, record);
  const entry = (dir, saved) => entryFor(dir, { hash: HASH_A, record: saved === null ? null : labelRecord(saved) });

  let plan = planOf([entry('first', day(11)), entry('second', day(13))], facts(null));
  assert.deepEqual(plan.update.map(item => item.entry.dir), ['second']);
  assert.deepEqual(plan.skip, [{ fileName: 'first.png', reason: ALREADY }]);

  plan = planOf([entry('first', day(13)), entry('second', day(11))], facts(null));
  assert.deepEqual(plan.update.map(item => item.entry.dir), ['first']);
  assert.deepEqual(plan.skip, [{ fileName: 'second.png', reason: ALREADY }]);

  plan = planOf([entry('first', 'x'), entry('second', 'y')], facts(null));
  assert.deepEqual(plan.update.map(item => item.entry.dir), ['first'], 'neither parseable: the first in manifest order');
  assert.deepEqual(plan.skip, [{ fileName: 'second.png', reason: ALREADY }]);

  plan = planOf([entry('first', 'x'), entry('second', day(11))], facts(null));
  assert.deepEqual(plan.update.map(item => item.entry.dir), ['second'], 'a parseable time outranks one that is not');

  plan = planOf([entry('first', null), entry('second', 'x')], facts(null));
  assert.deepEqual(plan.update.map(item => item.entry.dir), ['second'], 'an entry with a record outranks one without');

  plan = planOf([entry('first', day(11)), entry('second', day(9))], facts(localRecord(day(12))));
  assert.deepEqual(plan.update, [], 'both older than the local record');
  assert.deepEqual(plan.skip.map(skip => skip.reason), [ALREADY, ALREADY]);

  plan = planOf([entry('first', day(9)), entry('second', day(13)), entry('third', day(13))], facts(localRecord(day(12))));
  assert.deepEqual(plan.update.map(item => item.entry.dir), ['second'], 'equal times: the first of them');
  assert.deepEqual(plan.skip.map(skip => skip.fileName), ['first.png', 'third.png'], 'skips stay in manifest order');
});

test('two entries matching a study that is being edited are both skipped as being edited', () => {
  const entries = [
    entryFor('first', { hash: HASH_A, record: labelRecord(day(12)) }),
    entryFor('second', { hash: HASH_A, record: labelRecord(day(13)) }),
  ];
  const plan = planOf(entries, { ...withLocal('SP-1000', HASH_A, null), editing: new Set(['SP-1000']) });
  assert.deepEqual(plan.skip.map(skip => skip.reason), ['being edited', 'being edited']);
  assert.deepEqual(plan.update, []);
});

test('ids and label names are assigned in manifest order without clashing with the library or each other', () => {
  const studies = [
    local('SP-1000', { fileName: 'film.png' }),
    local('SP-1005', { labelFile: 'Film.label.json' }),
    { id: 'SP-0030', source: 'demo', fileName: 'demo.png' },
  ];
  const entries = [
    entryFor('a', { fileName: 'film.png', hash: HASH_B, record: labelRecord(day(10)) }),                  // add
    entryFor('bad', { rawStudy: bundledStudy({ fileName: 'bad.png', id: undefined }) }),                   // malformed
    entryFor('b', { fileName: 'film.png', hash: HASH_C, record: labelRecord(day(10)) }),                  // matches SP-1005, as old: skipped
    entryFor('c', { fileName: 'film.png', hash: HASH_D }),                                                 // add, no record
    entryFor('d', { fileName: 'FILM.png', hash: HASH_E, record: labelRecord(day(10)) }),                   // add
    entryFor('u1', { fileName: 'film.png', hash: HASH_A, record: labelRecord(day(12)) }),                  // update SP-1000
    entryFor('same', { fileName: 'same.png', hash: HASH_B }),                                              // matches entry a's hash only
  ];
  const plan = planOf(entries, {
    studies, localHashes: { 'SP-1000': HASH_A, 'SP-1005': HASH_C },
    localRecords: { 'SP-1000': localRecord(day(10)), 'SP-1005': localRecord(day(10)) },
  });
  assert.deepEqual(plan.skip.map(skip => [skip.fileName, skip.reason]), [['bad.png', 'malformed'], ['film.png', ALREADY]]);

  assert.deepEqual(plan.add.map(item => [item.entry.dir, item.id, item.labelFile]), [
    ['a', 'SP-1006', 'film-2.label.json'],
    ['c', 'SP-1007', null],
    ['d', 'SP-1008', 'FILM-3.label.json'],
    ['same', 'SP-1009', null],
  ], 'ids follow the manifest; a clash is settled ignoring case against the library and the names given so far');
  assert.deepEqual(plan.update.map(item => [item.id, item.labelFile]), [['SP-1000', 'film-4.label.json']],
    'an update with no label file of its own takes the next free name too');
  assert.deepEqual(plan.actions.map(action => [action.kind, action.id]), [
    ['add', 'SP-1006'], ['add', 'SP-1007'], ['add', 'SP-1008'], ['update', 'SP-1000'], ['add', 'SP-1009'],
  ], 'the action list is the manifest order too');
});

test('a skipped or malformed entry takes no id and no label name', () => {
  const plan = planOf([
    entryFor('x', { rawStudy: null, problems: ['study.json unreadable'] }),
    entryFor('y', { hash: HASH_B, record: labelRecord(day(10)) }),
  ]);
  assert.deepEqual(plan.add.map(item => [item.id, item.labelFile]), [['SP-1000', 'y.label.json']]);
});

test('actions are the placement list: adds and updates, in manifest order, in the shape placeImport takes', () => {
  const studies = [
    local('SP-1000', { predictionId: 'old-a', labelFile: 'mine.label.json' }),
    local('SP-1001', { predictionId: 'old-b' }),
    local('SP-1002'),
  ];
  const entries = [
    entryFor('full', { hash: HASH_A, record: labelRecord(day(12)), prediction: true, calibration: true }),
    entryFor('handplaced', { hash: HASH_B, record: labelRecord(day(12)) }),
    entryFor('bare', { hash: HASH_C }),
    entryFor('model', { hash: HASH_D, record: labelRecord(day(12)), prediction: true }),
    entryFor('nothingold', { hash: HASH_E, record: labelRecord(day(12)) }),
    entryFor('older', { hash: HASH_B, record: labelRecord(day(1)) }),
  ];
  const plan = planOf(entries, {
    studies,
    localHashes: { 'SP-1000': HASH_B, 'SP-1001': HASH_D, 'SP-1002': HASH_E },
    localRecords: { 'SP-1000': localRecord(day(10)) },
  });

  assert.deepEqual(plan.actions, [
    {
      kind: 'add', dir: 'full', id: 'SP-1003', prediction: 'prediction.json', deleteLocalPrediction: false,
      label: { from: 'full.label.json', to: 'full.label.json' }, calibration: 'calibration.json',
    },
    {
      kind: 'update', dir: 'handplaced', id: 'SP-1000', prediction: null, deleteLocalPrediction: true,
      label: { from: 'handplaced.label.json', to: 'mine.label.json' }, calibration: null,
    },
    { kind: 'add', dir: 'bare', id: 'SP-1004', prediction: null, deleteLocalPrediction: false, label: null, calibration: null },
    {
      kind: 'update', dir: 'model', id: 'SP-1001', prediction: 'prediction.json', deleteLocalPrediction: false,
      label: { from: 'model.label.json', to: 'SP-1001.label.json' }, calibration: null,
    },
    {
      kind: 'update', dir: 'nothingold', id: 'SP-1002', prediction: null, deleteLocalPrediction: false,
      label: { from: 'nothingold.label.json', to: 'SP-1002.label.json' }, calibration: null,
    },
  ], 'a local result with a sidecar and a bundle study with none deletes the sidecar (S8); the rest does not');
  assert.deepEqual(plan.skip, [{ fileName: 'older.png', reason: ALREADY }], 'the older entry matches the study the newer one updates');
});

test('an update deletes the local sidecar only when the bundle study names a different result, never one it merely did not bring (S21)', () => {
  const deletes = (bundlePrediction, localPrediction, hasSidecar) => {
    const entry = entryFor('film', {
      hash: HASH_A, record: labelRecord(day(12)), prediction: hasSidecar, study: { predictionId: bundlePrediction },
    });
    const plan = planOf([entry], withLocal('SP-1000', HASH_A, localRecord(day(10)), { predictionId: localPrediction }));
    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].prediction, hasSidecar ? 'prediction.json' : null);
    return plan.actions[0].deleteLocalPrediction;
  };
  assert.equal(deletes(null, 'p1', false), true, 'a hand-placed result over a model result: the model\'s sidecar goes');
  assert.equal(deletes('p2', 'p1', false), true, 'a different result the bundle did not bring');
  assert.equal(deletes('p1', 'p1', false), false,
    'the same result with no sidecar in the bundle (the exporter could not read it): the local sidecar still matches the study and stays');
  assert.equal(deletes('p1', 'p1', true), false, 'the bundle brings its sidecar: it replaces the local one');
  assert.equal(deletes('p2', 'p1', true), false, 'a sidecar in the bundle is copied over, not deleted');
  assert.equal(deletes(null, null, false), false, 'a local study with no result has no sidecar to delete');
  assert.equal(deletes('p1', null, false), false, 'nor does one whose bundle study names a result it did not bring');
});

test('planImport does not mutate what it is given and ignores now', () => {
  const entries = [
    entryFor('a', { hash: HASH_A, record: labelRecord(day(12)), prediction: true }),
    entryFor('b', { hash: HASH_B, record: labelRecord(day(12)) }),
    entryFor('bad', { rawStudy: { id: 1 } }),
  ];
  const input = deepFreeze({
    bundle: bundleOf(...entries), studies: [local('SP-1000', { labelFile: 'x.label.json', predictionId: 'p' })],
    localHashes: { 'SP-1000': HASH_A }, localRecords: { 'SP-1000': localRecord(day(10)) },
  });
  const snapshot = structuredClone(input);
  const first = planImport({ ...input, editing: new Set(), now: NOW });
  const second = planImport({ ...input, editing: new Set(), now: new Date(2030, 0, 1) });
  assert.deepEqual(input, snapshot);
  assert.deepEqual(second, first, 'now is reserved: it changes nothing');
  assert.equal(first.update.length, 1);
  assert.equal(first.add.length, 1);
});

test('planImport reads an absent bundle, library or hash map as empty', () => {
  assert.deepEqual(planImport({ bundle: { manifest: {}, entries: [] }, studies: [], localHashes: {}, localRecords: {}, editing: new Set(), now: NOW }),
    { add: [], update: [], skip: [], actions: [] });
  assert.deepEqual(planImport({ bundle: undefined }), { add: [], update: [], skip: [], actions: [] });
  const plan = planImport({ bundle: bundleOf(entryFor('a', { hash: HASH_A })) });
  assert.deepEqual(plan.add.map(item => item.id), ['SP-1000']);
});

test('the same bundle planned twice against the library it produced adds nothing (Review Focus 4)', () => {
  const library = [local('SP-1000', { fileName: 'old.png' })];
  const entries = [
    entryFor('u', { fileName: 'old.png', hash: HASH_A, record: labelRecord(day(12), IMAGE_1) }),
    entryFor('n1', { hash: HASH_B, record: labelRecord(day(11), IMAGE_2), prediction: true }),
    entryFor('n2', { hash: HASH_C }),
    entryFor('n3', { fileName: 'nofilm.png', film: false, record: labelRecord(day(9), IMAGE_3) }),
    entryFor('n4', { fileName: 'segmented.png', film: false, study: { calibration: calibrationOf(HASH_E) } }),
  ];
  const bundle = bundleOf(...entries);
  const facts = { localHashes: { 'SP-1000': HASH_A }, localRecords: { 'SP-1000': localRecord(day(10), IMAGE_1) } };

  const first = planImport({ bundle, studies: library, ...facts, editing: new Set(), now: NOW });
  assert.equal(first.add.length, 4);
  assert.equal(first.update.length, 1);
  const imported = applyImport(library, first);
  assert.equal(imported.length, 5);

  // What the screen reads back for the library the import produced: each study's film digest (its result's, else the
  // hash of the film it hashed), and each label record's times.
  const byId = new Map(imported.map(study => [study.id, study]));
  const after = { localHashes: { ...facts.localHashes }, localRecords: { ...facts.localRecords } };
  for (const item of [...first.add, ...first.update]) {
    after.localHashes[item.id] = localFilmHash(byId.get(item.id)) ?? item.entry.manifest.film_sha256;
    after.localRecords[item.id] = item.entry.record === null ? null : localRecord(item.entry.record.saved_at, item.entry.record.image.sha256);
  }
  assert.equal(after.localHashes[first.add[3].id], HASH_E, 'the film-less segmented study is known by its calibration\'s digest (S20)');
  const second = planImport({ bundle, studies: imported, ...after, editing: new Set(), now: NOW });
  assert.deepEqual(second.add, []);
  assert.deepEqual(second.update, []);
  assert.deepEqual(second.actions, []);
  assert.deepEqual(second.skip.map(skip => skip.reason), [ALREADY, ALREADY, ALREADY, ALREADY, ALREADY]);
  assert.deepEqual(applyImport(imported, second), imported);
});

// ---------- applyImport ----------

const GEOMETRY = {
  vertebrae: Object.fromEntries(['L1', 'L2', 'L3', 'L4', 'L5'].map(level => [level, {
    superior: [[0, 0], [1, 1]], inferior: [[0, 2], [1, 3]], quadrilateral: [[0, 0], [1, 0], [1, 1], [0, 1]],
  }])),
  s1_superior: [[0, 4], [1, 5]], l1_center: [2, 2], hip_midpoint: [3, 3], femoral_circles: [[10, 10, 5], [20, 20, 6]],
};
const MEASUREMENTS = { PI: 50, PT: 20, SS: 30, L1PA: null, LL: { 'L1-S1': 40 } };
const CALIBRATION = calibrationOf(HASH_A);
const UPDATED_FIELDS = [
  'view', 'region', 'anteriorSide', 'predictionId', 'processingError', 'processingErrorAt', 'measurements', 'geometry', 'qc',
  'calibration', 'thumbnail', 'reviewedAt', 'labelComment', 'labelFile',
];

function applyFixture() {
  const demo = { id: 'SP-0030', source: 'demo', fileName: 'demo.png' };
  const mine = local('SP-1000', {
    fileName: 'film.png', name: 'My name', workspaceFolder: 'C:\\ws', subjectId: 'S-1', timepoint: 'pre-op',
    filmDate: '2026-01-02', note: 'a note', clinical: { age: 40 }, predictionId: 'old-pred', labelFile: 'mine.label.json',
    labelComment: 'old comment', reviewedAt: day(2), view: 'Standing lateral',
  });
  const other = local('SP-1001', { name: 'untouched' });
  const entries = [
    entryFor('new1', { hash: HASH_B, record: labelRecord(day(11), IMAGE_2, '  from the record  '), study: { addedAt: day(5), name: 'First' } }),
    entryFor('upd', {
      fileName: 'film.png', hash: HASH_A, record: labelRecord(day(12), IMAGE_1, 'record comment'), prediction: true,
      study: {
        id: 'SP-7777', filePath: 'D:\\exporter\\film.png', addedAt: day(9), view: 'Supine lateral', region: 'lumbar',
        anteriorSide: 'left', predictionId: 'pred-new', processingError: 'boom', processingErrorAt: day(3),
        measurements: MEASUREMENTS, geometry: GEOMETRY, qc: { framing: { whole: true } }, calibration: CALIBRATION,
        thumbnail: 'data:image/png;base64,AAAA', reviewedAt: day(4), labelComment: 'from bundle',
        name: 'Bundle name', workspaceFolder: 'D:\\other', subjectId: 'B-9', timepoint: 'post-op', filmDate: '2020-05-06',
        note: 'bundle note', clinical: { age: 99 }, labelFile: 'exporter.label.json',
      },
    }),
    entryFor('new2', { hash: HASH_C, record: labelRecord(day(8), IMAGE_3, 'other'), study: { labelComment: 'study comment' } }),
    entryFor('new3', { film: false, hash: null, study: { reviewedAt: day(7) } }),
  ];
  const plan = planOf(entries, {
    studies: [demo, mine, other], localHashes: { 'SP-1000': HASH_A }, localRecords: { 'SP-1000': localRecord(day(10)) },
  });
  return { demo, mine, other, studies: [demo, mine, other], plan };
}

test('applyImport appends adds, patches updates with the §5.7 fields only, never mutates its input', () => {
  const { demo, mine, other, studies, plan } = applyFixture();
  assert.equal(plan.update.length, 1);
  assert.equal(plan.add.length, 3);
  deepFreeze(studies);
  deepFreeze(plan);
  const snapshot = structuredClone({ studies, plan });

  const result = applyImport(studies, plan);

  assert.deepEqual({ studies, plan }, snapshot, 'neither input changed');
  assert.notEqual(result, studies);
  assert.equal(result.length, 6);
  assert.equal(result[0], demo, 'an untouched study keeps its reference');
  assert.equal(result[2], other);

  const updated = result[1];
  assert.notEqual(updated, mine, 'an update is a new object');
  for (const key of ['id', 'filePath', 'addedAt', 'name', 'workspaceFolder', 'subjectId', 'timepoint', 'filmDate', 'note', 'clinical', 'source', 'fileName']) {
    assert.deepEqual(updated[key], mine[key], `${key} stays the local study's`);
  }
  assert.equal(updated.id, 'SP-1000');
  assert.equal(updated.filePath, 'C:\\films\\SP-1000.png');
  assert.equal(updated.name, 'My name');
  assert.deepEqual(updated.clinical, { age: 40 });
  assert.equal(updated.view, 'Supine lateral');
  assert.equal(updated.region, 'lumbar');
  assert.equal(updated.anteriorSide, 'left');
  assert.equal(updated.predictionId, 'pred-new');
  assert.equal(updated.processingError, 'boom');
  assert.equal(updated.processingErrorAt, day(3));
  assert.deepEqual(updated.measurements, MEASUREMENTS);
  assert.deepEqual(updated.geometry, GEOMETRY);
  assert.deepEqual(updated.qc, { framing: { whole: true } });
  assert.deepEqual(updated.calibration, CALIBRATION);
  assert.equal(updated.thumbnail, 'data:image/png;base64,AAAA');
  assert.equal(updated.reviewedAt, day(4));
  assert.equal(updated.labelComment, 'from bundle');
  assert.equal(updated.labelFile, 'mine.label.json', 'the local label name, not the exporter\'s');
  const changed = Object.keys(updated).filter(key => !isDeepStrictEqual(updated[key], mine[key]));
  assert.deepEqual(changed.filter(key => !UPDATED_FIELDS.includes(key)), [], 'nothing outside the §5.7 list changed');
  assert.deepEqual(Object.keys(updated).sort(), Object.keys(mine).sort(), 'no field added or dropped');

  const [one, two, three] = result.slice(3);
  assert.deepEqual([one.id, two.id, three.id], ['SP-1002', 'SP-1003', 'SP-1004'], 'adds follow the library, in manifest order');
  assert.equal(one.source, 'real');
  assert.equal(one.filePath, 'C:\\bundle\\new1\\film\\new1.png');
  assert.equal(one.labelFile, 'new1.label.json');
  assert.equal(one.labelComment, 'from the record', 'no copy on the study: the record\'s comment, trimmed');
  assert.equal(one.addedAt, day(5), 'addedAt is kept');
  assert.equal(one.name, 'First', 'every other field comes from the bundle');
  assert.equal(one.region, 'lumbar');
  assert.equal(two.labelComment, 'study comment', 'the study.json copy wins over the record');
  assert.equal(three.filePath, null, 'a film that was not exported leaves no path');
  assert.equal(three.labelFile, null, 'no record, no label file, whatever study.json said');
  assert.equal(three.labelComment, null);
  assert.equal(three.reviewedAt, day(7));
});

test('applyImport with placedIds applies only the actions that were placed (PB4, PB5)', () => {
  const { demo, mine, other, studies, plan } = applyFixture();

  const some = applyImport(studies, plan, ['SP-1003']);
  assert.deepEqual(some.map(study => study.id), ['SP-0030', 'SP-1000', 'SP-1001', 'SP-1003']);
  assert.equal(some[1], mine, 'an update that was not placed leaves the study as it was');

  const updateOnly = applyImport(studies, plan, new Set(['SP-1000']));
  assert.equal(updateOnly.length, 3);
  assert.notEqual(updateOnly[1], mine);
  assert.equal(updateOnly[1].view, 'Supine lateral');

  const none = applyImport(studies, plan, []);
  assert.deepEqual(none, studies);
  assert.equal(none[0], demo);
  assert.equal(none[1], mine);
  assert.equal(none[2], other);
  assert.notEqual(none, studies, 'still a new list');

  assert.equal(applyImport(studies, plan, undefined).length, 6, 'every add and update by default');
  assert.equal(applyImport(studies, plan, null).length, 6);
});

test('an update takes labelComment the way an add does: the study.json copy, else the record\'s comment (S17)', () => {
  const run = (studyComment, recordComment, localComment) => {
    const entry = entryFor('film', {
      hash: HASH_A, record: labelRecord(day(12), IMAGE_1, recordComment), study: { labelComment: studyComment },
    });
    const facts = withLocal('SP-1000', HASH_A, localRecord(day(10)), { labelComment: localComment });
    const plan = planOf([entry], facts);
    return applyImport(facts.studies, plan)[0].labelComment;
  };
  assert.equal(run('study', 'record', 'local'), 'study');
  assert.equal(run(null, 'record', 'local'), 'record');
  assert.equal(run(undefined, '  record  ', 'local'), 'record');
  assert.equal(run(null, null, 'local'), null, 'the bundle had no comment: the update takes that');
  assert.equal(run(null, '   ', 'local'), null, 'a blank comment is no comment');
  assert.equal(run(null, undefined, null), null);
});

test('applyImport of an empty plan, or one for a library that changed, applies what still applies', () => {
  const library = [local('SP-1000')];
  assert.deepEqual(applyImport(library, { add: [], update: [], skip: [], actions: [] }), library);
  assert.deepEqual(applyImport([], { add: [], update: [], skip: [], actions: [] }), []);
  const entry = entryFor('film', { hash: HASH_A, record: labelRecord(day(12)) });
  const plan = planOf([entry], withLocal('SP-1000', HASH_A, null));
  assert.deepEqual(applyImport([], plan), [], 'an update whose study is gone patches nothing');
});

// ---------- the texts ----------

test('importPromptText reads as the spec writes it', () => {
  const plan = { add: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], update: [1, 2], skip: [1, 2, 3] };
  const tail = 'The films stay in this folder, so keep it where it is.';
  assert.equal(
    importPromptText(plan, 'C:\\Users\\me\\Exports\\spine-contour-export-2026-10-15-1432'),
    `Import from spine-contour-export-2026-10-15-1432: 10 to add, 2 to update, 3 to skip. ${tail}`,
  );
  assert.equal(importPromptText(plan, '/home/me/bundles/b1/'), `Import from b1: 10 to add, 2 to update, 3 to skip. ${tail}`, 'any separator, a trailing one ignored');
  assert.equal(importPromptText({ add: [], update: [], skip: [] }, 'C:\\b'), `Import from b: 0 to add, 0 to update, 0 to skip. ${tail}`);
  assert.equal(importPromptText({ add: [1], update: [1], skip: [1] }, 'b'), `Import from b: 1 to add, 1 to update, 1 to skip. ${tail}`, 'the counts do not take a plural');
});

test('importMessage names what was imported, updated and skipped, grouping the skips by reason', () => {
  const skipped = [
    { fileName: 'a.png', reason: ALREADY },
    { fileName: 'm.png', reason: 'malformed' },
    { fileName: 'c.png', reason: 'being edited' },
    { fileName: 'b.png', reason: ALREADY },
  ];
  assert.equal(
    importMessage({ added: 10, updated: 2, skipped: skipped.filter(s => s.reason !== 'malformed'), withoutFilm: [], stoppedAt: null }),
    'Imported 10 studies, updated 2, skipped 3 (already in the library: a.png, b.png; being edited: c.png)',
  );
  assert.equal(
    importMessage({ added: 1, updated: 0, skipped, withoutFilm: [], stoppedAt: null }),
    'Imported 1 study, updated 0, skipped 4 (already in the library: a.png, b.png; being edited: c.png; malformed: m.png)',
    'the reasons keep their order whatever order the skips came in; study is singular at 1',
  );
  assert.equal(importMessage({ added: 0, updated: 0, skipped: [], withoutFilm: [], stoppedAt: null }), 'Imported 0 studies, updated 0, skipped 0');
  assert.equal(
    importMessage({ added: 2, updated: 1, skipped: [{ fileName: 'm.png', reason: 'malformed' }], withoutFilm: [], stoppedAt: null }),
    'Imported 2 studies, updated 1, skipped 1 (malformed: m.png)',
    'a reason with no names is left out',
  );
});

test('importMessage appends the films that came without a film and where an import stopped', () => {
  assert.equal(
    importMessage({ added: 3, updated: 0, skipped: [], withoutFilm: ['x.png', 'y.png'], stoppedAt: null }),
    'Imported 3 studies, updated 0, skipped 0 \u00b7 2 without film (x.png, y.png)',
  );
  assert.equal(
    importMessage({ added: 3, updated: 1, skipped: [{ fileName: 'a.png', reason: ALREADY }], withoutFilm: ['x.png'], stoppedAt: null }),
    'Imported 3 studies, updated 1, skipped 1 (already in the library: a.png) \u00b7 1 without film (x.png)',
  );
  assert.equal(
    importMessage({
      added: 2, updated: 0, skipped: [], withoutFilm: [],
      stoppedAt: { fileName: 'z.png', message: 'The sidecar for z could not be copied.' },
    }),
    'Imported 2 studies, updated 0, skipped 0 \u00b7 stopped at z.png: The sidecar for z could not be copied. Import the bundle again to continue.',
  );
  assert.equal(
    importMessage({
      added: 1, updated: 1, skipped: [{ fileName: 'm.png', reason: 'malformed' }], withoutFilm: ['x.png'],
      stoppedAt: { fileName: 'z.png', message: 'Disk full.' },
    }),
    'Imported 1 study, updated 1, skipped 1 (malformed: m.png) \u00b7 1 without film (x.png) \u00b7 stopped at z.png: Disk full. Import the bundle again to continue.',
  );
});

test('importMessage reads absent lists as empty and still names a reason it does not know', () => {
  assert.equal(importMessage({ added: 1, updated: 2 }), 'Imported 1 study, updated 2, skipped 0');
  assert.equal(
    importMessage({ added: 0, updated: 0, skipped: [{ fileName: 'q.png', reason: 'something new' }] }),
    'Imported 0 studies, updated 0, skipped 1 (something new: q.png)',
  );
});

test('nothingToImportMessage names the skip reasons without parentheses', () => {
  const skip = [
    { fileName: 'a.png', reason: ALREADY },
    { fileName: 'c.png', reason: 'being edited' },
    { fileName: 'b.png', reason: ALREADY },
    { fileName: 'm.png', reason: 'malformed' },
  ];
  assert.equal(
    nothingToImportMessage({ add: [], update: [], skip: skip.slice(0, 3), actions: [] }),
    'Nothing to import: already in the library: a.png, b.png; being edited: c.png',
  );
  assert.equal(
    nothingToImportMessage({ add: [], update: [], skip, actions: [] }),
    'Nothing to import: already in the library: a.png, b.png; being edited: c.png; malformed: m.png',
  );
  assert.equal(nothingToImportMessage({ add: [], update: [], skip: [], actions: [] }), 'Nothing to import', 'an empty bundle has no reasons to give');
});
