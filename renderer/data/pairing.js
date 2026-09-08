/**
 * The paired (wide) export's grouping (pre-op/post-op spec §11.2) and its toast (§11.3). Pure: no
 * DOM, no store. data/csv.js's toPairedCsv writes the text from what pairStudies returns;
 * screens/parameters.js calls pairStudies on every rebuild of the filter bar to decide whether the
 * paired button has anything to write, and again on click to write it.
 *
 * A subject gets a row when it has exactly one Pre-op film and at least one film on a visit the
 * file writes, with exactly one film per such label. Unpaired is judged first (no Pre-op film, or
 * no film on any candidate visit); a subject that could pair but has two films on any label the
 * file writes is ambiguous and gets no row -- a blank cell that meant "two films, neither chosen"
 * is the silent omission the spec forbids, so the row is dropped and the subject named instead.
 * Demo rows are never written and are dropped before anything is counted.
 *
 * Subjects compare by subjectKey (trimmed, lower-cased) and display as the first spelling seen.
 * A written subject's films are a Map keyed by label, never a plain object: a user-typed label
 * can be `constructor` or `toString`, which a plain object answers for before anything is set.
 */
import { subjectKey, ANY_POST } from './parameters.js';
import { PRE_OP, compareTimepoints } from './timepoints.js';

const NAME_CAP = 5;
const ELLIPSIS = '\u2026';
const SEP = ' \u00B7 ';
const COUNT_WORDS = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function timepointOf(study) {
  const label = study?.timepoint;
  return typeof label === 'string' && label.trim() !== '' ? label : null;
}

// The post label the export uses: the `with` label while Paired only is ticked, else All paired.
// A disabled `with` control (the box unticked) does not shape the file (spec §11.2).
export function postFromFilters(filters) {
  const f = filters ?? {};
  const label = typeof f.pairedWith === 'string' ? f.pairedWith : ANY_POST;
  return f.pairedOnly === true && label !== '' && label !== ANY_POST ? label : ANY_POST;
}

/**
 * @typedef {Object} Pairing
 * @property {string[]} visits        later labels that get columns, §7.2 order (empty when nothing is written)
 * @property {string|null} post       the single label, or null under All paired
 * @property {Array<{key: string, subject: string, films: Map<string, Object>}>} subjects
 *                                    one per row written, first-appearance order; films keyed by label, PRE_OP first
 * @property {string[]} unpaired      display subjects, first-appearance order
 * @property {Array<{subject: string, label: string, count: number}>} ambiguous
 * @property {number} noSubject       real rows with no subject
 * @property {number} noTimepoint     real rows with a subject and no timepoint
 * @property {{count: number, labels: string[]}} otherVisits   under a single label only: written subjects' films on other labels
 */

// `rows` are the rows the long export would write (visible, or ticked visible). `post` is a
// timepoint label for the two-visit file, or ANY_POST for one visit per later label present.
export function pairStudies(rows, { post = ANY_POST } = {}) {
  const single = typeof post === 'string' && post !== '' && post !== ANY_POST && post !== PRE_OP ? post : null;
  const real = (rows ?? []).filter((study) => study.source === 'real');

  // Group by subject key in first-appearance order; count the films no group can hold.
  const groups = new Map();
  let noSubject = 0;
  for (const study of real) {
    const key = subjectKey(study);
    if (key === null) { noSubject += 1; continue; }
    let group = groups.get(key);
    if (!group) {
      group = { key, subject: study.subjectId.trim(), films: [] };
      groups.set(key, group);
    }
    group.films.push(study);
  }

  // The candidate visits: the single label, or every label other than Pre-op among the films that
  // have a subject, in §7.2 order.
  let candidates;
  if (single !== null) {
    candidates = [single];
  } else {
    candidates = [];
    for (const group of groups.values()) {
      for (const study of group.films) {
        const label = timepointOf(study);
        if (label !== null && label !== PRE_OP && !candidates.includes(label)) candidates.push(label);
      }
    }
    candidates.sort(compareTimepoints);
  }
  // Every label the file writes -- the ones a duplicate makes a subject ambiguous on.
  const written = [PRE_OP, ...candidates];

  const subjects = [];
  const unpaired = [];
  const ambiguous = [];
  let noTimepoint = 0;
  let otherCount = 0;
  const otherLabels = [];
  for (const group of groups.values()) {
    const byLabel = new Map();
    for (const study of group.films) {
      const label = timepointOf(study);
      if (label === null) { noTimepoint += 1; continue; }
      const list = byLabel.get(label);
      if (list) list.push(study);
      else byLabel.set(label, [study]);
    }
    const later = candidates.filter((label) => byLabel.has(label));
    // Unpaired first: nothing to difference against, or nothing to difference.
    if (!byLabel.has(PRE_OP) || later.length === 0) { unpaired.push(group.subject); continue; }
    const duplicated = written.find((label) => (byLabel.get(label) ?? []).length > 1);
    if (duplicated !== undefined) {
      ambiguous.push({ subject: group.subject, label: duplicated, count: byLabel.get(duplicated).length });
      continue;
    }
    const films = new Map();
    for (const label of [PRE_OP, ...later]) films.set(label, byLabel.get(label)[0]);
    subjects.push({ key: group.key, subject: group.subject, films });
    // Under a single label, a written subject's films on any other label are left out of the
    // file and counted here (§11.3); an unpaired subject's are covered by its own clause.
    if (single !== null) {
      for (const [label, list] of byLabel) {
        if (written.includes(label)) continue;
        otherCount += list.length;
        if (!otherLabels.includes(label)) otherLabels.push(label);
      }
    }
  }
  otherLabels.sort(compareTimepoints);
  // A candidate gets columns only when a written subject has a film on it (§11.2), so a label
  // carried only by unpaired subjects adds no empty group.
  const visits = candidates.filter((label) => subjects.some((row) => row.films.has(label)));

  return {
    visits, post: single, subjects, unpaired, ambiguous, noSubject, noTimepoint,
    otherVisits: { count: otherCount, labels: otherLabels },
  };
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function countWord(count) {
  return COUNT_WORDS[count] ?? String(count);
}

// Up to five names, then an ellipsis (spec §11.3).
function names(list) {
  return list.slice(0, NAME_CAP).join(', ') + (list.length > NAME_CAP ? `, ${ELLIPSIS}` : '');
}

// `two Pre-op films: S003, S011; two 6 wk films: S009` -- grouped by the duplicated label and its
// count in first-appearance order, at most five subjects named across the clause, then an ellipsis.
function ambiguousDetail(entries) {
  const groups = [];
  let named = 0;
  let cut = false;
  for (const entry of entries) {
    if (named >= NAME_CAP) { cut = true; break; }
    const head = `${countWord(entry.count)} ${entry.label} films`;
    let group = groups.find((g) => g.head === head);
    if (!group) { group = { head, subjects: [] }; groups.push(group); }
    group.subjects.push(entry.subject);
    named += 1;
  }
  return groups.map((g) => `${g.head}: ${g.subjects.join(', ')}`).join('; ') + (cut ? `, ${ELLIPSIS}` : '');
}

// The §11.3 toast: what was written, then one clause per thing left out, each only when nonzero.
export function pairedExportMessage(pairing, savedTo) {
  const { subjects, unpaired, ambiguous, noSubject, noTimepoint, otherVisits } = pairing;
  let text = `Exported ${plural(subjects.length, 'subject', 'subjects')} to ${savedTo}`;
  if (unpaired.length > 0) text += `${SEP}${unpaired.length} unpaired (${names(unpaired)})`;
  if (ambiguous.length > 0) text += `${SEP}${ambiguous.length} ambiguous (${ambiguousDetail(ambiguous)})`;
  if (noSubject > 0) text += `${SEP}${plural(noSubject, 'film', 'films')} with no subject`;
  if (noTimepoint > 0) text += `${SEP}${plural(noTimepoint, 'film', 'films')} with no timepoint`;
  if (otherVisits.count > 0) text += `${SEP}${plural(otherVisits.count, 'film', 'films')} of other visits not written (${otherVisits.labels.join(', ')})`;
  return text;
}
