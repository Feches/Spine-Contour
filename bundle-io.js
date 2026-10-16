/**
 * The annotation bundle's file I/O (spec 2026-10-15-annotation-bundle-export-import-design.md, plan Tasks 2 and 3):
 * the three validators that guard every path built from a name the renderer or a bundle supplies, `exportBundle`,
 * `readBundle`, `hashFiles` and `placeImport`. Outside renderer/ and CommonJS like store-io.js, and only main.js
 * imports it. The pure planning (folder names, which studies, the toast) is renderer/data/bundle.js; this file only
 * touches disk.
 *
 * Nothing here reads or writes outside the three data folders main.js hands in, the chosen parent folder, the bundle
 * and (for a film) the study's own file path. Every name is validated before a path is built from it. A film is
 * streamed, never held in memory. A rejection's message is a sentence a person can read: no errno code, no path.
 */
const { createReadStream, createWriteStream } = require('node:fs');
const { copyFile, mkdir, open, rename, rm, rmdir, stat, unlink } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');
const { writeJsonAtomic, readJsonOrNull } = require('./store-io.js');

// Mirrors renderer/data/bundle.js's BUNDLE_SCHEMA so this root module stays standalone (it cannot import the
// renderer's ES modules); test/bundle-io.test.js asserts the two stay equal.
const BUNDLE_SCHEMA = 'spinecontour.bundle/1';

const NOT_A_BUNDLE = 'This folder is not a Spine Contour bundle.';
const INVALID_ENTRY = 'Invalid export entry.';
const SHA256_HEX = /^[a-f0-9]{64}$/;

// One file or folder name: 1-200 characters, none of \ / : * ? " < > | or U+0000-U+001F, and no leading dot, so
// '.' and '..' cannot form and a name can never leave the folder it is joined to.
const SAFE_NAME = /^(?!\.)[^\\/:*?"<>|\u0000-\u001f]{1,200}$/;
// A label record's file name: the same rule, ending `.label.json` (the rule main.js used to hold as LABEL_FILE).
const LABEL_FILE = /^(?!\.)[^\\/:*?"<>|\u0000-\u001f]{1,200}\.label\.json$/;

// A real study's id. The range check keeps demo ids (SP-0030..SP-0042, which have no film) out of the sidecar folder.
function isStudyId(id) {
  return typeof id === 'string' && /^SP-\d{4,}$/.test(id) && Number(id.slice(3)) >= 1000;
}

function isLabelFileName(name) {
  return typeof name === 'string' && LABEL_FILE.test(name);
}

function isSafeName(name) {
  return typeof name === 'string' && SAFE_NAME.test(name);
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFile = target => stat(target).then(info => info.isFile(), () => false);
const pathExists = target => stat(target).then(() => true, () => false);

// ── Export ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// Every name that will become a path, checked before anything is created. A bad entry rejects the whole export.
// An entry's fileName is not checked here: one that is not a safe name only costs that study its film.
function validateExport({ name, entries, paths }) {
  if (!isSafeName(name) || !Array.isArray(entries)) throw new Error(INVALID_ENTRY);
  const dirs = new Set();
  for (const entry of entries) {
    if (!isObject(entry) || !isSafeName(entry.dir) || !isStudyId(entry.sourceId)) throw new Error(INVALID_ENTRY);
    const key = entry.dir.toLowerCase(); // Windows and macOS compare folder names ignoring case
    if (dirs.has(key)) throw new Error(INVALID_ENTRY);
    dirs.add(key);
    const { labelFile, calibrationDigest } = entry;
    if (labelFile !== null && labelFile !== undefined && !isLabelFileName(labelFile)) throw new Error(INVALID_ENTRY);
    if (calibrationDigest !== null && calibrationDigest !== undefined
        && !(typeof calibrationDigest === 'string' && SHA256_HEX.test(calibrationDigest))) throw new Error(INVALID_ENTRY);
    if (!isObject(entry.study)) throw new Error(INVALID_ENTRY);
  }
  if (!isObject(paths) || !['predictions', 'labels', 'calibrations'].every(key => typeof paths[key] === 'string')) {
    throw new Error('Invalid export folders.');
  }
}

// <parent>/<name>, or <name>-2, <name>-3, ... when a folder of that name is already there. The renderer cannot list
// the parent, so the clash is settled here: mkdir without `recursive` fails EEXIST rather than reusing the folder.
async function createBundleFolder(parent, name) {
  const failed = new Error('The bundle folder could not be created.');
  for (let attempt = 1; attempt <= 1000; attempt += 1) {
    const folder = path.join(parent, attempt === 1 ? name : `${name}-${attempt}`);
    try {
      await mkdir(folder);
      return folder;
    } catch (error) {
      if (error.code === 'EEXIST') continue;
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw new Error('The folder was not found.');
      throw failed;
    }
  }
  throw failed;
}

// Copy a small JSON file (a sidecar, a label record, a calibration) when it is there and parses. 'absent' when no
// such file exists; 'unreadable' when one exists and cannot be read or parsed (it is left out of the bundle).
async function copyJson(source, destination) {
  let parsed = null;
  try { parsed = await readJsonOrNull(source); } catch (_error) { parsed = null; }
  if (parsed === null) return (await pathExists(source)) ? 'unreadable' : 'absent';
  try {
    await copyFile(source, destination);
  } catch (_error) {
    await rm(destination, { force: true }).catch(() => {});
    return 'unreadable';
  }
  return 'copied';
}

// Stream the film into <studyDir>/film/<fileName> while hashing it; the SHA-256 hex, or null when there is no film to
// copy (no path, not a file, unreadable, an unsafe file name, or the copy failed: a partial file is removed). The
// film/ folder is made only once the source has opened, so a study without a film has none.
async function copyFilm(filePath, studyDir, fileName) {
  if (typeof filePath !== 'string' || filePath === '' || !isSafeName(fileName)) return null;
  let handle;
  try {
    if (!(await stat(filePath)).isFile()) return null;
    handle = await open(filePath, 'r');
  } catch (_error) {
    return null;
  }
  const filmDir = path.join(studyDir, 'film');
  const destination = path.join(filmDir, fileName);
  try {
    await mkdir(filmDir, { recursive: true });
    const hash = createHash('sha256');
    const hasher = new Transform({ transform(chunk, _encoding, done) { hash.update(chunk); done(null, chunk); } });
    await pipeline(handle.createReadStream(), hasher, createWriteStream(destination));
    return hash.digest('hex');
  } catch (_error) {
    await rm(destination, { force: true }).catch(() => {});
    await rmdir(filmDir).catch(() => {}); // succeeds only when empty
    return null;
  } finally {
    await handle.close().catch(() => {});
  }
}

/**
 * Write a bundle: <parent>/<name>/ (or <name>-2, ... when taken), one subfolder per entry, then manifest.json LAST,
 * so a bundle cut off mid-export has none and import refuses it. `entries` are renderer/data/bundle.js planExport's;
 * `paths` are the absolute predictions/, labels/ and calibrations/ folders; `appVersion` is the manifest's
 * `app_version`. Resolves `{ path, written, filmsMissing, notRead }`: `path` the folder actually created,
 * `filmsMissing` the file names of films that could not be copied (the study is still written; a study with no file
 * name is listed by its folder name), `notRead` the
 * sidecars, records and calibrations that exist and could not be read (left out). Rejects with a display-ready
 * sentence when an entry is invalid (nothing written), or the bundle folder, a study folder, a study.json or the
 * manifest cannot be written (a partial folder is left, without a manifest).
 */
async function exportBundle({ parent, name, entries, appVersion, paths }) {
  validateExport({ name, entries, paths });
  if (typeof parent !== 'string' || !path.isAbsolute(parent)) throw new Error('The folder was not found.');

  const bundlePath = await createBundleFolder(parent, name);
  const filmsMissing = [];
  const notRead = [];
  const studies = [];

  for (const entry of entries) {
    const studyDir = path.join(bundlePath, entry.dir);
    try {
      await mkdir(studyDir);
    } catch (_error) {
      throw new Error(`The folder for ${entry.dir} could not be created in the bundle.`);
    }
    try {
      await writeJsonAtomic(path.join(studyDir, 'study.json'), entry.study);
    } catch (_error) {
      throw new Error(`The study ${entry.dir} could not be written to the bundle.`);
    }

    const prediction = await copyJson(path.join(paths.predictions, `${entry.sourceId}.json`), path.join(studyDir, 'prediction.json'));
    if (prediction === 'unreadable') notRead.push(`${entry.sourceId} sidecar`);

    let label = 'absent';
    if (typeof entry.labelFile === 'string') {
      label = await copyJson(path.join(paths.labels, entry.labelFile), path.join(studyDir, entry.labelFile));
      if (label === 'unreadable') notRead.push(entry.labelFile);
    }

    let calibration = 'absent';
    if (typeof entry.calibrationDigest === 'string') {
      calibration = await copyJson(path.join(paths.calibrations, `${entry.calibrationDigest}.json`), path.join(studyDir, 'calibration.json'));
      if (calibration === 'unreadable') notRead.push(`${entry.sourceId} calibration`);
    }

    const filmSha256 = await copyFilm(entry.filePath, studyDir, entry.fileName);
    const hasFileName = typeof entry.fileName === 'string';
    // A study with no file name has no film to name: its folder name stands in for it in the toast.
    if (filmSha256 === null) filmsMissing.push(hasFileName ? entry.fileName : entry.dir);

    studies.push({
      dir: entry.dir,
      source_id: entry.sourceId,
      file_name: hasFileName ? entry.fileName : null,
      film: filmSha256 === null ? null : `film/${entry.fileName}`,
      film_sha256: filmSha256,
      prediction: prediction === 'copied' ? 'prediction.json' : null,
      label: label === 'copied' ? entry.labelFile : null,
      calibration: calibration === 'copied' ? 'calibration.json' : null,
    });
  }

  try {
    await writeJsonAtomic(path.join(bundlePath, 'manifest.json'), {
      schema: BUNDLE_SCHEMA,
      app_version: appVersion,
      exported_at: new Date().toISOString(),
      studies,
    });
  } catch (_error) {
    throw new Error('The bundle could not be completed: its manifest could not be written.');
  }
  return { path: bundlePath, written: studies.length, filmsMissing, notRead };
}

// ── Read ────────────────────────────────────────────────────────────────────────────────────────────────────────────

// A JSON file that parses to an object, or null (missing, unreadable, unparseable, or not an object).
async function readJsonObject(file) {
  try {
    const parsed = await readJsonOrNull(file);
    return isObject(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
}

const optionalName = value => value === null || value === undefined || isSafeName(value);

// The file paths a manifest row names, relative to the study's folder, or null when any of them is unsafe. Every
// path is one bare name; the film may carry exactly one `film/` prefix, and what follows it must be a bare name too.
function rowPaths(row) {
  if (!isObject(row) || !isSafeName(row.dir)) return null;
  if (!optionalName(row.prediction) || !optionalName(row.label) || !optionalName(row.calibration)) return null;
  let film = null;
  if (row.film !== null && row.film !== undefined) {
    if (typeof row.film !== 'string') return null;
    const bare = row.film.startsWith('film/') ? row.film.slice('film/'.length) : row.film;
    if (!isSafeName(bare)) return null;
    film = row.film.startsWith('film/') ? path.join('film', bare) : bare;
  }
  return { prediction: row.prediction ?? null, label: row.label ?? null, calibration: row.calibration ?? null, film };
}

async function readEntry(root, row) {
  const relative = rowPaths(row);
  const dir = isObject(row) && typeof row.dir === 'string' ? row.dir : null;
  if (relative === null) {
    return {
      dir, manifest: row, study: null, record: null,
      has: { prediction: false, calibration: false, film: false }, filmPath: null, problems: ['unsafe path'],
    };
  }
  const studyDir = path.join(root, row.dir);
  const problems = [];
  const study = await readJsonObject(path.join(studyDir, 'study.json'));
  if (study === null) problems.push('study.json unreadable');
  let record = null;
  if (relative.label !== null) {
    record = await readJsonObject(path.join(studyDir, relative.label));
    if (record === null) problems.push('label record unreadable');
  }
  const filmPath = relative.film === null ? null : path.join(studyDir, relative.film);
  const has = {
    prediction: relative.prediction !== null && await isFile(path.join(studyDir, relative.prediction)),
    calibration: relative.calibration !== null && await isFile(path.join(studyDir, relative.calibration)),
    film: filmPath !== null && await isFile(filmPath),
  };
  return { dir, manifest: row, study, record, has, filmPath: has.film ? filmPath : null, problems };
}

/**
 * Read a bundle folder: `{ manifest, entries }`, one entry per manifest row, in order, each
 * `{ dir, manifest, study, record, has: { prediction, calibration, film }, filmPath, problems }`. `study` and `record`
 * are the parsed study.json and label record (null when unreadable), `filmPath` the absolute path of the film (null
 * unless the row names one and it is there). A row with any unsafe path is not read at all: `problems` is
 * `['unsafe path']`, everything else null or false. Sidecars, calibrations and films are never read, only checked for.
 * Rejects when the folder is not a bundle, or was written by a newer app.
 */
async function readBundle(dir) {
  if (typeof dir !== 'string' || dir === '') throw new Error(NOT_A_BUNDLE);
  const root = path.resolve(dir);
  let manifest = null;
  try { manifest = await readJsonOrNull(path.join(root, 'manifest.json')); } catch (_error) { manifest = null; }
  if (!isObject(manifest) || typeof manifest.schema !== 'string' || manifest.schema === '') throw new Error(NOT_A_BUNDLE);
  if (manifest.schema !== BUNDLE_SCHEMA) {
    throw new Error(`This bundle was written by a newer Spine Contour (schema ${manifest.schema}). Update the app to import it.`);
  }
  if (!Array.isArray(manifest.studies)) throw new Error(NOT_A_BUNDLE);
  const entries = [];
  for (const row of manifest.studies) entries.push(await readEntry(root, row));
  return { manifest, entries };
}

// ── Hash ────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function sha256File(file) {
  if (typeof file !== 'string' || file === '') throw new Error('No file.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** SHA-256 hex of each file, streamed one after another; null for a path that cannot be read. Keyed by the paths given. */
async function hashFiles(paths) {
  const hashes = [];
  for (const file of Array.isArray(paths) ? paths : []) hashes.push([file, await sha256File(file).catch(() => null)]);
  return Object.fromEntries(hashes);
}

// ── Import ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const INVALID_ACTION = 'Invalid import action.';
// The only names an action may give a study's sidecar and calibration inside the bundle (what exportBundle writes).
const PREDICTION_FILE = 'prediction.json';
const CALIBRATION_FILE = 'calibration.json';

// An action from renderer/data/bundle.js planImport, checked whole before any path is built from it: readBundle hands
// an unsafe row's `dir` back as it found it and never checks `source_id`, so nothing here trusts the planner to have
// filtered them out.
function isValidAction(action) {
  if (!isObject(action)) return false;
  if (action.kind !== 'add' && action.kind !== 'update') return false;
  if (!isSafeName(action.dir) || !isStudyId(action.id)) return false;
  if (action.prediction !== PREDICTION_FILE && action.prediction !== null) return false;
  if (action.calibration !== CALIBRATION_FILE && action.calibration !== null) return false;
  if (typeof action.deleteLocalPrediction !== 'boolean') return false;
  const { label } = action;
  return label === null || (isObject(label) && isSafeName(label.from) && isLabelFileName(label.to));
}

// Copy a file through <destination>.tmp and a rename, as writeJsonAtomic writes, so a copy cut off part way never
// leaves half a sidecar or record where a whole one was. The folder is made first: a fresh profile has no labels/.
async function copyAtomic(source, destination) {
  const temporary = `${destination}.tmp`;
  try {
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, temporary);
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

// The calibration store's own sentences ('Invalid image reference.') pass through; a Node error from its write (an
// errno code and a path) does not.
function calibrationFailure(error, dir) {
  const own = error instanceof Error && typeof error.code !== 'string' && typeof error.message === 'string'
    && error.message.trim() !== '';
  return own ? error.message : `The calibration reference for ${dir} could not be saved.`;
}

// One validated action, in the order spec §5.6 and §5.7 give: the sidecar, the record, the calibration. Throws a
// sentence naming the study's folder at the first step that fails; the steps before it stay placed.
async function placeAction(root, action, paths, saveCalibration) {
  const source = path.join(root, action.dir);
  const sidecar = path.join(paths.predictions, `${action.id}.json`);
  if (action.prediction !== null) {
    const from = path.join(source, PREDICTION_FILE);
    // Parsed before it is placed, so the library never gains a sidecar it cannot read.
    if (await readJsonObject(from) === null) throw new Error(`The sidecar for ${action.dir} could not be read.`);
    try {
      await copyAtomic(from, sidecar);
    } catch (_error) {
      throw new Error(`The sidecar for ${action.dir} could not be copied.`);
    }
  } else if (action.deleteLocalPrediction) {
    // An update whose bundle study has no sidecar retires the local one; one that is already gone is the outcome wanted.
    try {
      await unlink(sidecar);
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`The local sidecar for ${action.dir} could not be removed.`);
    }
  }
  if (action.label !== null) {
    try {
      await copyAtomic(path.join(source, action.label.from), path.join(paths.labels, action.label.to));
    } catch (_error) {
      throw new Error(`The label record for ${action.dir} could not be copied.`);
    }
  }
  if (action.calibration !== null) {
    const reference = await readJsonObject(path.join(source, CALIBRATION_FILE));
    if (reference === null) throw new Error(`The calibration reference for ${action.dir} could not be read.`);
    try {
      await saveCalibration(reference);
    } catch (error) {
      throw new Error(calibrationFailure(error, action.dir));
    }
  }
}

/**
 * Place the files of the studies an import adds or updates (plan PB5): per action, in order, the bundle's sidecar
 * copied to `<paths.predictions>/<id>.json` (or, with no sidecar and `deleteLocalPrediction`, the local one removed),
 * the label record copied from `<dir>/<action.dir>/<label.from>` to `<paths.labels>/<label.to>`, and the calibration
 * reference parsed and handed to `saveCalibration` (the calibration store's `save`, which validates and writes it).
 * `dir` is the bundle's absolute path; each action is `{ kind: 'add'|'update', dir, id, prediction:
 * 'prediction.json'|null, deleteLocalPrediction, label: { from, to }|null, calibration: 'calibration.json'|null }`.
 * Resolves `{ placed, failed }`: `placed` the ids of the actions fully placed, in order, and `failed` `{ id, message }`
 * for the first action that was invalid (`Invalid import action.`) or could not be placed (a sentence naming its
 * folder), or null. Nothing of the failed action's later steps, and nothing of any later action, is placed. Rejects
 * only when `dir` is not an absolute path (`The folder was not found.`) or the request cannot be used.
 */
async function placeImport({ dir, actions, paths, saveCalibration } = {}) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('The folder was not found.');
  if (!Array.isArray(actions) || !isObject(paths) || typeof paths.predictions !== 'string'
      || typeof paths.labels !== 'string' || typeof saveCalibration !== 'function') throw new Error('Invalid request.');
  const placed = [];
  for (const action of actions) {
    const id = isObject(action) && typeof action.id === 'string' ? action.id : null;
    if (!isValidAction(action)) return { placed, failed: { id, message: INVALID_ACTION } };
    try {
      await placeAction(dir, action, paths, saveCalibration);
    } catch (error) {
      return { placed, failed: { id, message: error.message } };
    }
    placed.push(action.id);
  }
  return { placed, failed: null };
}

module.exports = { BUNDLE_SCHEMA, isStudyId, isLabelFileName, isSafeName, exportBundle, readBundle, hashFiles, placeImport };
