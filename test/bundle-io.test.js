import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { BUNDLE_SCHEMA, isStudyId, isLabelFileName, isSafeName, exportBundle, readBundle, hashFiles } from '../bundle-io.js';
import { BUNDLE_SCHEMA as RENDERER_SCHEMA } from '../renderer/data/bundle.js';

const dirs = [];

async function tempDir(prefix) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

after(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = target => stat(target).then(() => true, () => false);
const readJson = async target => JSON.parse(await readFile(target, 'utf8'));
const CAL_DIGEST = sha256('a calibrated film');

// A fresh stand-in for userData (predictions/, labels/, calibrations/) and an empty folder to export into.
async function fixture() {
  const root = await tempDir('spine-contour-bundle-');
  const paths = {
    predictions: path.join(root, 'predictions'),
    labels: path.join(root, 'labels'),
    calibrations: path.join(root, 'calibrations'),
  };
  const parent = path.join(root, 'out');
  for (const folder of [...Object.values(paths), parent]) await mkdir(folder);
  return { root, paths, parent };
}

// The planner's entry shape (renderer/data/bundle.js planExport), with a real film when `film` is given.
function entry(overrides = {}) {
  const fileName = overrides.fileName ?? 'film.png';
  return {
    dir: 'film',
    sourceId: 'SP-1000',
    fileName,
    filePath: null,
    study: { id: 'SP-1000', source: 'real', fileName, filePath: null, view: 'lateral' },
    labelFile: null,
    calibrationDigest: null,
    ...overrides,
  };
}

const run = (fx, entries, extra = {}) => exportBundle({
  parent: fx.parent, name: 'bundle', entries, appVersion: '1.2.0', paths: fx.paths, ...extra,
});

// ── The shared copy of the schema id ────────────────────────────────────────────────────────────────────────────────

test('BUNDLE_SCHEMA matches renderer/data/bundle.js', () => {
  assert.equal(BUNDLE_SCHEMA, RENDERER_SCHEMA);
  assert.equal(BUNDLE_SCHEMA, 'spinecontour.bundle/1');
});

// ── Validators ──────────────────────────────────────────────────────────────────────────────────────────────────────

test('isStudyId accepts SP-1000 and up, rejects SP-0999, demo ids, and non-strings', () => {
  for (const id of ['SP-1000', 'SP-1001', 'SP-9999', 'SP-10000', 'SP-123456']) assert.equal(isStudyId(id), true, id);
  for (const id of ['SP-0999', 'SP-0030', 'SP-0000', 'SP-999', 'SP-12', 'sp-1000', 'SP-1000 ', ' SP-1000', 'SP-1000\n',
    'SP-1000/..', 'SP-10x0', 'SP-', '', 'XX-1000']) assert.equal(isStudyId(id), false, JSON.stringify(id));
  for (const id of [null, undefined, 1000, {}, [], ['SP-1000'], true]) assert.equal(isStudyId(id), false, String(id));
});

test('isLabelFileName and isSafeName accept bare names and reject separators, .., leading dots, control characters, and over-long names (Review Focus 1)', () => {
  for (const name of ['film.label.json', 'a b.label.json', 'film.v2.label.json', 'ünï.label.json', `${'a'.repeat(200)}.label.json`]) {
    assert.equal(isLabelFileName(name), true, name);
  }
  for (const name of ['film.json', 'film.label.json.bak', '.label.json', '..label.json', '.hidden.label.json',
    'a/b.label.json', 'a\\b.label.json', '../x.label.json', 'a:b.label.json', 'a*b.label.json', 'a?b.label.json',
    'a"b.label.json', 'a<b.label.json', 'a>b.label.json', 'a|b.label.json', 'a\u0000b.label.json', 'a\nb.label.json',
    'a\u001fb.label.json', '', `${'a'.repeat(201)}.label.json`]) assert.equal(isLabelFileName(name), false, JSON.stringify(name));
  for (const name of [null, undefined, 5, {}, ['film.label.json']]) assert.equal(isLabelFileName(name), false, String(name));

  for (const name of ['film', 'film.dcm', 'a b', 'lateral_lumbar_001-2', 'ünï', 'a.b.c', 'a'.repeat(200), 'x']) {
    assert.equal(isSafeName(name), true, name);
  }
  for (const name of ['', '.', '..', '.hidden', '...', 'a/b', 'a\\b', '../a', 'a/..', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b',
    'a>b', 'a|b', 'a\u0000b', 'a\tb', 'a\nb', 'a\u001fb', 'a'.repeat(201)]) assert.equal(isSafeName(name), false, JSON.stringify(name));
  for (const name of [null, undefined, 5, {}, ['film']]) assert.equal(isSafeName(name), false, String(name));
});

// ── exportBundle ────────────────────────────────────────────────────────────────────────────────────────────────────

test('exportBundle writes study.json, copies the sidecar, record and calibration when present, streams the film with its hash, and writes the manifest last', async () => {
  const fx = await fixture();
  const filmBytes = randomBytes(700_000); // several 64 KB chunks: the stream, not one read
  const filmPath = path.join(fx.root, 'film.png');
  await writeFile(filmPath, filmBytes);
  await writeFile(path.join(fx.paths.predictions, 'SP-1000.json'), JSON.stringify({ measurements: { SS: 31 } }));
  await writeFile(path.join(fx.paths.labels, 'film.label.json'), JSON.stringify({ saved_at: '2026-10-15T10:00:00.000Z' }));
  await writeFile(path.join(fx.paths.calibrations, `${CAL_DIGEST}.json`), JSON.stringify({ source_sha256: CAL_DIGEST }));

  const result = await run(fx, [entry({ filePath: filmPath, labelFile: 'film.label.json', calibrationDigest: CAL_DIGEST })]);

  assert.deepEqual(result, { path: path.join(fx.parent, 'bundle'), written: 1, filmsMissing: [], notRead: [] });
  const bundle = result.path;
  const manifest = await readJson(path.join(bundle, 'manifest.json'));
  assert.equal(manifest.schema, 'spinecontour.bundle/1');
  assert.equal(manifest.app_version, '1.2.0');
  assert.equal(new Date(manifest.exported_at).toISOString(), manifest.exported_at);
  assert.deepEqual(manifest.studies, [{
    dir: 'film',
    source_id: 'SP-1000',
    file_name: 'film.png',
    film: 'film/film.png',
    film_sha256: sha256(filmBytes),
    prediction: 'prediction.json',
    label: 'film.label.json',
    calibration: 'calibration.json',
  }]);
  const studyFolder = path.join(bundle, 'film');
  assert.deepEqual(await readJson(path.join(studyFolder, 'study.json')), entry().study);
  assert.deepEqual(await readJson(path.join(studyFolder, 'prediction.json')), { measurements: { SS: 31 } });
  assert.deepEqual(await readJson(path.join(studyFolder, 'film.label.json')), { saved_at: '2026-10-15T10:00:00.000Z' });
  assert.deepEqual(await readJson(path.join(studyFolder, 'calibration.json')), { source_sha256: CAL_DIGEST });
  assert.ok((await readFile(path.join(studyFolder, 'film', 'film.png'))).equals(filmBytes), 'the film is copied byte for byte');
  // The source film is untouched, and nothing but the bundle was added to the parent.
  assert.ok((await readFile(filmPath)).equals(filmBytes));
  assert.deepEqual(await readdir(fx.parent), ['bundle']);
  assert.deepEqual((await readdir(bundle)).sort(), ['film', 'manifest.json']);
  assert.deepEqual((await readdir(studyFolder)).sort(), ['calibration.json', 'film', 'film.label.json', 'prediction.json', 'study.json']);
});

test('exportBundle lists every study in entry order, with null where a file is absent, and writes nothing it was not given', async () => {
  const fx = await fixture();
  const bytesA = Buffer.from('film a');
  const bytesB = Buffer.from('film b');
  await writeFile(path.join(fx.root, 'a.dcm'), bytesA);
  await writeFile(path.join(fx.root, 'b.dcm'), bytesB);
  await writeFile(path.join(fx.paths.predictions, 'SP-1001.json'), '{"ok":true}');

  const result = await run(fx, [
    entry({ dir: 'b', sourceId: 'SP-1001', fileName: 'b.dcm', filePath: path.join(fx.root, 'b.dcm') }),
    entry({ dir: 'a', sourceId: 'SP-1000', fileName: 'a.dcm', filePath: path.join(fx.root, 'a.dcm') }),
  ]);

  assert.equal(result.written, 2);
  const manifest = await readJson(path.join(result.path, 'manifest.json'));
  assert.deepEqual(manifest.studies.map(row => row.dir), ['b', 'a']);
  assert.deepEqual(manifest.studies[0], {
    dir: 'b', source_id: 'SP-1001', file_name: 'b.dcm', film: 'film/b.dcm', film_sha256: sha256(bytesB),
    prediction: 'prediction.json', label: null, calibration: null,
  });
  assert.deepEqual(manifest.studies[1], {
    dir: 'a', source_id: 'SP-1000', file_name: 'a.dcm', film: 'film/a.dcm', film_sha256: sha256(bytesA),
    prediction: null, label: null, calibration: null,
  });
  // A sidecar, record or calibration that is simply absent is not a problem and is not named anywhere.
  assert.deepEqual(result.notRead, []);
  assert.deepEqual((await readdir(path.join(result.path, 'a'))).sort(), ['film', 'study.json']);
});

test('a missing film leaves film null and names it; a sidecar that is not JSON is left out and named (Review Focus 3)', async () => {
  const fx = await fixture();
  await writeFile(path.join(fx.paths.predictions, 'SP-1000.json'), 'not json {');
  await writeFile(path.join(fx.paths.predictions, 'SP-1001.json'), '{"fine":1}');
  await writeFile(path.join(fx.paths.labels, 'bad.label.json'), '{ truncated');
  await writeFile(path.join(fx.paths.calibrations, `${CAL_DIGEST}.json`), '<<<');

  const result = await run(fx, [
    entry({ dir: 'gone', sourceId: 'SP-1000', fileName: 'gone.png', filePath: path.join(fx.root, 'no-such-film.png'),
      labelFile: 'bad.label.json', calibrationDigest: CAL_DIGEST }),
    entry({ dir: 'nopath', sourceId: 'SP-1001', fileName: 'nopath.png', filePath: null }),
    entry({ dir: 'named', sourceId: 'SP-1002', fileName: 'named.png', filePath: null, labelFile: 'absent.label.json' }),
  ]);

  assert.equal(result.written, 3);
  assert.deepEqual(result.filmsMissing, ['gone.png', 'nopath.png', 'named.png']);
  assert.deepEqual(result.notRead, ['SP-1000 sidecar', 'bad.label.json', 'SP-1000 calibration']);
  const manifest = await readJson(path.join(result.path, 'manifest.json'));
  assert.deepEqual(manifest.studies[0], {
    dir: 'gone', source_id: 'SP-1000', file_name: 'gone.png', film: null, film_sha256: null,
    prediction: null, label: null, calibration: null,
  });
  assert.equal(manifest.studies[1].film, null);
  assert.equal(manifest.studies[1].film_sha256, null);
  assert.equal(manifest.studies[1].prediction, 'prediction.json');
  assert.equal(manifest.studies[2].label, null, 'a record the study names but the library does not hold is simply absent');
  // The study is still written whole, and no film/ folder is made for a film that was not there.
  for (const dir of ['gone', 'nopath', 'named']) {
    assert.ok(await exists(path.join(result.path, dir, 'study.json')), `${dir}/study.json`);
    assert.equal(await exists(path.join(result.path, dir, 'film')), false, `${dir}/film`);
  }
  assert.deepEqual((await readdir(path.join(result.path, 'gone'))).sort(), ['study.json']);
});

test('a film path that is a folder, and a file name that is not a safe name, both count as a missing film while the rest of the study is written', async () => {
  const fx = await fixture();
  const film = path.join(fx.root, 'real.png');
  await writeFile(film, 'bytes');
  const asFolder = path.join(fx.root, 'a-folder');
  await mkdir(asFolder);

  const result = await run(fx, [
    entry({ dir: 'folder', fileName: 'folder.png', filePath: asFolder }),
    entry({ dir: 'dotted', sourceId: 'SP-1001', fileName: '.hidden.png', filePath: film }),
    entry({ dir: 'slashed', sourceId: 'SP-1002', fileName: 'a/b.png', filePath: film }),
    entry({ dir: 'ctrl', sourceId: 'SP-1003', fileName: 'a\u0001b.png', filePath: film }),
    entry({ dir: 'ok', sourceId: 'SP-1004', fileName: 'real.png', filePath: film }),
  ]);

  assert.deepEqual(result.filmsMissing, ['folder.png', '.hidden.png', 'a/b.png', 'a\u0001b.png']);
  assert.equal(result.written, 5);
  const manifest = await readJson(path.join(result.path, 'manifest.json'));
  assert.deepEqual(manifest.studies.map(row => row.film), [null, null, null, null, 'film/real.png']);
  for (const row of manifest.studies) assert.ok(await exists(path.join(result.path, row.dir, 'study.json')), row.dir);
  assert.equal(await exists(path.join(result.path, 'dotted', 'film')), false);
  assert.equal(await exists(path.join(result.path, 'ok', 'film', 'real.png')), true);
});

test('a name that is taken in the parent gets -2, -3, and the result path is the folder actually created', async () => {
  const fx = await fixture();
  await mkdir(path.join(fx.parent, 'bundle'));
  await writeFile(path.join(fx.parent, 'bundle', 'keep.txt'), 'someone else\'s');

  const second = await run(fx, [entry()]);
  assert.equal(second.path, path.join(fx.parent, 'bundle-2'));
  const third = await run(fx, [entry()]);
  assert.equal(third.path, path.join(fx.parent, 'bundle-3'));

  assert.ok(await exists(path.join(second.path, 'manifest.json')));
  assert.ok(await exists(path.join(third.path, 'manifest.json')));
  // The folder that was already there is untouched.
  assert.deepEqual(await readdir(path.join(fx.parent, 'bundle')), ['keep.txt']);
});

test('a parent folder that is gone rejects with a sentence, and creates nothing', async () => {
  const fx = await fixture();
  const gone = path.join(fx.root, 'was-here');
  await assert.rejects(run(fx, [entry()], { parent: gone }), { message: 'The folder was not found.' });
  assert.equal(await exists(gone), false);
});

test('exportBundle validates every name before any path is built and writes nothing for an invalid entry', async () => {
  const fx = await fixture();
  const hex = 'a'.repeat(64);
  const bad = [
    ['name with a separator', { name: 'a/b' }],
    ['name that climbs', { name: '..' }],
    ['name with a leading dot', { name: '.bundle' }],
    ['name that is empty', { name: '' }],
    ['entries that are not an array', { entries: 'nope' }],
    ['an entry that is not an object', { entries: [null] }],
    ['dir with a separator', { entries: [entry({ dir: 'a/b' })] }],
    ['dir that climbs', { entries: [entry({ dir: '..' })] }],
    ['dir with a backslash', { entries: [entry({ dir: '..\\x' })] }],
    ['dir that is absolute', { entries: [entry({ dir: 'C:\\x' })] }],
    ['dir that is empty', { entries: [entry({ dir: '' })] }],
    ['dir used twice', { entries: [entry({ dir: 'a' }), entry({ dir: 'a', sourceId: 'SP-1001' })] }],
    ['dir used twice ignoring case', { entries: [entry({ dir: 'a' }), entry({ dir: 'A', sourceId: 'SP-1001' })] }],
    ['a second entry that is invalid after a good first', { entries: [entry(), entry({ dir: 'b', sourceId: '../SP-1001' })] }],
    ['sourceId that climbs', { entries: [entry({ sourceId: '../SP-1000' })] }],
    ['sourceId below SP-1000', { entries: [entry({ sourceId: 'SP-0999' })] }],
    ['sourceId that is not a string', { entries: [entry({ sourceId: 1000 })] }],
    ['labelFile with a separator', { entries: [entry({ labelFile: '../x.label.json' })] }],
    ['labelFile of the wrong kind', { entries: [entry({ labelFile: 'film.json' })] }],
    ['labelFile with a leading dot', { entries: [entry({ labelFile: '.x.label.json' })] }],
    ['calibrationDigest in capitals', { entries: [entry({ calibrationDigest: hex.toUpperCase() })] }],
    ['calibrationDigest too short', { entries: [entry({ calibrationDigest: 'abc' })] }],
    ['calibrationDigest that climbs', { entries: [entry({ calibrationDigest: `..${'a'.repeat(62)}` })] }],
    ['fileName that is not a string', { entries: [entry({ fileName: 7 })] }],
    ['study that is not an object', { entries: [entry({ study: 'nope' })] }],
  ];
  for (const [label, overrides] of bad) {
    await assert.rejects(run(fx, [entry()], overrides), { message: 'Invalid export entry.' }, label);
    assert.deepEqual(await readdir(fx.parent), [], `${label}: nothing was created`);
  }
});

test('the manifest is written last: a study that cannot be written rejects, names no bundle as complete, and leaves a folder without a manifest', async () => {
  const fx = await fixture();
  await writeFile(path.join(fx.root, 'good.png'), 'good');
  const circular = { id: 'SP-1001', source: 'real' };
  circular.self = circular; // JSON cannot hold it: the second study.json write fails

  await assert.rejects(
    run(fx, [
      entry({ dir: 'good', fileName: 'good.png', filePath: path.join(fx.root, 'good.png') }),
      entry({ dir: 'bad', sourceId: 'SP-1001', fileName: 'bad.png', study: circular }),
    ]),
    error => {
      assert.match(error.message, /^[A-Z].*\.$/, 'a sentence');
      assert.doesNotMatch(error.message, /ENOENT|EEXIST|circular|[A-Za-z]:\\/i, 'no errno, Node text or path');
      return true;
    });

  assert.deepEqual(await readdir(fx.parent), ['bundle']);
  const left = await readdir(path.join(fx.parent, 'bundle'));
  assert.equal(left.includes('manifest.json'), false, 'a cut-off export has no manifest');
  assert.ok(left.includes('good'), 'the finished study is still there');
  assert.ok(await exists(path.join(fx.parent, 'bundle', 'good', 'film', 'good.png')));
});

// ── readBundle ──────────────────────────────────────────────────────────────────────────────────────────────────────

test('readBundle refuses a folder without a manifest, a manifest with another schema, and a newer schema with the spec\'s messages', async () => {
  const notBundle = { message: 'This folder is not a Spine Contour bundle.' };
  const empty = await tempDir('spine-contour-bundle-read-');
  await assert.rejects(readBundle(empty), notBundle);
  await assert.rejects(readBundle(path.join(empty, 'missing-folder')), notBundle);

  await writeFile(path.join(empty, 'manifest.json'), '{ not json');
  await assert.rejects(readBundle(empty), notBundle);

  for (const manifest of ['null', '[]', '"text"', '5', '{}', '{"studies":[]}', '{"schema":5,"studies":[]}', '{"schema":"","studies":[]}']) {
    await writeFile(path.join(empty, 'manifest.json'), manifest);
    await assert.rejects(readBundle(empty), notBundle, manifest);
  }

  // The right schema without a studies array is not a bundle either.
  for (const manifest of [{ schema: BUNDLE_SCHEMA }, { schema: BUNDLE_SCHEMA, studies: {} }, { schema: BUNDLE_SCHEMA, studies: 'x' }]) {
    await writeFile(path.join(empty, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(readBundle(empty), notBundle, JSON.stringify(manifest));
  }

  // Another schema string gets the newer-app message, checked before anything else about the manifest.
  await writeFile(path.join(empty, 'manifest.json'), JSON.stringify({ schema: 'spinecontour.bundle/2', studies: [] }));
  await assert.rejects(readBundle(empty), {
    message: 'This bundle was written by a newer Spine Contour (schema spinecontour.bundle/2). Update the app to import it.',
  });
  await writeFile(path.join(empty, 'manifest.json'), JSON.stringify({ schema: 'something-else' }));
  await assert.rejects(readBundle(empty), {
    message: 'This bundle was written by a newer Spine Contour (schema something-else). Update the app to import it.',
  });
});

// A bundle written by hand, so the reader is tested on its own.
async function writeBundle(manifestStudies, files = {}) {
  const dir = await tempDir('spine-contour-bundle-read-');
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ schema: BUNDLE_SCHEMA, app_version: '1.2.0', exported_at: '2026-10-15T14:32:00.000Z', studies: manifestStudies }));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(dir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return dir;
}

const row = (overrides = {}) => ({
  dir: 'a', source_id: 'SP-1000', file_name: 'a.dcm', film: 'film/a.dcm', film_sha256: 'f'.repeat(64),
  prediction: 'prediction.json', label: 'a.label.json', calibration: 'calibration.json', ...overrides,
});

test('readBundle returns parsed study and record, presence flags, the absolute film path, and marks an entry with a separator in dir or film as unsafe', async () => {
  const study = { id: 'SP-1000', source: 'real', fileName: 'a.dcm' };
  const record = { saved_at: '2026-10-15T10:00:00.000Z' };
  const dir = await writeBundle(
    [
      row(),
      row({ dir: 'b', source_id: 'SP-1001', film: null, film_sha256: null, prediction: null, label: null, calibration: null }),
      row({ dir: '../escape', source_id: 'SP-1002' }),
      row({ dir: 'a/b', source_id: 'SP-1003' }),
      row({ dir: 'c', source_id: 'SP-1004', film: 'film/../../x.dcm' }),
      row({ dir: 'c', source_id: 'SP-1005', film: '../x.dcm' }),
      row({ dir: 'c', source_id: 'SP-1006', film: 'other/x.dcm' }),
      row({ dir: 'c', source_id: 'SP-1007', film: 'film/film/x.dcm' }),
      row({ dir: 'c', source_id: 'SP-1008', film: 'film\\x.dcm' }),
      row({ dir: 'c', source_id: 'SP-1009', prediction: '../prediction.json' }),
      row({ dir: 'c', source_id: 'SP-1010', label: 'sub/a.label.json' }),
      row({ dir: 'c', source_id: 'SP-1011', calibration: '..\\calibration.json' }),
      row({ dir: '.hidden', source_id: 'SP-1012' }),
      null,
      'a string',
      row({ dir: 5, source_id: 'SP-1013' }),
      row({ dir: 'c', source_id: 'SP-1014', film: 5 }),
    ],
    {
      'a/study.json': JSON.stringify(study),
      'a/prediction.json': '{"x":1}',
      'a/a.label.json': JSON.stringify(record),
      'a/calibration.json': '{"y":2}',
      'a/film/a.dcm': 'film bytes',
      'b/study.json': JSON.stringify({ id: 'SP-1001', source: 'real' }),
      'c/study.json': JSON.stringify({ id: 'SP-1004', source: 'real' }),
      'c/prediction.json': '{}',
      'c/film/x.dcm': 'x',
      'x.dcm': 'outside the study folder',
    });

  const { manifest, entries } = await readBundle(dir);
  assert.equal(manifest.schema, BUNDLE_SCHEMA);
  assert.equal(entries.length, 17, 'one entry per manifest row, in order');

  const [a, b, ...unsafe] = entries;
  assert.equal(a.dir, 'a');
  assert.deepEqual(a.manifest, row());
  assert.deepEqual(a.study, study);
  assert.deepEqual(a.record, record);
  assert.deepEqual(a.has, { prediction: true, calibration: true, film: true });
  assert.equal(a.filmPath, path.join(dir, 'a', 'film', 'a.dcm'));
  assert.ok(path.isAbsolute(a.filmPath));
  assert.deepEqual(a.problems, []);

  assert.equal(b.dir, 'b');
  assert.deepEqual(b.study, { id: 'SP-1001', source: 'real' });
  assert.equal(b.record, null);
  assert.deepEqual(b.has, { prediction: false, calibration: false, film: false });
  assert.equal(b.filmPath, null);
  assert.deepEqual(b.problems, []);

  for (const [index, e] of unsafe.entries()) {
    assert.deepEqual(e.problems, ['unsafe path'], `entry ${index + 2}: ${JSON.stringify(e.manifest)}`);
    assert.deepEqual(e.has, { prediction: false, calibration: false, film: false }, `entry ${index + 2}`);
    assert.equal(e.filmPath, null, `entry ${index + 2}`);
    assert.equal(e.study, null, `entry ${index + 2}: nothing under an unsafe entry is read`);
    assert.equal(e.record, null, `entry ${index + 2}`);
  }
});

test('readBundle reads a film named without the film/ prefix as a bare name beside study.json, and nothing outside the bundle', async () => {
  const dir = await writeBundle([row({ film: 'a.dcm', prediction: null, label: null, calibration: null })], {
    'a/study.json': '{"id":"SP-1000","source":"real"}',
    'a/a.dcm': 'bytes',
  });
  const { entries } = await readBundle(dir);
  assert.deepEqual(entries[0].problems, []);
  assert.equal(entries[0].has.film, true);
  assert.equal(entries[0].filmPath, path.join(dir, 'a', 'a.dcm'));
});

test('readBundle reports study.json and label record problems without failing the rest, and a missing file is not present', async () => {
  const dir = await writeBundle(
    [
      row({ dir: 'nostudy', source_id: 'SP-1000' }),
      row({ dir: 'badstudy', source_id: 'SP-1001', label: null }),
      row({ dir: 'badrecord', source_id: 'SP-1002' }),
      row({ dir: 'norecord', source_id: 'SP-1003' }),
      row({ dir: 'notobject', source_id: 'SP-1004', label: null }),
      row({ dir: 'good', source_id: 'SP-1005', film: 'film/gone.dcm', label: null, calibration: null }),
    ],
    {
      'nostudy/a.label.json': '{"ok":1}',
      'badstudy/study.json': '{ nope',
      'badrecord/study.json': '{"id":"SP-1002"}',
      'badrecord/a.label.json': 'not json',
      'norecord/study.json': '{"id":"SP-1003"}',
      'notobject/study.json': '[1,2]',
      'good/study.json': '{"id":"SP-1005"}',
    });
  const { entries } = await readBundle(dir);
  const byDir = Object.fromEntries(entries.map(e => [e.dir, e]));

  assert.deepEqual(byDir.nostudy.problems, ['study.json unreadable']);
  assert.equal(byDir.nostudy.study, null);
  assert.deepEqual(byDir.nostudy.record, { ok: 1 }, 'the record is still read');
  assert.deepEqual(byDir.badstudy.problems, ['study.json unreadable']);
  assert.equal(byDir.badstudy.study, null);
  assert.deepEqual(byDir.badrecord.problems, ['label record unreadable']);
  assert.equal(byDir.badrecord.record, null);
  assert.deepEqual(byDir.badrecord.study, { id: 'SP-1002' });
  assert.deepEqual(byDir.norecord.problems, ['label record unreadable'], 'a named record that is not there is a problem too');
  assert.deepEqual(byDir.notobject.problems, ['study.json unreadable'], 'a study.json that is not an object is unreadable');
  assert.deepEqual(byDir.good.problems, []);
  assert.deepEqual(byDir.good.has, { prediction: false, calibration: false, film: false }, 'named but absent files are not present');
  assert.equal(byDir.good.filmPath, null, 'a film named but not on disk gives no path');
});

test('what exportBundle writes, readBundle reads back', async () => {
  const fx = await fixture();
  const filmPath = path.join(fx.root, 'film.png');
  await writeFile(filmPath, 'the film');
  await writeFile(path.join(fx.paths.predictions, 'SP-1000.json'), '{"p":1}');
  await writeFile(path.join(fx.paths.labels, 'film.label.json'), '{"saved_at":"2026-10-15T10:00:00.000Z"}');
  await writeFile(path.join(fx.paths.calibrations, `${CAL_DIGEST}.json`), '{"c":1}');
  const written = await run(fx, [
    entry({ filePath: filmPath, labelFile: 'film.label.json', calibrationDigest: CAL_DIGEST }),
    entry({ dir: 'bare', sourceId: 'SP-1001', fileName: 'bare.png' }),
  ]);

  const { manifest, entries } = await readBundle(written.path);
  assert.equal(manifest.studies.length, 2);
  assert.deepEqual(entries[0].study, entry().study);
  assert.deepEqual(entries[0].record, { saved_at: '2026-10-15T10:00:00.000Z' });
  assert.deepEqual(entries[0].has, { prediction: true, calibration: true, film: true });
  assert.equal(entries[0].filmPath, path.join(written.path, 'film', 'film', 'film.png'));
  assert.equal(entries[0].manifest.film_sha256, sha256('the film'));
  assert.deepEqual(entries[0].problems, []);
  assert.deepEqual(entries[1].has, { prediction: false, calibration: false, film: false });
  assert.equal(entries[1].filmPath, null);
  assert.deepEqual(entries[1].problems, []);
  assert.deepEqual((await hashFiles([entries[0].filmPath]))[entries[0].filmPath], entries[0].manifest.film_sha256);
});

// ── hashFiles ───────────────────────────────────────────────────────────────────────────────────────────────────────

test('hashFiles hashes each path and gives null for a missing file', async () => {
  const dir = await tempDir('spine-contour-hash-');
  const big = randomBytes(300_000);
  const small = Buffer.from('small');
  const zero = Buffer.alloc(0);
  const files = { big: path.join(dir, 'big.bin'), small: path.join(dir, 'small.bin'), zero: path.join(dir, 'zero.bin') };
  await writeFile(files.big, big);
  await writeFile(files.small, small);
  await writeFile(files.zero, zero);
  const missing = path.join(dir, 'missing.bin');
  const folder = path.join(dir, 'folder');
  await mkdir(folder);

  const hashes = await hashFiles([files.big, missing, files.small, files.zero, folder]);
  assert.deepEqual(hashes, {
    [files.big]: sha256(big),
    [missing]: null,
    [files.small]: sha256(small),
    [files.zero]: sha256(zero),
    [folder]: null,
  });
  assert.deepEqual(await hashFiles([]), {});
});
