// How a study names itself, and where it came from. Pure string work, no DOM: screens/studies.js
// renders it in the table, and components/ read it too -- which is why this lives in data/ and
// not in screens/ (components import from data/, never from screens/). No imports: data/csv.js
// imports studyName for the exports (2026-09-12), so fileStem lives here and csv.js re-exports it.

const DASH = '\u2014';

// Basename (either separator) without its last extension: 'a.b.dcm' \u2192 'a.b', 'noext' \u2192 'noext'.
// A leading dot is not an extension ('.hidden' \u2192 '.hidden'). The CSV import joins a row to a
// film by this stem, and the export's Study ID column writes it, so the two agree by construction.
export function fileStem(name) {
  const base = String(name).split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

// The default display name for a new study: its film's filename without the extension.
// The SP-nnnn id stays the record's identity -- it names the sidecar on disk, keys the delete
// and the CSV join, and must keep matching /^SP-\d{4,}$/. This is only what a human reads.
export function defaultName(fileName) {
  const stem = fileStem(fileName ?? '');
  return stem.trim() === '' ? null : stem;
}

// What to show wherever a study is named.
//
// Three steps, and the middle one is why no migration is needed: a record saved before `name`
// existed still carries `fileName`, so it reads as its film's name from the first launch after
// this change rather than sitting there as SP-nnnn until someone renames it. The stored `name`
// only has to exist for records the user has actually renamed. The id is the last resort, for a
// record with no usable filename at all.
export function studyName(study) {
  if (!study) return DASH;
  if (typeof study.name === 'string' && study.name.trim() !== '') return study.name;
  return defaultName(study.fileName) ?? study.id;
}

// The last segment of a path, either separator, with trailing separators ignored. Exported for
// data/parameters.js, which labels a workspace root the same way workspaceLabel labels a study.
export function lastSegment(path) {
  const parts = String(path).split(/[\\/]/).filter((part) => part !== '');
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

// The workspace the study was loaded from, or an em dash. Only films that came in through a
// workspace load carry one: a film added with the picker or dropped on the list has no
// workspace, and saying so is the point -- an em dash here means "I added this one by hand".
export function workspaceLabel(study) {
  if (!study || typeof study.workspaceFolder !== 'string') return DASH;
  return lastSegment(study.workspaceFolder) || DASH;
}

// The folder the film itself sits in. Derived from filePath, so it works for every real study
// including ones added by hand, and for older records that predate `workspaceFolder`. For a
// film the recursive scan found below the workspace root this is the SUBfolder, which is the
// pair's whole point: two films called the same thing under CohortA/pre-op and CohortB/pre-op
// are told apart by the two cells together.
export function folderLabel(study) {
  if (!study || typeof study.filePath !== 'string' || study.filePath === '') return DASH;
  const parts = study.filePath.split(/[\\/]/).filter((part) => part !== '');
  // parts.pop() is the file itself; what is left is its directory.
  parts.pop();
  return parts.length > 0 ? parts[parts.length - 1] : DASH;
}

// The full path, for a title tooltip. Null when there is nothing useful to say.
export function pathTitle(study) {
  return study && typeof study.filePath === 'string' && study.filePath !== '' ? study.filePath : null;
}

// The SUBJECT cell (studies-table spec 2026-09-10, section 7.1): the record's subject id, else the demo
// record's patient label -- `pt` exists only on the nine compiled-in records -- else an em dash. A
// real study with no subject shows the dash, and the Find tab's editor opens empty for it.
export function subjectLabel(study) {
  if (!study) return DASH;
  if (typeof study.subjectId === 'string' && study.subjectId.trim() !== '') return study.subjectId;
  if (typeof study.pt === 'string' && study.pt.trim() !== '') return study.pt;
  return DASH;
}
