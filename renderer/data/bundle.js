// The annotation bundle's planner (spec 2026-10-15-annotation-bundle-export-import-design.md; plan Task 1): the names
// of a bundle's folders, and the plan of which studies an export writes where. Pure: no DOM, no store, no I/O, and
// nothing here mutates the records it is given. The main process does the reading and writing from this plan.
//
// An export is a folder, `spine-contour-export-YYYY-MM-DD-HHMM`, holding one subfolder per real study (its film, its
// sidecar, its label record) and a manifest. Every name below is a file or folder name the main process accepts, and
// a clash is settled the way Windows and macOS file names are compared: ignoring case.

import { fileStem, safeStem } from './labels.js';

export const BUNDLE_SCHEMA = 'spinecontour.bundle/1';

const SHA256_HEX = /^[a-f0-9]{64}$/;

// `base` + `ext`, or `base-2` + `ext`, `base-3` + `ext`, ... when `taken` (an iterable of names) already holds it.
// The first free suffix wins: a gap left by a name taken out of order is not filled. Names compare ignoring case.
function clashFree(base, taken, ext = '') {
  const used = new Set([...(taken ?? [])].map(name => String(name).toLowerCase()));
  let name = `${base}${ext}`;
  for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base}-${n}${ext}`;
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
  return clashFree(`spine-contour-export-${date}-${time}`, taken);
}

/** A study's folder inside the bundle: its film's stem made safe (safeStem), suffixed '-2', '-3', ... on a clash. */
export function studyFolderName(stem, taken = []) {
  return clashFree(safeStem(stem), taken);
}

/**
 * The digest of the film this study was read from, or null: the calibration's `source_sha256`, else the geometry's
 * (the two name the same bytes). Only a 64-character lower-case hex string counts, so a damaged value neither
 * matches a film nor hides the other source's good one.
 */
export function localFilmHash(study) {
  for (const digest of [study?.calibration?.source_sha256, study?.geometry?.source_sha256]) {
    if (typeof digest === 'string' && SHA256_HEX.test(digest)) return digest;
  }
  return null;
}

/**
 * What an export writes. `studies` is the library; a demo study (not `source: 'real'`) has no film and is left out.
 * Each entry, in the order given:
 *   dir               the study's subfolder in the bundle, clash-free among the entries
 *   sourceId          the library id it came from (the manifest records it; an import assigns a new one)
 *   fileName          the film's file name
 *   filePath          where the film is read from now; the bundle itself never records it
 *   study             the record with `filePath: null` and every other field as given (a copy: nothing is mutated)
 *   labelFile         the name of the study's label record in userData/labels, or null
 *   calibrationDigest the film digest the calibration was made on, or null
 * `name` is the bundle's folder name, clash-free among `takenFolderNames` (the chosen parent folder's contents).
 */
export function planExport(studies, now, takenFolderNames = []) {
  const dirs = [];
  const entries = [];
  for (const study of studies ?? []) {
    if (study?.source !== 'real') continue;
    const dir = studyFolderName(fileStem(study.fileName ?? ''), dirs);
    dirs.push(dir);
    entries.push({
      dir,
      sourceId: study.id,
      fileName: study.fileName,
      filePath: study.filePath,
      study: { ...study, filePath: null },
      labelFile: typeof study.labelFile === 'string' && study.labelFile !== '' ? study.labelFile : null,
      calibrationDigest: study.calibration?.source_sha256 ?? null,
    });
  }
  return { name: bundleFolderName(now, takenFolderNames), entries };
}

const plural = (count, one, many) => (count === 1 ? one : many);

/**
 * The toast an export ends with: what was written and where, then, only when non-zero, the films that were not
 * found (left out of the bundle) and the sidecars that could not be read. `filmsMissing` and `notRead` list names.
 */
export function exportMessage({ path, written, filmsMissing = [], notRead = [] }) {
  const parts = [`Exported ${written} ${plural(written, 'study', 'studies')} to ${path}`];
  if (filmsMissing.length > 0) {
    const n = filmsMissing.length;
    parts.push(`${n} ${plural(n, 'film was', 'films were')} not found and ${plural(n, 'was', 'were')} left out (${filmsMissing.join(', ')})`);
  }
  if (notRead.length > 0) {
    const n = notRead.length;
    parts.push(`${n} ${plural(n, 'sidecar', 'sidecars')} could not be read (${notRead.join(', ')})`);
  }
  return parts.join(' · ');
}
