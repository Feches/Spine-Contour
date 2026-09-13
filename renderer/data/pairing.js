/**
 * The paired (wide) export's grouping (pre-op/post-op spec §11.2, amended 2026-09-11) and its toast
 * (§11.3). Pure: no DOM, no store. data/csv.js's toPairedCsv writes the text from what pairStudies
 * returns; screens/parameters.js calls pairStudies on every rebuild of the filter bar to decide
 * whether the paired button has anything to write, and again on click to write it.
 *
 * A VISIT is one subject's films on one label on one film date. A subject gets a row when it has
 * exactly one Pre-op visit and at least one visit on a label the file writes. Unpaired is judged
 * first (no Pre-op film, or no film on any candidate label). Two films on one visit merge when
 * exactly one of them carries no note: that film is the primary and a noted film (`femoral heads`)
 * only fills the measurements the primary lacks; where both carry a value, the primary's is kept
 * and the column is listed as a disagreement so the toast and the file can say so (user decision
 * 2026-09-11). A merged visit's PI-LL mismatch is derived from its merged PI and LL, so the row
 * agrees with itself, and is flagged as derived across films when the two inputs came from
 * different films (user decision 2026-09-11); every other derived column (disc heights) is read
 * per film. Two same-day films that both lack a note, or both carry one, are ambiguous, as are
 * two Pre-op visits on different dates -- the subject gets no row and is named instead, because a
 * silent choice is the omission the spec forbids. Demo rows are never written and are dropped
 * before anything is counted.
 *
 * A later label's visits are numbered by film date -- `Post-op 1`, `Post-op 2` -- when any written
 * subject has more than one on it, and every subject fills them from its earliest; a label with one
 * visit everywhere keeps its bare name. An undated visit sorts after the dated ones.
 *
 * Subjects compare by subjectKey (trimmed, lower-cased) and display as the first spelling seen.
 * A written subject's visits are a Map keyed by header, never a plain object: a user-typed label
 * can be `constructor` or `toString`, which a plain object answers for before anything is set.
 */
import { subjectKey, ANY_POST } from './parameters.js';
import { PRE_OP, compareTimepoints } from './timepoints.js';
import { MEASUREMENT_COLUMNS, measurementValues, delta1 } from './csv.js';
import { studyName } from './labels.js';

const PI_INDEX = MEASUREMENT_COLUMNS.indexOf('PI');
const LL_INDEX = MEASUREMENT_COLUMNS.indexOf('LL L1-S1');
const MISMATCH_INDEX = MEASUREMENT_COLUMNS.indexOf('PI-LL Mismatch');

const NAME_CAP = 5;
const ELLIPSIS = '…';
const SEP = ' · ';
const COUNT_WORDS = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function timepointOf(study) {
  const label = study?.timepoint;
  return typeof label === 'string' && label.trim() !== '' ? label : null;
}

function noteOf(study) {
  const note = study?.note;
  return typeof note === 'string' && note.trim() !== '' ? note : null;
}

function dateOf(study) {
  const date = study?.filmDate;
  return typeof date === 'string' && date !== '' ? date : null;
}

// The post label the export uses: the `with` label while Paired only is ticked, else All paired.
// A disabled `with` control (the box unticked) does not shape the file (spec §11.2).
export function postFromFilters(filters) {
  const f = filters ?? {};
  const label = typeof f.pairedWith === 'string' ? f.pairedWith : ANY_POST;
  return f.pairedOnly === true && label !== '' && label !== ANY_POST ? label : ANY_POST;
}

/**
 * @typedef {Object} Visit
 * @property {string} header            the column-group name: the label, or `<label> N` when numbered
 * @property {string} label             the stored timepoint label
 * @property {string|null} filmDate     the visit's date
 * @property {Object[]} films           the films merged into it, the primary (unnoted) film first
 * @property {Array<number|''>} values  one per MEASUREMENT_COLUMNS entry: the primary's, else the first film's that has one
 * @property {string[]} disagreements   measurement columns where two of its films carried different values
 * @property {Array<{column: string, note: string}>} derived
 *                                      columns derived from inputs of different films (`PI-LL Mismatch`), the note
 *                                      naming which film supplied each input
 */

/**
 * @typedef {Object} Pairing
 * @property {string[]} visits        headers of the later visits that get columns, §7.2 label order then date order
 * @property {string|null} post       the single label, or null under All paired
 * @property {Array<{key: string, subject: string, visits: Map<string, Visit>}>} subjects
 *                                    one per row written, first-appearance order; visits keyed by header, PRE_OP first
 * @property {string[]} unpaired      display subjects, first-appearance order
 * @property {Array<{subject: string, label: string, count: number, kind: 'films'|'visits'}>} ambiguous
 * @property {number} noSubject       real rows with no subject
 * @property {number} noTimepoint     real rows with a subject and no timepoint
 * @property {{count: number, labels: string[]}} otherVisits   under a single label only: written subjects' films on other labels
 * @property {Array<{subject: string, header: string, films: number}>} merged          visits built from more than one film
 * @property {Array<{subject: string, header: string, columns: string[]}>} disagreements  merged visits whose films disagreed
 * @property {Array<{subject: string, header: string, columns: string[]}>} derived        merged visits with a value derived across films
 */

// One subject's films on one label, grouped by film date in first-appearance order, each group a
// visit with its primary film first -- or the ambiguity that stops the subject being written.
function visitsOnLabel(label, films) {
  const groups = new Map();
  for (const study of films) {
    const key = dateOf(study) ?? '';
    const list = groups.get(key);
    if (list) list.push(study);
    else groups.set(key, [study]);
  }
  const visits = [];
  for (const [key, list] of groups) {
    let ordered = list;
    if (list.length > 1) {
      const primaries = list.filter((study) => noteOf(study) === null);
      if (primaries.length !== 1) return { visits: [], ambiguous: { count: list.length, kind: 'films' } };
      ordered = [primaries[0], ...list.filter((study) => study !== primaries[0])];
    }
    visits.push({ label, filmDate: key === '' ? null : key, films: ordered });
  }
  visits.sort((a, b) => {
    if (a.filmDate === b.filmDate) return 0;
    if (a.filmDate === null) return 1;
    if (b.filmDate === null) return -1;
    return a.filmDate < b.filmDate ? -1 : 1;
  });
  return { visits, ambiguous: null };
}

// The visit's merged measurement values: per column, the first film's value in primary-first
// order, so the primary's stands wherever it has one; any two films carrying different values
// for a column list it. A merged visit's PI-LL mismatch is then re-derived from the merged PI and
// LL over the written one-decimal values (the delta rule), so the three cells agree to the digit
// whichever films they came from; when PI and LL came from different films the column is flagged
// as derived across films, with the film behind each input named. Disc heights are read per film.
function mergeVisit(visit) {
  const perFilm = visit.films.map((study) => measurementValues(study));
  const values = [];
  const sources = [];
  const disagreements = [];
  MEASUREMENT_COLUMNS.forEach((column, index) => {
    const present = perFilm
      .map((row, film) => ({ value: row[index], film }))
      .filter((entry) => entry.value !== '' && entry.value != null);
    values.push(present.length > 0 ? present[0].value : '');
    sources.push(present.length > 0 ? present[0].film : null);
    if (present.some((entry) => entry.value !== present[0].value)) disagreements.push(column);
  });
  const derived = [];
  if (visit.films.length > 1 && values[PI_INDEX] !== '' && values[LL_INDEX] !== '') {
    values[MISMATCH_INDEX] = delta1(values[LL_INDEX], values[PI_INDEX]);
    if (sources[PI_INDEX] !== sources[LL_INDEX]) {
      derived.push({
        column: MEASUREMENT_COLUMNS[MISMATCH_INDEX],
        // Films are named as everywhere else (the stem); the record id is never shown (2026-09-12).
        note: `PI from ${studyName(visit.films[sources[PI_INDEX]])}, LL L1-S1 from ${studyName(visit.films[sources[LL_INDEX]])}`,
      });
    }
  }
  return { ...visit, values, disagreements, derived };
}

// `rows` are the rows the long export would write (visible, or ticked visible). `post` is a
// timepoint label for the two-visit file, or ANY_POST for the visits of every later label present.
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

  // The candidate labels: the single label, or every label other than Pre-op among the films that
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
  const writtenLabels = [PRE_OP, ...candidates];

  const judged = [];
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
    // Then each written label the subject has films on, in written order: the first ambiguity
    // names the subject and stops.
    const visitsByLabel = new Map();
    let problem = null;
    for (const label of [PRE_OP, ...later]) {
      const result = visitsOnLabel(label, byLabel.get(label));
      if (result.ambiguous !== null) { problem = { subject: group.subject, label, ...result.ambiguous }; break; }
      if (label === PRE_OP && result.visits.length > 1) {
        problem = { subject: group.subject, label, count: result.visits.length, kind: 'visits' };
        break;
      }
      visitsByLabel.set(label, result.visits.map(mergeVisit));
    }
    if (problem !== null) { ambiguous.push(problem); continue; }
    judged.push({ key: group.key, subject: group.subject, visitsByLabel });
    // Under a single label, a written subject's films on any other label are left out of the
    // file and counted here (§11.3); an unpaired subject's are covered by its own clause.
    if (single !== null) {
      for (const [label, list] of byLabel) {
        if (writtenLabels.includes(label)) continue;
        otherCount += list.length;
        if (!otherLabels.includes(label)) otherLabels.push(label);
      }
    }
  }
  otherLabels.sort(compareTimepoints);

  // A candidate gets columns only when a written subject has a visit on it (§11.2), so a label
  // carried only by unpaired subjects adds no empty group; it gets as many groups as the most
  // visits any written subject has on it, numbered when that is more than one.
  const headersByLabel = new Map();
  const visits = [];
  for (const label of candidates) {
    const most = judged.reduce((max, row) => Math.max(max, (row.visitsByLabel.get(label) ?? []).length), 0);
    if (most === 0) continue;
    const headers = most === 1 ? [label] : Array.from({ length: most }, (_, i) => `${label} ${i + 1}`);
    headersByLabel.set(label, headers);
    visits.push(...headers);
  }

  const merged = [];
  const disagreements = [];
  const derived = [];
  const subjects = judged.map((row) => {
    const map = new Map();
    const pre = row.visitsByLabel.get(PRE_OP)[0];
    map.set(PRE_OP, { header: PRE_OP, ...pre });
    for (const label of candidates) {
      const headers = headersByLabel.get(label) ?? [];
      (row.visitsByLabel.get(label) ?? []).forEach((visit, i) => map.set(headers[i], { header: headers[i], ...visit }));
    }
    for (const visit of map.values()) {
      if (visit.films.length > 1) merged.push({ subject: row.subject, header: visit.header, films: visit.films.length });
      if (visit.disagreements.length > 0) disagreements.push({ subject: row.subject, header: visit.header, columns: visit.disagreements });
      if (visit.derived.length > 0) derived.push({ subject: row.subject, header: visit.header, columns: visit.derived.map((entry) => entry.column) });
    }
    return { key: row.key, subject: row.subject, visits: map };
  });

  return {
    visits, post: single, subjects, unpaired, ambiguous, noSubject, noTimepoint,
    otherVisits: { count: otherCount, labels: otherLabels },
    merged, disagreements, derived,
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

// `two Pre-op films: S003, S011; two 6 wk films: S009; two Pre-op visits: S010` -- grouped by the
// duplicated label, count and kind in first-appearance order, at most five subjects named across
// the clause, then an ellipsis. `kind` is 'films' (same day) or 'visits' (two Pre-op dates).
function ambiguousDetail(entries) {
  const groups = [];
  let named = 0;
  let cut = false;
  for (const entry of entries) {
    if (named >= NAME_CAP) { cut = true; break; }
    const head = `${countWord(entry.count)} ${entry.label} ${entry.kind === 'visits' ? 'visits' : 'films'}`;
    let group = groups.find((g) => g.head === head);
    if (!group) { group = { head, subjects: [] }; groups.push(group); }
    group.subjects.push(entry.subject);
    named += 1;
  }
  return groups.map((g) => `${g.head}: ${g.subjects.join(', ')}`).join('; ') + (cut ? `, ${ELLIPSIS}` : '');
}

// `sub225 Pre-op: 2 films, sub226 Post-op 1: 3 films` -- at most five, then an ellipsis.
function mergedDetail(entries) {
  return names(entries.map((entry) => `${entry.subject} ${entry.header}: ${entry.films} films`));
}

const COLUMN_CAP = 3;

// `sub225 Pre-op: SS; sub226 Post-op 1: PI, PT` -- at most five visits, then an ellipsis, and at
// most three columns per visit, then `+N more`: the file's disagreements cell carries them all,
// and a toast naming seventeen disc-height columns for one visit says less than the count does.
// The derived-across-films clause uses the same shape.
function disagreementDetail(entries) {
  const shown = entries.slice(0, NAME_CAP).map((entry) => {
    const columns = entry.columns.slice(0, COLUMN_CAP).join(', ');
    const more = entry.columns.length - COLUMN_CAP;
    return `${entry.subject} ${entry.header}: ${columns}${more > 0 ? `, +${more} more` : ''}`;
  });
  return shown.join('; ') + (entries.length > NAME_CAP ? `; ${ELLIPSIS}` : '');
}

// The §11.3 toast: what was written, how it was merged, then one clause per thing left out, each
// only when nonzero. A pairing from before merging existed carries none of the three merge lists.
export function pairedExportMessage(pairing, savedTo) {
  const { subjects, unpaired, ambiguous, noSubject, noTimepoint, otherVisits, merged = [], disagreements = [], derived = [] } = pairing;
  let text = `Exported ${plural(subjects.length, 'subject', 'subjects')} to ${savedTo}`;
  if (merged.length > 0) text += `${SEP}${plural(merged.length, 'merged visit', 'merged visits')} (${mergedDetail(merged)})`;
  const differing = disagreements.reduce((sum, entry) => sum + entry.columns.length, 0);
  if (differing > 0) {
    text += `${SEP}${plural(differing, 'disagreement', 'disagreements')}, the unnoted film's ${differing === 1 ? 'value' : 'values'} kept (${disagreementDetail(disagreements)})`;
  }
  const crossFilm = derived.reduce((sum, entry) => sum + entry.columns.length, 0);
  if (crossFilm > 0) text += `${SEP}${plural(crossFilm, 'value', 'values')} derived across films (${disagreementDetail(derived)})`;
  if (unpaired.length > 0) text += `${SEP}${unpaired.length} unpaired (${names(unpaired)})`;
  if (ambiguous.length > 0) text += `${SEP}${ambiguous.length} ambiguous (${ambiguousDetail(ambiguous)})`;
  if (noSubject > 0) text += `${SEP}${plural(noSubject, 'film', 'films')} with no subject`;
  if (noTimepoint > 0) text += `${SEP}${plural(noTimepoint, 'film', 'films')} with no timepoint`;
  if (otherVisits.count > 0) text += `${SEP}${plural(otherVisits.count, 'film', 'films')} of other visits not written (${otherVisits.labels.join(', ')})`;
  return text;
}
