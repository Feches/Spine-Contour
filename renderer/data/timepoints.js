/**
 * Timepoint and view vocabularies (pre-op/post-op spec §7.2, §7.3), the film-date parser (§8.2)
 * and the timepoint sort order. Pure: no DOM, no store, no imports. data/seeding.js reads folder
 * and stem tokens through normaliseTimepoint/normaliseView; data/csv.js normalises CSV values
 * through the same two functions and parseFilmDate; data/parameters.js sorts with
 * compareTimepoints; the clinical drawer offers TIMEPOINT_SUGGESTIONS and VIEW_SUGGESTIONS.
 *
 * A token matches a label only as a WHOLE token: `Preoperative planning` does not match and
 * `Postgraduate` does not match. Separators (-, _, space) inside a token are ignored, so
 * `pre-op`, `pre_op`, `pre op` and `preop` are one token.
 */

export const PRE_OP = 'Pre-op';
export const INTRA_OP = 'Intra-op';
export const POST_OP = 'Post-op';
export const DEFAULT_VIEW = 'Standing lateral';

// The suggestions the drawer offers (§7.2, §7.3). Typing any other label commits it as typed.
export const TIMEPOINT_SUGGESTIONS = Object.freeze([PRE_OP, INTRA_OP, POST_OP, '6 wk', '1 yr', '2 yr']);

// The stored form of a film date; validateStudy nulls anything else with a warning (§7.4).
export const FILM_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Tokens are written squashed: lower-cased with every -, _ and space removed.
const FIXED_TIMEPOINTS = [
  { label: PRE_OP, rank: 0, tokens: ['preop', 'preoperative', 'pre'] },
  { label: INTRA_OP, rank: 1, tokens: ['intraop', 'intraoperative'] },
  { label: POST_OP, rank: 2, tokens: ['postop', 'postoperative', 'post'] },
];

const VIEWS = [
  { label: DEFAULT_VIEW, tokens: ['standing', 'upright', 'erect'] },
  { label: 'Supine lateral', tokens: ['supine'] },
  { label: 'Prone lateral', tokens: ['prone'] },
  { label: 'Flexion lateral', tokens: ['flexion', 'flex'] },
  { label: 'Extension lateral', tokens: ['extension', 'ext'] },
];

export const VIEW_SUGGESTIONS = Object.freeze(VIEWS.map((view) => view.label));

function squash(token) {
  return String(token ?? '').toLowerCase().replace(/[-_\s]+/g, '');
}

// `6wk`, `6 weeks`, `3mo`, `3 months`, `1yr`, `2 years` (squashed): a count, then a unit word.
const DURATION = /^(\d+)(w|wk|wks|week|weeks|m|mo|mos|month|months|y|yr|yrs|year|years)$/;
const UNIT_DAYS = { w: 7, m: 30, y: 365 };
const UNIT_LABEL = { w: 'wk', m: 'mo', y: 'yr' };

function duration(token) {
  const match = DURATION.exec(squash(token));
  if (!match) return null;
  const count = Number(match[1]);
  const unit = match[2][0];
  return { label: `${count} ${UNIT_LABEL[unit]}`, days: count * UNIT_DAYS[unit] };
}

// The known label a token normalises to, or null. A canonical label normalises to itself.
export function normaliseTimepoint(token) {
  const key = squash(token);
  if (key === '') return null;
  const fixed = FIXED_TIMEPOINTS.find((entry) => entry.tokens.includes(key));
  if (fixed) return fixed.label;
  const spell = duration(token);
  return spell ? spell.label : null;
}

export function normaliseView(token) {
  const key = squash(token);
  if (key === '') return null;
  const view = VIEWS.find((entry) => entry.tokens.includes(key) || squash(entry.label) === key);
  return view ? view.label : null;
}

// Sort position of a stored label (§7.2): Pre-op 0, Intra-op 1, Post-op 2, durations 3 (then by
// length in days), any other label 4 (then alphabetically, case-insensitively), no label 5.
export function timepointRank(label) {
  const text = String(label ?? '').trim();
  if (text === '') return { rank: 5, days: 0, text: '' };
  const key = squash(text);
  const fixed = FIXED_TIMEPOINTS.find((entry) => entry.tokens.includes(key));
  if (fixed) return { rank: fixed.rank, days: 0, text: '' };
  const spell = duration(text);
  if (spell) return { rank: 3, days: spell.days, text: '' };
  return { rank: 4, days: 0, text: text.toLowerCase() };
}

export function compareTimepoints(a, b) {
  const ra = timepointRank(a);
  const rb = timepointRank(b);
  if (ra.rank !== rb.rank) return ra.rank - rb.rank;
  if (ra.days !== rb.days) return ra.days - rb.days;
  return ra.text < rb.text ? -1 : ra.text > rb.text ? 1 : 0;
}

// 'YYYY-MM-DD' for the two accepted forms -- ISO, and Excel's US default M/D/YYYY -- else null.
// The calendar is checked: 2025-02-30 is null, not March 2nd. Deliberately no third form and
// never Date.parse, which reads 3/4/2025 differently by locale (spec §16).
export function parseFilmDate(text) {
  const value = String(text ?? '').trim();
  let year;
  let month;
  let day;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    if (!match) return null;
    month = Number(match[1]); day = Number(match[2]); year = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
