// The annotation bundle's planner (spec 2026-10-15-annotation-bundle-export-import-design.md; plan Tasks 1 and 4): the
// names of a bundle's folders, the plan of which studies an export writes where, and the plan of which studies an
// import adds, updates and skips. Pure: no DOM, no store, no I/O, and nothing here mutates the records it is given.
// The main process does the reading, hashing and writing; the screen hands this module what it read and applies what
// it returns.
//
// An export is a folder, `spine-contour-export-YYYY-MM-DD-HHMM`, holding one subfolder per real study (its film, its
// sidecar, its label record) and a manifest. Every name below is a file or folder name the main process accepts, and
// a clash is settled the way Windows and macOS file names are compared: ignoring case.

import { STORE_VERSION, nextId, validate } from './persistence.js';
import { labelFileName, normalizeComment } from './label-record.js';
import { fileStem, lastSegment, safeStem } from './labels.js';

export const BUNDLE_SCHEMA = 'spinecontour.bundle/1';

const SHA256_HEX = /^[a-f0-9]{64}$/;

const isHash = value => typeof value === 'string' && SHA256_HEX.test(value);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// The names a set of file names compares by: lower case, as Windows and macOS compare them.
const lowerCased = names => new Set([...(names ?? [])].map(name => String(name).toLowerCase()));

// `base`, or `base-2`, `base-3`, ... when `used` (a Set of lower-cased names) already holds it. The first free suffix
// wins: a gap left by a name taken out of order is not filled. The caller adds the name it chooses to `used`.
function clashFree(base, used) {
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base}-${n}`;
  return name;
}

const pad = (value, width = 2) => String(value).padStart(width, '0');

/**
 * 'spine-contour-export-2026-10-15-1432' for 14:32 on 15 October 2026 in local time (the person's clock, not UTC),
 * suffixed '-2', '-3', ... when `taken` (the names already in the chosen parent folder; none by default) holds it.
 */
export function bundleFolderName(now, taken = []) {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return clashFree(`spine-contour-export-${date}-${time}`, lowerCased(taken));
}

// A study folder's name before any clash: the film's stem made safe (safeStem), without the trailing dots and spaces
// Windows cannot keep on a folder name (ruling S10), and `film` when nothing is left.
function folderBase(stem) {
  const base = safeStem(stem).replace(/[. ]+$/, '');
  return base === '' ? 'film' : base;
}

/** A study's folder inside the bundle: its film's stem made safe (safeStem), suffixed '-2', '-3', ... on a clash. */
export function studyFolderName(stem, taken = []) {
  return clashFree(folderBase(stem), lowerCased(taken));
}

/**
 * The digest of the film this study was read from, or null: the calibration's `source_sha256`, else the geometry's
 * (the two name the same bytes). Only a 64-character lower-case hex string counts, so a damaged value neither
 * matches a film nor hides the other source's good one.
 */
export function localFilmHash(study) {
  for (const digest of [study?.calibration?.source_sha256, study?.geometry?.source_sha256]) {
    if (isHash(digest)) return digest;
  }
  return null;
}

// The two names in the bundle's root that no study folder may take: the manifest and the temporary file it is written
// through (an atomic write renames `manifest.json.tmp` over `manifest.json`).
const ROOT_FILES = ['manifest.json', 'manifest.json.tmp'];

/**
 * What an export writes. `studies` is the library; a demo study (not `source: 'real'`) has no film and is left out.
 * Each entry, in the order given:
 *   dir               the study's subfolder in the bundle, clash-free among the entries and the root files
 *   sourceId          the library id it came from (the manifest records it; an import assigns a new one)
 *   fileName          the film's file name
 *   filePath          where the film is read from now; the bundle itself never records it
 *   study             the record with `filePath: null` and every other field as given (a copy: nothing is mutated)
 *   labelFile         the name of the study's label record in userData/labels, or null
 *   calibrationDigest the film digest the calibration was made on, or null (anything but 64 lower-case hex is null:
 *                     one damaged digest must not block a whole export, ruling S13)
 * `name` is the bundle's folder name, clash-free among `takenFolderNames` (the chosen parent folder's contents).
 */
export function planExport(studies, now, takenFolderNames = []) {
  const used = lowerCased(ROOT_FILES);
  const entries = [];
  for (const study of studies ?? []) {
    if (study?.source !== 'real') continue;
    const dir = clashFree(folderBase(fileStem(study.fileName ?? '')), used);
    used.add(dir.toLowerCase());
    const digest = study.calibration?.source_sha256;
    entries.push({
      dir,
      sourceId: study.id,
      fileName: study.fileName,
      filePath: study.filePath,
      study: { ...study, filePath: null },
      labelFile: typeof study.labelFile === 'string' && study.labelFile !== '' ? study.labelFile : null,
      calibrationDigest: isHash(digest) ? digest : null,
    });
  }
  return { name: bundleFolderName(now, takenFolderNames), entries };
}

const plural = (count, one, many) => (count === 1 ? one : many);

/**
 * The toast an export ends with: what was written and where, then, only when non-zero, the films that were not
 * found (left out of the bundle) and the files that could not be read. `filmsMissing` and `notRead` list names;
 * `notRead` holds sidecars, label records and calibration references (`<file name> sidecar`, the record's own name,
 * `<file name> calibration`), so its clause says files (ruling S40).
 */
export function exportMessage({ path, written, filmsMissing = [], notRead = [] }) {
  const parts = [`Exported ${written} ${plural(written, 'study', 'studies')} to ${path}`];
  if (filmsMissing.length > 0) {
    const n = filmsMissing.length;
    parts.push(`${n} ${plural(n, 'film was', 'films were')} not found and ${plural(n, 'was', 'were')} left out (${filmsMissing.join(', ')})`);
  }
  if (notRead.length > 0) {
    const n = notRead.length;
    parts.push(`${n} ${plural(n, 'file', 'files')} could not be read (${notRead.join(', ')})`);
  }
  return parts.join(' · ');
}

// ---------- import ----------

// The reasons an entry is skipped, in the order a toast names them.
const ALREADY_IN_LIBRARY = 'already in the library';
const BEING_EDITED = 'being edited';
const MALFORMED = 'malformed';
const SKIP_REASONS = [ALREADY_IN_LIBRARY, BEING_EDITED, MALFORMED];

// The only names placeImport (bundle-io.js) accepts for a study's sidecar and calibration inside the bundle.
const PREDICTION_FILE = 'prediction.json';
const CALIBRATION_FILE = 'calibration.json';

// When the record was saved, as a time, or null when it has no `saved_at` or it does not parse (PB8: unparseable counts
// as absent). Date.parse is handed strings only: it would read a number as a year.
function savedAt(record) {
  const saved = record?.saved_at;
  const time = typeof saved === 'string' ? Date.parse(saved) : Number.NaN;
  return Number.isNaN(time) ? null : time;
}

// The entry's study as `load-studies` would accept it: the record validate normalizes (ruling S7), or null when the
// entry cannot be trusted. An entry with problems is never trusted (nothing of it is used), and a study.json that
// validate rejects, the checks load-studies applies, is malformed (spec §5.4's first row).
function trustedStudy(entry) {
  if (!isObject(entry) || entry.problems?.length > 0 || !isObject(entry.study)) return null;
  try {
    return validate({ version: STORE_VERSION, studies: [entry.study] })[0];
  } catch (_error) {
    return null;
  }
}

// The local real study the entry's film is, or null (spec §5.3). Local studies are searched in library order and the
// first match is the study: two copies of one film in the library are not told apart. File name alone never matches.
// A bundle film hash matches a local study whose hash is the same 64-hex digest, so null never equals null. With no
// film hash (the film was not exported) the digest of the film its result or calibration was made on stands in for it
// (ruling S20: localFilmHash of the entry's study, the same digest the local side matches on), so a segmented or
// calibrated study whose film was left out still finds its local copy. Failing that, the entry's record carries the
// stored image's hash, which matches the same hash in the record of a local study of the same file name. An entry with
// none of these matches nothing: file name alone never does.
function findLocal(entry, study, locals, localHashes, localRecords) {
  const withHash = hash => locals.find(local => localHashes?.[local.id] === hash) ?? null;
  const filmHash = entry.manifest?.film_sha256;
  if (isHash(filmHash)) return withHash(filmHash);
  const resultHash = localFilmHash(study);
  const byResult = resultHash === null ? null : withHash(resultHash);
  if (byResult !== null) return byResult;
  const imageHash = entry.record?.image?.sha256;
  if (!isHash(imageHash)) return null;
  return locals.find(local => local.fileName === study.fileName && localRecords?.[local.id]?.image_sha256 === imageHash) ?? null;
}

// Of two entries on one local study, whether `a` is the one to apply (ruling S18): an entry with a record before one
// without, then the later-saved (an unparseable time is the earliest), and on a tie the earlier in manifest order (the
// caller holds the earlier as `b`, and a tie is not outranking).
function outranks(a, b) {
  const aHasRecord = isObject(a.record);
  if (aHasRecord !== isObject(b.record)) return aHasRecord;
  return (savedAt(a.record) ?? -Infinity) > (savedAt(b.record) ?? -Infinity);
}

// Whether a matched entry replaces the local study's annotation (spec §5.4): the bundle has a record and the local study
// has none, or both have one and the bundle's was saved strictly later. An unparseable time on either side is no time,
// so two records are never compared on it (PB8).
function bringsNewerRecord(entry, localRecord) {
  if (!isObject(entry.record)) return false;
  if (localRecord == null) return true;
  const incoming = savedAt(entry.record);
  const existing = savedAt(localRecord);
  return incoming !== null && existing !== null && incoming > existing;
}

// What each entry is, before ids and names are given out: skipped (malformed, being edited, or already in the library)
// or an add, or an update of one local study.
function decide(entries, locals, { localHashes, localRecords, editing }) {
  const found = entries.map(entry => {
    const study = trustedStudy(entry);
    if (study === null) return { malformed: true };
    const local = findLocal(entry, study, locals, localHashes, localRecords);
    return { study, local };
  });

  // One local study is updated from one entry: the one that outranks the others matched to it.
  const winners = new Map();
  found.forEach((item, index) => {
    if (!item.local) return;
    const held = winners.get(item.local.id);
    if (held === undefined || outranks(entries[index], entries[held])) winners.set(item.local.id, index);
  });

  return found.map((item, index) => {
    if (item.malformed) return { skip: MALFORMED };
    if (!item.local) return { add: item.study };
    // A study open in the editor, or with a stashed editor, is left alone whatever the bundle holds; every entry on it
    // says so, rather than naming all but one as already in the library.
    if (editing?.has(item.local.id)) return { skip: BEING_EDITED };
    if (winners.get(item.local.id) !== index) return { skip: ALREADY_IN_LIBRARY };
    return bringsNewerRecord(entries[index], localRecords?.[item.local.id])
      ? { update: item.local, study: item.study }
      : { skip: ALREADY_IN_LIBRARY };
  });
}

// What a toast calls a skipped entry, so every skip can be named: its study's file name, else the manifest row's, else
// its folder, else its place in the manifest. An entry with problems is not trusted, so its study is not read; the row
// is only a string to show, never a path to build.
function skipName(entry, index) {
  const row = isObject(entry?.manifest) ? entry.manifest : {};
  const own = entry?.problems?.length > 0 || !isObject(entry?.study) ? undefined : entry.study.fileName;
  for (const name of [own, row.file_name, row.dir]) {
    if (typeof name === 'string' && name !== '') return name;
  }
  return String(index);
}

// One action for placeImport (bundle-io.js): which of the entry's files go where. `labelFile` is the name the record is
// written under in the library, or null when the entry has no record to place.
function placement(kind, id, entry, labelFile, deleteLocalPrediction) {
  return {
    kind,
    dir: entry.dir,
    id,
    prediction: entry.has?.prediction ? PREDICTION_FILE : null,
    deleteLocalPrediction,
    label: labelFile === null ? null : { from: entry.manifest.label, to: labelFile },
    calibration: entry.has?.calibration ? CALIBRATION_FILE : null,
  };
}

/**
 * Which of a bundle's studies an import adds, updates and skips (spec §5.3, §5.4), in manifest order.
 *   bundle       readBundle's result, `{ manifest, entries }`
 *   studies      the library (demo studies are never matched)
 *   localHashes  `{ [id]: sha256|null }` the film digest of each local study the screen could read one for
 *   localRecords `{ [id]: { saved_at, image_sha256 }|null }` the label records of the local studies the rule needs
 *   editing      a Set of local ids open in edit mode or with a stashed editor
 *   now          reserved
 * Returns `{ add, update, skip, actions }`:
 *   add     `{ id, labelFile, entry }` per study to add: its new id (nextId over the library and the ids given so far),
 *           the label name its record is written under (null when it has no record) and the entry, whose `study` is the
 *           normalized record (S7)
 *   update  `{ id, labelFile, entry }` per local study to update: its id, the label name the record is written under
 *           (the study's own, else a fresh one, PB9) and the entry
 *   skip    `{ fileName, reason }` per entry left out; reason is `already in the library`, `being edited` or `malformed`
 *   actions the placement list for bundle-io.js placeImport: an action per add and update, in manifest order
 * Matching is by film hash and never by file name alone. Nothing in the arguments is changed.
 */
export function planImport({ bundle, studies, localHashes, localRecords, editing } = {}) {
  const entries = Array.isArray(bundle?.entries) ? bundle.entries : [];
  const library = Array.isArray(studies) ? studies : [];
  const locals = library.filter(study => study?.source === 'real');
  const decisions = decide(entries, locals, { localHashes, localRecords, editing });

  const given = [...library]; // for nextId: the library, then a stub per id given out
  const taken = new Set(library.map(study => study?.labelFile).filter(name => typeof name === 'string' && name !== ''));
  const plan = { add: [], update: [], skip: [], actions: [] };

  decisions.forEach((decision, index) => {
    const entry = entries[index];
    if (decision.skip) {
      plan.skip.push({ fileName: skipName(entry, index), reason: decision.skip });
    } else if (decision.add) {
      const id = nextId(given);
      given.push({ id, source: 'real' });
      const labelFile = isObject(entry.record) ? labelFileName(fileStem(decision.add.fileName), taken) : null;
      if (labelFile !== null) taken.add(labelFile);
      plan.add.push({ id, labelFile, entry: { ...entry, study: decision.add } });
      plan.actions.push(placement('add', id, entry, labelFile, false));
    } else {
      const local = decision.update;
      // The bundle's record goes over the local study's own record file; a study with none is given a fresh name (PB9).
      const labelFile = typeof local.labelFile === 'string' && local.labelFile !== ''
        ? local.labelFile : labelFileName(fileStem(local.fileName), taken);
      taken.add(labelFile);
      plan.update.push({ id: local.id, labelFile, entry: { ...entry, study: decision.study } });
      // A bundle study with no sidecar replaces a result that had one (a hand-placed film over a model result): the
      // local sidecar goes, or the record would point at a result it no longer has (ruling S8). But only when the
      // bundle's study names a different result (S21): the exporter keeps `predictionId` in study.json even when it
      // could not read the sidecar, and a sidecar stored under the same `predictionId` still matches the study the
      // update leaves behind, so deleting it would lose the model's image and mask for good.
      const retiresSidecar = local.predictionId != null && !entry.has?.prediction
        && decision.study.predictionId !== local.predictionId;
      plan.actions.push(placement('update', local.id, entry, labelFile, retiresSidecar));
    }
  });
  return plan;
}

// The comment a study shows (spec §5.6, §5.7, ruling S17): the copy study.json carries, else the record's own.
const commentOf = (study, record) => study.labelComment ?? normalizeComment(record?.comment);

// The fields an update takes from the bundle's study (spec §5.7), besides the label file the plan names. The local
// study keeps its id, filePath, addedAt, name, workspaceFolder, subjectId, timepoint, filmDate, note and clinical.
const UPDATED_FIELDS = [
  'view', 'region', 'anteriorSide', 'predictionId', 'processingError', 'processingErrorAt', 'measurements', 'geometry',
  'qc', 'calibration', 'thumbnail', 'reviewedAt',
];

// (2026-10-19, final review) The view is taken only when the bundle names one: an Unknown view (null) in the bundle says
// nothing about the patient position, so it keeps the view the local study has rather than wiping it. A named view
// replaces the local one, as every other field in the list does.
const namesView = view => typeof view === 'string' && view.trim() !== '';

function updatedStudy(local, { labelFile, entry }) {
  const patch = Object.fromEntries(UPDATED_FIELDS.map(field => [field, entry.study[field]]));
  if (!namesView(patch.view)) patch.view = local.view;
  return { ...local, ...patch, labelComment: commentOf(entry.study, entry.record), labelFile };
}

function addedStudy({ id, labelFile, entry }) {
  // The bundle's record with the new id, the film in the bundle (none when it was not exported) and the label name its
  // record was written under; addedAt and everything else is the bundle's.
  return { ...entry.study, id, filePath: entry.filmPath ?? null, labelFile, labelComment: commentOf(entry.study, entry.record) };
}

/**
 * The library after an import: each update patched into its local study (spec §5.7) and each add appended at the end
 * (§5.6), as new objects; a study the plan does not touch keeps its reference. `placedIds` are the ids placeImport
 * reported placed (PB5); an action that was not placed is not applied. Every add and update by default.
 */
export function applyImport(studies, plan, placedIds) {
  const placed = placedIds == null ? null : new Set(placedIds);
  const wanted = item => placed === null || placed.has(item.id);
  const updates = new Map((plan?.update ?? []).filter(wanted).map(item => [item.id, item]));
  const patched = (studies ?? []).map(study => (updates.has(study?.id) ? updatedStudy(study, updates.get(study.id)) : study));
  return [...patched, ...(plan?.add ?? []).filter(wanted).map(addedStudy)];
}

/** The line the import prompt shows (spec §5.5, ruling S16): what the plan does, and that the films stay in the folder. */
export function importPromptText(plan, dir) {
  return `Import from ${lastSegment(dir)}: ${plan.add.length} to add, ${plan.update.length} to update, ${plan.skip.length} to skip. `
    + 'The films stay in this folder, so keep it where it is.';
}

// 'already in the library: a, b; being edited: c': the skipped names grouped by reason, the known reasons in their
// order and any other after them, so a count and its names always agree.
function skipSummary(skipped) {
  const byReason = new Map();
  for (const { fileName, reason } of skipped) {
    if (!byReason.has(reason)) byReason.set(reason, []);
    byReason.get(reason).push(fileName);
  }
  const reasons = [...SKIP_REASONS, ...[...byReason.keys()].filter(reason => !SKIP_REASONS.includes(reason))];
  return reasons.filter(reason => byReason.has(reason)).map(reason => `${reason}: ${byReason.get(reason).join(', ')}`).join('; ');
}

/**
 * The toast an import ends with (spec §5.8): `Imported 10 studies, updated 2, skipped 3 (already in the library: a, b;
 * being edited: c)`, then, only when present, the studies that came without a film and where an import stopped (ruling
 * S19). `result` is `{ added, updated, skipped: [{ fileName, reason }], withoutFilm: string[], stoppedAt: { fileName,
 * message }|null }`.
 */
export function importMessage({ added, updated, skipped = [], withoutFilm = [], stoppedAt = null }) {
  let text = `Imported ${added} ${plural(added, 'study', 'studies')}, updated ${updated}, skipped ${skipped.length}`;
  if (skipped.length > 0) text += ` (${skipSummary(skipped)})`;
  if (withoutFilm.length > 0) text += ` · ${withoutFilm.length} without film (${withoutFilm.join(', ')})`;
  if (stoppedAt) text += ` · stopped at ${stoppedAt.fileName}: ${stoppedAt.message} Import the bundle again to continue.`;
  return text;
}

/** The toast for a plan with nothing to add or update (spec §5.5): `Nothing to import: already in the library: a, b`. */
export function nothingToImportMessage(plan) {
  const reasons = skipSummary(plan.skip);
  return reasons === '' ? 'Nothing to import' : `Nothing to import: ${reasons}`;
}
