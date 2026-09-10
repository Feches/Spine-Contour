/**
 * Status derivation (spec 13.1, architecture contract "renderer/data/status.js").
 * Status is never stored on a Study — it is computed from measurements and qc
 * every time it is needed. Pure. The residual threshold is measurements.js's,
 * re-exported, so the panel's consistency warning and the list's status can never
 * disagree. (2026-09-10) The review mark IS stored -- `reviewedAt` -- and the derivation reads
 * it: a marked study is `ok` whatever its qc says.
 */

import { piResidual, RESIDUAL_LIMIT } from './measurements.js';

export { RESIDUAL_LIMIT };
export const CONFIDENCE_LIMIT = 0.6;
// Review threshold, not an estimate of measurement accuracy.
export const S1_CONFIDENCE_LIMIT = 0.6;

export function landmarkReviewReasons(qc) {
  const reasons = [];
  if (qc?.coverage?.partial) {
    const missing = Array.isArray(qc.coverage.missing) ? qc.coverage.missing.join(', ') : 'landmarks';
    reasons.push(`Partial segmentation — missing ${missing}. Only available landmarks are measured.`);
  }
  if (qc?.coverage?.unoriented?.length) reasons.push('Anterior/posterior orientation unavailable — only middle disc heights can be measured.');
  if (qc?.femoral?.qc_pass === false) {
    reasons.push(`Femoral measurements unavailable — ${qc.femoral.reason || 'no usable femoral fit'}.`);
  }
  const confidence = qc?.femoral?.confidence;
  if (typeof confidence === 'number' && confidence < CONFIDENCE_LIMIT) {
    reasons.push('Low femoral fit confidence — check the femoral landmarks.');
  }
  const framing = qc?.framing;
  // Older results without framing metadata remain readable. A framing record
  // must include usable scores; missing/invalid scores cannot silently pass.
  if (framing) {
    const weak = (score) => !Number.isFinite(score) || score < S1_CONFIDENCE_LIMIT || score > 1;
    if (weak(framing.s1_confidence)) reasons.push('S1 detection needs review — check the S1 endplate.');
    if (framing.searched && weak(framing.search_confidence)) {
      reasons.push('Spine location needs review — check the crop and vertebral levels.');
    }
  }
  return reasons;
}

export function reviewReasons(study) {
  if (!study?.measurements) return [];
  const reasons = landmarkReviewReasons(study.qc);
  if (piResidual(study.measurements) > RESIDUAL_LIMIT) {
    reasons.unshift('Parameters inconsistent — check S1 and femoral landmarks.');
  }
  return reasons;
}

/** @returns {'seg'|'rev'|'proc'|'ok'} */
export function deriveStatus(study) {
  if (!study || study.measurements == null) return 'proc';
  if (isReviewed(study)) return 'ok';
  return reviewReasons(study).length ? 'rev' : 'seg';
}

// The review mark (studies-table spec 2026-09-10, section 8.1): a non-blank string on the record. It is an
// ISO timestamp -- validateStudy drops anything that is not a date -- but the status asks only
// whether a person set it. It outranks every qc reason (spec 8.2); the reasons themselves stay, and
// the Measurements panel keeps showing them after the review.
export function isReviewed(study) {
  return typeof study?.reviewedAt === 'string' && study.reviewedAt.trim() !== '';
}

// The status a row or a header SHOWS: spec 13.1's "or currently running" half, which is a property
// of state.running and not of the record. deriveStatus stays a pure function of the record; every
// surface that badges a study calls this with state.running, so the list, the summary, the sort
// and the Analysis header cannot disagree.
export function displayStatus(study, runningId = null) {
  return study && runningId !== null && runningId === study.id ? 'proc' : deriveStatus(study);
}

export function statusLabel(status) {
  if (status === 'seg') return 'Segmented';
  if (status === 'rev') return 'Needs review';
  if (status === 'ok') return 'Reviewed';
  return 'Processing';
}

const reviewedDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// The Analysis screen's button once marked (spec 8.3): `Reviewed \u00B7 Sep 10, 2026`, or just `Reviewed`
// when the stored value does not parse. It cannot fail to parse after validateStudy, but the label
// never guesses a date.
export function reviewedLabel(reviewedAt) {
  const time = Date.parse(reviewedAt ?? '');
  return Number.isNaN(time) ? 'Reviewed' : `Reviewed \u00B7 ${reviewedDate.format(new Date(time))}`;
}

export const REVIEW_DEMO = 'Demo studies are not saved';
export const REVIEW_NOTHING = 'Nothing to review yet';
export const REVIEW_RUNNING = 'Wait for the segmentation to finish';
export const REVIEW_PENDING = 'Wait for measurements to finish updating';

// Why the Mark reviewed button is disabled, or null when it is enabled (spec 8.3). In the order the
// screen would otherwise contradict itself: a demo is never saved whatever else is true; a study
// whose run is in flight has no numbers to review yet even when old ones are still on the record;
// no measurements means nothing to review; a pending correction means the numbers are about to
// change. `running` is state.running; `pending` is whether a measurement draft exists for it.
export function reviewBlockedReason({ study, running = null, pending = false }) {
  if (!study) return REVIEW_NOTHING;
  if (study.source === 'demo') return REVIEW_DEMO;
  if (running !== null && running === study.id) return REVIEW_RUNNING;
  if (study.measurements == null) return REVIEW_NOTHING;
  if (pending) return REVIEW_PENDING;
  return null;
}
