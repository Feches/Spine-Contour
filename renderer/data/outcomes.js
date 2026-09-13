/**
 * Outcomes (similar-cases spec, 2026-09-12, section 9). An outcome is a registered pair of clinical
 * fields -- a Yes/No field naming the event and a date field for when it happened -- stored per
 * film like every clinical value and resolved per subject whenever it is read. `Last follow-up`
 * is one more field, shared by every outcome. Stage 1 registers fusion extension: a reoperation
 * that extended the construct, which captures hardware failure, adjacent-segment disease and
 * proximal junctional kyphosis as one mechanical endpoint. Adding another is one entry here.
 * Pure: imports only data/timepoints.js. data/csv.js reads OUTCOME_FIELDS into KNOWN_FIELDS.
 */
import { FILM_DATE, compareTimepoints } from './timepoints.js';

export const OUTCOMES = Object.freeze([
  Object.freeze({
    key: 'fusionExtension', field: 'Fusion extension', dateField: 'Fusion extension date', primary: true,
    cardYes: 'Fusion extended', cardNo: 'Fusion not extended', footer: 'WITH A FUSION EXTENSION',
  }),
]);
export const FOLLOW_UP_FIELD = 'Last follow-up';
export const OUTCOME_FIELDS = Object.freeze([...OUTCOMES.flatMap((o) => [o.field, o.dateField]), FOLLOW_UP_FIELD]);

const SEP = ' \u00B7 ';
const YES = new Set(['yes', 'y', 'true', '1']);
const NO = new Set(['no', 'n', 'false', '0']);

export function primaryOutcome() {
  return OUTCOMES.find((o) => o.primary) ?? OUTCOMES[0];
}

export function isOutcomeField(name) {
  return OUTCOMES.some((o) => o.field === name);
}

export function isOutcomeDateField(name) {
  return name === FOLLOW_UP_FIELD || OUTCOMES.some((o) => o.dateField === name);
}

// The import's and the drawer's write rule (spec 9.2): the common spellings become Yes or No;
// anything else is kept as typed, which then counts as not recorded.
export function normaliseOutcomeValue(text) {
  const trimmed = String(text ?? '').trim();
  const key = trimmed.toLowerCase();
  if (YES.has(key)) return 'Yes';
  if (NO.has(key)) return 'No';
  return trimmed;
}

export function recognisedOutcome(value) {
  return value === 'Yes' || value === 'No' ? value : null;
}

export function recognisedDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return FILM_DATE.test(trimmed) ? trimmed : null;
}

// Labelled films first in pp 7.2 order, then unlabelled ones, so "the first date" is the earliest visit's.
function byTimepoint(a, b) {
  const aNone = a.timepoint == null || a.timepoint === '';
  const bNone = b.timepoint == null || b.timepoint === '';
  if (aNone !== bNone) return aNone ? 1 : -1;
  return aNone ? 0 : compareTimepoints(a.timepoint, b.timepoint);
}

// Spec 9.3, over the films sharing a subject (or one film alone). One entry per registered outcome
// plus the latest follow-up. `conflicting` and `not-recorded` count as unknown everywhere.
export function resolveOutcomes(films, registry = OUTCOMES) {
  const ordered = [...(films ?? [])].sort(byTimepoint);
  const resolved = {};
  for (const outcome of registry) {
    const values = ordered.map((f) => recognisedOutcome(f?.clinical?.[outcome.field])).filter((v) => v !== null);
    let status = 'not-recorded';
    if (values.length > 0) {
      status = values.every((v) => v === 'Yes') ? 'yes' : values.every((v) => v === 'No') ? 'no' : 'conflicting';
    }
    const date = ordered.map((f) => recognisedDate(f?.clinical?.[outcome.dateField])).find((d) => d !== null) ?? null;
    resolved[outcome.key] = { status, date };
  }
  const followUps = ordered.map((f) => recognisedDate(f?.clinical?.[FOLLOW_UP_FIELD])).filter((d) => d !== null).sort();
  resolved.lastFollowUp = followUps.length > 0 ? followUps[followUps.length - 1] : null;
  return resolved;
}

// The card's fourth line (spec 8.2), from the registry entry's own wording.
export function outcomeLine(resolved, outcome = primaryOutcome()) {
  const entry = resolved?.[outcome.key] ?? { status: 'not-recorded', date: null };
  if (entry.status === 'yes') return entry.date ? `${outcome.cardYes}${SEP}${entry.date}` : outcome.cardYes;
  if (entry.status === 'no') return resolved.lastFollowUp ? `${outcome.cardNo}${SEP}last follow-up ${resolved.lastFollowUp}` : outcome.cardNo;
  if (entry.status === 'conflicting') return 'Outcome conflicting';
  return 'Outcome not recorded';
}

// The footer (spec 8.3): a count of recorded facts about the cards on screen, never a rate.
export function footerLine(statuses, outcome = primaryOutcome()) {
  const list = statuses ?? [];
  const yes = list.filter((s) => s === 'yes').length;
  const unknown = list.filter((s) => s === 'not-recorded' || s === 'conflicting').length;
  return `${yes} OF ${list.length} ${outcome.footer}${unknown > 0 ? `${SEP}${unknown} NOT RECORDED` : ''}`;
}
