// How a study names itself, and where it came from. Pure string work, no DOM: screens/studies.js
// renders it in the table, and components/ read it too -- which is why this lives in data/ and
// not in screens/ (components import from data/, never from screens/).
import { fileStem } from './csv.js';

const DASH = '\u2014';

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

// The last segment of a path, either separator, with trailing separators ignored.
// 'C:\\Studies\\CohortA\\' -> 'CohortA'. Returns '' for a path with nothing in it.
function lastSegment(path) {
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
