/**
 * Seeding subject, timepoint and view from a workspace's folder layout and filenames
 * (pre-op/post-op spec §8.1, §8.3, §8.5). Pure: no DOM, no store. screens/workspace.js runs the
 * scan's files through folderRows to build the card's folder table and through seedFields at
 * Load; the tests pin every row of the spec's §8.1 table.
 */
import { normaliseTimepoint, normaliseView, DEFAULT_VIEW } from './timepoints.js';
import { fileStem } from './csv.js';

const STUDY_FIELDS = ['subjectId', 'timepoint', 'filmDate', 'view'];

function parts(path) {
  return String(path ?? '').split(/[\\/]/).filter((part) => part !== '');
}

// The folder segments strictly below the root, in order, without the file itself. The root is
// compared segment by segment, case-insensitively (Windows paths). A film outside the root, or
// with no root at all, has no segments: it reads as sitting in the root, which infers nothing.
export function folderSegments(filePath, root) {
  const file = parts(filePath);
  file.pop();
  const base = parts(root);
  if (base.length === 0 || base.length > file.length) return [];
  for (let i = 0; i < base.length; i += 1) {
    if (file[i].toLowerCase() !== base[i].toLowerCase()) return [];
  }
  return file.slice(base.length);
}

// The folder table's key for a film: its segments joined with '/', or '.' for the root itself.
export function folderKey(filePath, root) {
  const segments = folderSegments(filePath, root);
  return segments.length === 0 ? '.' : segments.join('/');
}

// §8.1 rules 1 and 2 over the folder segments: the LAST segment naming a timepoint and the last
// naming a view supply those; the FIRST segment naming neither supplies the subject.
export function inferFromFolder(segments) {
  let subjectId = null;
  let timepoint = null;
  let view = null;
  for (const segment of segments ?? []) {
    const named = normaliseTimepoint(segment);
    if (named !== null) { timepoint = named; continue; }
    const position = normaliseView(segment);
    if (position !== null) { view = position; continue; }
    if (subjectId === null) subjectId = segment;
  }
  return { subjectId, timepoint, view };
}

// The folder table's row for a folder, derived from its own segments: the inferred timepoint (or
// none) and the inferred view (or Standing lateral). folderRows builds every row through this,
// and seedFields derives the same row when the caller gives none, so the two can never disagree.
function rowForSegments(segments) {
  const inferred = inferFromFolder(segments);
  return { timepoint: inferred.timepoint, view: inferred.view ?? DEFAULT_VIEW };
}

// §8.1 rule 3 over the filename stem. Trailing tokens (separated by -, _ or space) are peeled
// right to left for as long as they name a timepoint or a view. Each pass takes the SHORTEST
// trailing run that names one, so `S001_pre-op` peels `pre-op` (not `op`) and `S001-6-wk` peels
// `6-wk`. Whatever remains, trimmed, is the subject; nothing remaining is no subject. The
// rightmost token of each kind wins.
export function inferFromStem(stem) {
  let rest = String(stem ?? '').trim();
  let timepoint = null;
  let view = null;
  while (rest !== '') {
    const separators = [...rest.matchAll(/[-_ ]+/g)];
    const candidates = separators
      .map((match) => ({ token: rest.slice(match.index + match[0].length), head: rest.slice(0, match.index) }))
      .reverse();
    candidates.push({ token: rest, head: '' });
    let taken = false;
    for (const { token, head } of candidates) {
      if (token === '') continue;
      const named = normaliseTimepoint(token);
      const position = named === null ? normaliseView(token) : null;
      if (named === null && position === null) continue;
      if (named !== null && timepoint === null) timepoint = named;
      if (position !== null && view === null) view = position;
      rest = head;
      taken = true;
      break;
    }
    if (!taken) break;
  }
  const subject = rest.trim();
  return { subjectId: subject === '' ? null : subject, timepoint, view };
}

// One row per folder that directly holds at least one scanned film, in scan order: the folder
// key, the film count, and the timepoint and view the folder's own path names (§8.1 rule 1 over
// ITS segments), the view defaulting to Standing lateral. These are the values the Workspace
// card shows and the user may change before Load (§8.5).
export function folderRows(files, root) {
  const rows = [];
  const byKey = new Map();
  for (const filePath of files ?? []) {
    const key = folderKey(filePath, root);
    let row = byKey.get(key);
    if (!row) {
      row = { folder: key, count: 0, ...rowForSegments(folderSegments(filePath, root)) };
      byKey.set(key, row);
      rows.push(row);
    }
    row.count += 1;
  }
  return rows;
}

function present(value) {
  return value !== null && value !== undefined && value !== '';
}

// §8.3, per field, most specific first: a stored value; else the CSV row's; else the film's own
// stem; else, for timepoint and view, the folder table row (§8.5), which starts at the folder's
// own inferred token and is whatever the user set it to; else null -- view falls to Standing
// lateral. subjectId takes the folder's first plain segment before the stem (§8.1 rules 2–3)
// and has no row step.
//
//   existing  the record already in the library, or null for a new film
//   csv       structuralFromRow's result for the film's CSV row, or null (data/csv.js)
//   row       the folder table row for the film's folder, or null (then inferred from the path)
//
// Returns { fields: {subjectId, timepoint, filmDate, view}, sources: {…} }, each source one of
// 'stored' | 'csv' | 'stem' | 'folder' | 'row' | 'default' | null -- 'default' fires only for a
// row object that carries no view, since a derived row always holds one -- so the load message
// can say how many films had something inferred.
export function seedFields({ filePath, root, existing = null, csv = null, row = null }) {
  const segments = folderSegments(filePath, root);
  const folder = inferFromFolder(segments);
  const stem = inferFromStem(fileStem(filePath));
  const table = row ?? rowForSegments(segments);
  const fields = {};
  const sources = {};
  function pick(name, candidates) {
    for (const [source, value] of candidates) {
      if (present(value)) { fields[name] = value; sources[name] = source; return; }
    }
    fields[name] = null;
    sources[name] = null;
  }
  pick('subjectId', [['stored', existing?.subjectId], ['csv', csv?.subjectId], ['folder', folder.subjectId], ['stem', stem.subjectId]]);
  pick('timepoint', [['stored', existing?.timepoint], ['csv', csv?.timepoint], ['stem', stem.timepoint], ['row', table.timepoint]]);
  pick('filmDate', [['stored', existing?.filmDate], ['csv', csv?.filmDate]]);
  pick('view', [['stored', existing?.view], ['csv', csv?.view], ['stem', stem.view], ['row', table.view], ['default', DEFAULT_VIEW]]);
  return { fields, sources };
}

export { STUDY_FIELDS };
