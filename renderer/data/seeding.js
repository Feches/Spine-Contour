/**
 * Seeding subject, timepoint, film date, view and note from a workspace's folder layout and
 * filenames (pre-op/post-op spec §8.1, §8.3, §8.5). Pure: no DOM, no store. screens/workspace.js
 * runs the scan's files through folderRows to build the card's folder table and through seedFields
 * at Load; screens/studies.js runs a picked or dropped film through seedFields with no root; the
 * tests pin every row of the spec's §8.1 table.
 */
import { normaliseTimepoint, normaliseView, parseFilmDate, DEFAULT_VIEW } from './timepoints.js';
import { fileStem } from './csv.js';

const STUDY_FIELDS = ['subjectId', 'timepoint', 'filmDate', 'view', 'note'];

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

// The film-date forms a filename field can take: M-D-YYYY (Excel's US default with the one
// separator a filename allows) and YYYY-MM-DD, both calendar-checked by parseFilmDate. The US form
// is rewritten to the slashed spelling parseFilmDate reads; the CSV's own rule (spec §8.2, no
// hyphenated US date) is untouched.
function stemDate(field) {
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(field)) return parseFilmDate(field.replace(/-/g, '/'));
  if (/^\d{4}-\d{2}-\d{2}$/.test(field)) return parseFilmDate(field);
  return null;
}

// §8.1 rule 3 over the filename stem (amended 2026-09-11, user decision): underscores separate
// fields; spaces and hyphens inside a field are content, so `post-op`, `post op`, `6 wk` and
// `3-22-2024` are each one field. A field that names a timepoint (§7.2), a view (§7.3) or a date
// (stemDate) supplies that value, in any order, the last of a kind winning. The text before the
// first such field is the subject, verbatim -- `IMG_0001` and `test_lateral x-ray_2` stay whole --
// and when nothing precedes it, the first plain field after it is (`preop_S001`). Every other
// plain field after the first recognised one joins the note, space-separated. A stem with no
// recognised field is all subject; one made only of recognised fields has no subject.
export function inferFromStem(stem) {
  const fields = String(stem ?? '').split('_');
  let timepoint = null;
  let filmDate = null;
  let view = null;
  let first = -1;
  const plain = [];
  fields.forEach((raw, index) => {
    const field = raw.trim();
    if (field === '') return;
    const named = normaliseTimepoint(field);
    const date = named === null ? stemDate(field) : null;
    const position = named === null && date === null ? normaliseView(field) : null;
    if (named !== null) timepoint = named;
    else if (date !== null) filmDate = date;
    else if (position !== null) view = position;
    else if (first !== -1) plain.push(field);
    else return;
    if (first === -1) first = index;
  });
  const head = (first === -1 ? fields : fields.slice(0, first)).join('_').replace(/^[_\s]+|[_\s]+$/g, '');
  const subject = head !== '' ? head : (plain.shift() ?? null);
  return { subjectId: subject, timepoint, filmDate, view, note: plain.length > 0 ? plain.join(' ') : null };
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
// and has no row step. The note has no CSV step: it comes from the stem or the drawer.
//
//   existing  the record already in the library, or null for a new film
//   csv       structuralFromRow's result for the film's CSV row, or null (data/csv.js)
//   row       the folder table row for the film's folder, or null (then inferred from the path)
//
// Returns { fields: {subjectId, timepoint, filmDate, view, note}, sources: {…} }, each source one
// of 'stored' | 'csv' | 'stem' | 'folder' | 'row' | 'default' | null -- 'default' fires only for a
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
  pick('filmDate', [['stored', existing?.filmDate], ['csv', csv?.filmDate], ['stem', stem.filmDate]]);
  pick('view', [['stored', existing?.view], ['csv', csv?.view], ['stem', stem.view], ['row', table.view], ['default', DEFAULT_VIEW]]);
  pick('note', [['stored', existing?.note], ['stem', stem.note]]);
  return { fields, sources };
}

export { STUDY_FIELDS };
